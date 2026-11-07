"use client";
import { apiUrl, authFetch } from "@/lib/api";
/**
 * ChatView — pola visual OpenBot (D:\projects\openbot):
 * pesan agent = teks polos + gutter wajah + nama muted; user = bubble terang rata kanan;
 * tool = langkah senyap yang bisa dilipat; delegasi = baris subagent; approval = kartu tenang.
 * Logika event tetap dari page.tsx (semua tipe @yuika/contracts).
 * DS-1: Tailwind semantik + komponen ui/* — tanpa CSS kustom (docs/DESIGN-SYSTEM.md).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PersonaState } from "@yuika/contracts";
import {
  Brain,
  CaretDown,
  ChatTeardropText,
  Lightning,
  PaperPlaneTilt,
  PauseCircle,
  PlayCircle,
  PencilSimple,
  Prohibit,
  Steps,
  Stop,
  ArrowsInLineVertical,
  Wrench,
} from "@phosphor-icons/react";
import { PersonaFace } from "./PersonaPicker";
import { toastErr } from "./ui/toast";
import { Markdown } from "./Markdown";
import { Button, StateChip, STATE_LABEL } from "./ui";
import { WorkflowRunBar } from "./WorkflowRunBar";
import type { RunDetail, RunSummary } from "./useWorkflowRun";

/** Satu composer, makna menurut konteks (keputusan user 2026-11-08 tahap 2):
 *  run hidup → steer · toggle Workflow Mode nyala → brief · selain itu chat biasa. */
export interface WorkflowChatCtx {
  armed: boolean;
  activeRun: RunSummary | null;
  lastRun: RunSummary | null;
  run: RunDetail | null;
  onToggleArmed: () => void;
  onAction: (path: string, body?: unknown) => Promise<boolean>;
  /** Kirim pesan sbg brief run baru / instruksi steer run aktif. */
  onSendWorkflow: (text: string, mode: "brief" | "steer") => Promise<void>;
}

export interface ChatItem {
  kind:
    | "msg"
    | "activity"
    | "delegation"
    | "approval"
    | "vault"
    | "takeover"
    | "error"
    | "noted"
    | "skill"
    | "compressed"
    | "reasoning";
  // msg
  role?: "user" | "assistant";
  text?: string;
  streaming?: boolean;
  // reasoning (fix dev-10: pikiran model streaming — kolaps-able)
  reasoningOpen?: boolean;
  // activity (tool)
  name?: string;
  callId?: string;
  detail?: string;
  isError?: boolean;
  done?: boolean;
  // delegation
  personaId?: string;
  childSessionId?: string;
  goal?: string;
  childState?: PersonaState;
  /** Feed live anak (delegation.delta) — streaming saat delegasi berjalan. */
  liveText?: string;
  liveKind?: "text" | "reasoning" | "tool";
  /** P1-DEL-3: anak di-pause — menunggu resume (chip + tombol jadi Resume). */
  paused?: boolean;
  // approval
  requestId?: string;
  reason?: string;
  resolved?: "approved" | "denied" | "expired" | null;
  // vault (Batch 12): kartu protected — nilai TIDAK pernah di item/event;
  // user mengisi via REST fill langsung dari kartu.
  vkind?: "api_key" | "command";
  originHint?: string;
  saved?: boolean;
  vresolved?: "filled" | "skipped" | "expired" | null;
  // takeover (Batch 14a SCR-4): persona minta kontrol screen — non-blocking.
  tresolved?: "granted" | "denied" | "expired" | null;
  // noted (P1-MEM-2: hasil learn nudge)
  scope?: "user" | "project";
  // compressed (P0-CORE-4: chip transparansi kompresi konteks)
  n?: number;
  before?: number;
  after?: number;
}

export { STATE_LABEL };

/** Batch 12 (D27): input nilai rahasia — uncontrolled (nilai hanya dibaca saat
 *  submit lalu input di-clear) + toggle "Save to Vault" (off = run-only).
 *  Nilai dikirim LANGSUNG ke POST /api/vault/fill/:id — tidak pernah masuk
 *  state React / event / chat. */
function VaultFillCard({ requestId }: { requestId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const v = ref.current?.value ?? "";
    if (!v.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await authFetch(
        apiUrl(`/api/vault/fill/${encodeURIComponent(requestId)}`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: v, save }),
        },
      );
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      // resolved text datang via event vault.resolved; clear input segera
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (ref.current) ref.current.value = ""; // DOM-side clear (pola rokazo)
      setBusy(false);
    }
  };

  const skip = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await authFetch(
        apiUrl(`/api/vault/fill/${encodeURIComponent(requestId)}/skip`),
        { method: "POST" },
      );
    } catch {
      /* race dengan deadline — biarkan event resolved yang mengakhiri */
    } finally {
      if (ref.current) ref.current.value = "";
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-2">
      <input
        ref={ref}
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder="Paste the secret value"
        className="w-full rounded-md2 border border-line bg-surface px-2.5 py-1.5 font-mono text-caption text-primary placeholder:text-dim focus:border-accent focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
      />
      <label className="flex cursor-pointer items-center gap-2 text-caption text-muted select-none">
        <input
          type="checkbox"
          checked={save}
          onChange={(e) => setSave(e.target.checked)}
          className="accent-[var(--c-accent)]"
        />
        Save to Vault (uncheck = use once for this run, deleted when the turn ends)
      </label>
      {err && <p className="text-caption text-danger">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => void submit()} disabled={busy}>
          {busy ? "Sending…" : "Send securely"}
        </Button>
        <Button size="sm" onClick={() => void skip()} disabled={busy}>
          Skip
        </Button>
      </div>
      <p className="text-caption text-dim">
        The value is encrypted and never appears in this chat, the trace, or the
        model context.
      </p>
    </div>
  );
}

function Chevron({ size = 12 }: { size?: number }) {
  return (
    <CaretDown
      size={size}
      aria-hidden
      className="transition-transform ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)]"
    />
  );
}

export function ChatView({
  items,
  personaState,
  personaId,
  personaName,
  onSend,
  onCancel,
  onApprove,
  onOpenDelegation,
  busy,
  emptySlot,
  approvalMode,
  onToggleApprovalMode,
  workflow,
  onWatchScreen,
}: {
  items: ChatItem[];
  personaState: PersonaState;
  personaId: string;
  personaName: string;
  onSend: (text: string) => void;
  /** P0-CORE-1: tombol Stop — batalkan turn aktif (progres tersimpan). */
  onCancel?: () => void;
  /** Konten state kosong (hero + saran) — composer tetap tampil, user bisa langsung menulis. */
  emptySlot?: ReactNode;
  onApprove: (requestId: string, approved: boolean, remember?: boolean) => void;
  /** Klik kartu delegasi → buka sesi persona anak (fix 2026-11 user). */
  onOpenDelegation?: (childSessionId: string) => void;
  /** Fix dev-10: mode cepat — "auto" = write_file & run_command bebas-approval. */
  approvalMode?: "ask" | "auto";
  onToggleApprovalMode?: () => void;
  /** Konteks workflow utk composer conductor (null = chat biasa). */
  workflow?: WorkflowChatCtx | null;
  /** Buka floating live screen persona (kartu takeover — SCR-3 follow-up). */
  onWatchScreen?: (personaId: string) => void;
  busy: boolean;
}) {
  const [input, setInput] = useState("");
  // P0-DEL-2: kontrol delegasi aktif — steer input per kartu + cancel.
  const [steerOpenFor, setSteerOpenFor] = useState<string | null>(null);
  const [steerText, setSteerText] = useState("");
  async function sendSteer(childSessionId: string) {
    const text = steerText.trim();
    if (!text) return;
    try {
      const r = await authFetch(apiUrl(`/api/delegations/${childSessionId}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "steer", text }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        toastErr(body.error ?? "could not send the steering note");
        return;
      }
      setSteerOpenFor(null);
      setSteerText("");
    } catch {
      toastErr("could not reach the server");
    }
  }
  async function cancelDelegation(childSessionId: string) {
    try {
      const r = await authFetch(apiUrl(`/api/delegations/${childSessionId}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        toastErr(body.error ?? "could not cancel");
      }
    } catch {
      toastErr("could not reach the server");
    }
  }
  async function pauseDelegation(childSessionId: string, pause: boolean) {
    try {
      const r = await authFetch(apiUrl(`/api/delegations/${childSessionId}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: pause ? "pause" : "resume" }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        toastErr(
          body.error ?? (pause ? "could not pause" : "could not resume"),
        );
      }
    } catch {
      toastErr("could not reach the server");
    }
  }
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll: MOUNT/switch sesi → selalu ke bawah; setelah itu hanya bila user
  // memang di dekat bawah (tidak mencuri scroll saat user membaca ke atas).
  const stickRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [items, personaState]);

  // Textarea auto-grow
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  // Tool steps TIDAK lagi dirender di chat (user 2026-11 #8) — observability
  // langkah kerja ada di tab Logs (Session Trace, realtime). items activity
  // tetap terkumpul (dipakai indikator dot tab Chat/Team).
  const steps = items.filter((it) => it.kind === "activity");
  const rest = items.filter((it) => it.kind !== "activity");
  const showTyping = personaState === "thinking" || personaState === "working";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    // satu composer, makna menurut konteks: run hidup → steer; toggle
    // Workflow Mode nyala → brief; selain itu turn chat biasa.
    if (workflow) {
      if (workflow.activeRun) {
        void workflow.onSendWorkflow(text, "steer");
        setInput("");
        return;
      }
      if (workflow.armed) {
        void workflow.onSendWorkflow(text, "brief");
        setInput("");
        return;
      }
    }
    onSend(text);
    setInput("");
  }

  return (
    <>
      <div
        className="min-h-0 flex-1 scroll-smooth overflow-y-auto px-4 my-4 sm:px-6 sm:my-6"
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (el)
            stickRef.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 160;
        }}
      >
        <div className="mx-auto flex w-full flex-col gap-3">
          {items.length === 0 && emptySlot ? (
            <div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
              {emptySlot}
            </div>
          ) : null}
          {rest.map((it, i) => {
            if (it.kind === "msg" && it.role === "user") {
              return (
                <div key={`r${i}`} className="msg-in flex justify-end">
                  <div className="max-w-[80%] rounded-bubble bg-[var(--yui-surface-light)] px-3.5 py-2 leading-relaxed whitespace-pre-wrap break-words text-body text-onlight">
                    {it.text}
                  </div>
                </div>
              );
            }
            if (it.kind === "msg") {
              return (
                <div
                  key={`r${i}`}
                  className="msg-in grid grid-cols-[36px_minmax(0,1fr)] gap-x-3"
                >
                  <span className="col-start-1 self-end">
                    <PersonaFace personaId={personaId} size={28} />
                  </span>
                  <div className="col-start-2 px-3 text-caption text-muted">
                    {personaName}
                  </div>
                  <div className="col-start-2 px-3 leading-relaxed whitespace-pre-wrap break-words text-body text-primary">
                    <Markdown text={it.text ?? ""} />
                    {it.streaming ? <span className="caret-blink" /> : null}
                  </div>
                </div>
              );
            }
            if (it.kind === "delegation") {
              const openChild =
                onOpenDelegation && it.childSessionId
                  ? () => onOpenDelegation(it.childSessionId!)
                  : undefined;
              return (
                <div
                  key={`r${i}`}
                  className="msg-in grid grid-cols-[36px_minmax(0,1fr)] gap-x-3"
                >
                  <span className="col-start-1 pt-1">
                    <PersonaFace
                      personaId={it.personaId ?? "yui-scholar"}
                      size={28}
                    />
                  </span>
                  <div
                    className={`col-start-2 rounded-card border bg-surface px-4 py-3 ${
                      openChild
                        ? "cursor-pointer border-line transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:border-line-strong hover:shadow-card"
                        : "border-line"
                    }`}
                    onClick={openChild}
                    title={
                      openChild ? "Open this persona's session" : undefined
                    }
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-body font-semibold text-primary">
                        Delegation · {it.personaId?.replace("yui-", "")}
                      </b>
                      {it.childState ? (
                        <StateChip state={it.childState} />
                      ) : null}
                      {it.paused ? (
                        <span className="rounded-pill border border-line bg-hover px-2 py-px text-caption text-dim">
                          Paused
                        </span>
                      ) : null}
                      {/* P0-DEL-2: kontrol anak saat masih bekerja (belum ada ringkasan). */}
                      {!it.text && (
                        <span className="ml-auto flex items-center gap-1">
                          {steerOpenFor === it.childSessionId ? (
                            <span className="flex items-center gap-1">
                              <input
                                autoFocus
                                value={steerText}
                                onChange={(e) => setSteerText(e.target.value)}
                                onKeyDown={(e) => {
                                  e.stopPropagation();
                                  if (e.key === "Enter" && steerText.trim())
                                    void sendSteer(it.childSessionId!);
                                  if (e.key === "Escape") {
                                    setSteerOpenFor(null);
                                    setSteerText("");
                                  }
                                }}
                                placeholder="Mid-turn steer…"
                                aria-label="Mid-turn steer for the child"
                                className="h-7 w-56 rounded-md2 border border-line bg-surface px-2.5 text-caption text-primary outline-none placeholder:text-dim focus:border-accent"
                              />
                              <button
                                type="button"
                                title="Send steering note"
                                aria-label="Send steering note"
                                disabled={!steerText.trim()}
                                className="flex size-7 cursor-pointer items-center justify-center rounded-md2 border border-line bg-control text-secondary transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:border-line-strong hover:text-primary disabled:cursor-default disabled:opacity-40"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (steerText.trim())
                                    void sendSteer(it.childSessionId!);
                                }}
                              >
                                <PaperPlaneTilt size={12} aria-hidden />
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              title="Steer (mid-turn)"
                              aria-label="Steer child"
                              className="flex size-7 cursor-pointer items-center justify-center rounded-md2 text-dim transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:bg-hover hover:text-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSteerOpenFor(it.childSessionId ?? null);
                                setSteerText("");
                              }}
                            >
                              <ChatTeardropText size={14} aria-hidden />
                            </button>
                          )}
                          <button
                            type="button"
                            title={
                              it.paused
                                ? "Resume delegation"
                                : "Pause delegation (stops at next iteration boundary)"
                            }
                            aria-label={
                              it.paused
                                ? "Resume delegation"
                                : "Pause delegation"
                            }
                            className="flex size-7 cursor-pointer items-center justify-center rounded-md2 text-dim transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:bg-hover hover:text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              void pauseDelegation(
                                it.childSessionId!,
                                !it.paused,
                              );
                            }}
                          >
                            {it.paused ? (
                              <PlayCircle size={14} aria-hidden />
                            ) : (
                              <PauseCircle size={14} aria-hidden />
                            )}
                          </button>
                          <button
                            type="button"
                            title="Cancel delegation"
                            aria-label="Cancel delegation"
                            className="flex size-7 cursor-pointer items-center justify-center rounded-md2 text-dim transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:bg-danger-soft hover:text-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              void cancelDelegation(it.childSessionId!);
                            }}
                          >
                            <Prohibit size={14} aria-hidden />
                          </button>
                        </span>
                      )}
                    </div>
                    {it.goal ? (
                      <p className="mt-0.5 text-body text-muted">{it.goal}</p>
                    ) : null}
                    {it.liveText && !it.text ? (
                      <div
                        className={`mt-2 flex items-start gap-2 rounded-md2 border border-accent/25 bg-accent-soft/60 px-2.5 py-1.5 ${it.liveKind === "reasoning" ? "opacity-85 italic" : ""}`}
                      >
                        <span
                          aria-hidden
                          className="mt-1.5 size-1.5 shrink-0 animate-pulse rounded-full bg-accent"
                        />
                        <span
                          className={`line-clamp-4 break-words text-caption leading-5 ${it.liveKind === "tool" ? "font-mono" : "text-secondary"}`}
                        >
                          {it.liveText}
                        </span>
                      </div>
                    ) : null}
                    {it.text ? (
                      <div className="mt-2 border-t border-line pt-2 text-body text-secondary">
                        <Markdown text={it.text} />
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            }
            if (it.kind === "reasoning") {
              // Fix dev-10: pikiran model streaming (reasoning_content GLM) —
              // panggilan 2–9 menit kini "hidup". Kolaps-able; tampilkan ekor
              // (pikiran terbaru) supaya DOM ringan walau reasoning panjang.
              const full = it.text ?? "";
              const shown =
                full.length > 2000 ? `… ${full.slice(-2000)}` : full;
              return (
                <details
                  key={`r${i}`}
                  className="my-0.5 border-l-2 border-line-strong pl-2 text-caption text-muted [&[open]_summary_svg]:rotate-180"
                  open={it.streaming}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-1 text-secondary select-none [&::-webkit-details-marker]:hidden">
                    <Chevron size={10} />
                    <Brain size={12} aria-hidden />
                    Thinking{it.streaming ? "…" : ""}{" "}
                    <span className="text-muted">
                      ({full.length.toLocaleString("en-GB")} chars)
                    </span>
                  </summary>
                  <pre className="mt-1 max-h-[300px] overflow-auto font-mono text-xs break-words whitespace-pre-wrap">
                    {shown}
                  </pre>
                </details>
              );
            }
            if (it.kind === "approval") {
              return (
                <div
                  key={`r${i}`}
                  className="msg-in grid grid-cols-[36px_minmax(0,1fr)] gap-x-3"
                >
                  <div className="col-start-2 rounded-card border border-line-strong border-l-2 border-l-warn bg-warn-soft px-4 py-3">
                    <b className="text-body font-medium text-primary">
                      Perlu persetujuan ·{" "}
                      <code className="font-mono text-caption">{it.name}</code>
                    </b>
                    <p className="mt-0.5 text-caption text-muted">
                      {it.reason}
                    </p>
                    {it.resolved ? (
                      <p className="mt-2 text-caption text-muted">
                        {it.resolved === "approved"
                          ? "Approved"
                          : it.resolved === "expired"
                            ? "Expired — the server restarted while waiting"
                            : "Rejected"}
                      </p>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => onApprove(it.requestId!, true, true)}
                          title="Approve and allow this tool for the rest of the session (recommended)"
                        >
                          Approve &amp; remember
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => onApprove(it.requestId!, true)}
                        >
                          Approve once
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => onApprove(it.requestId!, false)}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            if (it.kind === "vault") {
              // Batch 12 (D27): kartu protected — nilai dikirim LANGSUNG ke REST
              // fill (bukan lewat chat/event); input di-clear DOM-side saat submit.
              return (
                <div
                  key={`r${i}`}
                  className="msg-in grid grid-cols-[36px_minmax(0,1fr)] gap-x-3"
                >
                  <div className="col-start-2 rounded-card border border-line-strong border-l-2 border-l-accent bg-inset px-4 py-3">
                    <b className="text-body font-medium text-primary">
                      Credential needed ·{" "}
                      <code className="font-mono text-caption">{it.name}</code>
                    </b>
                    <p className="mt-0.5 text-caption text-muted">{it.reason}</p>
                    {it.originHint && (
                      <p className="mt-0.5 text-caption text-dim">
                        for {it.originHint}
                      </p>
                    )}
                    {it.vresolved ? (
                      <p className="mt-2 text-caption text-muted">
                        {it.vresolved === "filled"
                          ? it.saved
                            ? "Stored encrypted in the vault"
                            : "Used for this run only (deleted when the turn ends)"
                          : it.vresolved === "skipped"
                            ? "Skipped"
                            : "Expired — no value was provided"}
                      </p>
                    ) : (
                      <VaultFillCard requestId={it.requestId!} />
                    )}
                  </div>
                </div>
              );
            }
            if (it.kind === "takeover") {
              // Batch 14a (SCR-4): kartu non-blocking — persona minta kontrol
              // shared screen. Turn TIDAK diblok UI; tombol memanggil REST
              // resolve; deadline auto-expired di backend.
              return (
                <div
                  key={`r${i}`}
                  className="msg-in grid grid-cols-[36px_minmax(0,1fr)] gap-x-3"
                >
                  <div className="col-start-2 rounded-card border border-line-strong border-l-2 border-l-accent bg-inset px-4 py-3">
                    <b className="text-body font-medium text-primary">
                      {it.name} asks for screen control
                    </b>
                    <p className="mt-0.5 text-caption text-muted">{it.reason}</p>
                    {it.tresolved ? (
                      <p className="mt-2 text-caption text-muted">
                        {it.tresolved === "granted"
                          ? "Control handed over — the agent is driving now (watch it on the Browser tab, Live mode)"
                          : it.tresolved === "denied"
                            ? "Denied — the agent continues read-only"
                            : "Expired with no answer — the agent continues read-only"}
                      </p>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {onWatchScreen && (
                          <Button
                            size="sm"
                            onClick={() => it.name && onWatchScreen(it.name)}
                            title="Watch this screen in a floating window while you chat"
                          >
                            Watch live
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            void authFetch(
                              apiUrl(`/api/takeover/${encodeURIComponent(it.requestId!)}/resolve`),
                              {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ grant: true }),
                              },
                            );
                          }}
                        >
                          Hand over control
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            void authFetch(
                              apiUrl(`/api/takeover/${encodeURIComponent(it.requestId!)}/resolve`),
                              {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ grant: false }),
                              },
                            );
                          }}
                        >
                          Keep control
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            if (
              it.kind === "noted" ||
              it.kind === "compressed" ||
              it.kind === "skill"
            ) {
              // Chip sistem: learn-nudge ✎ / kompresi konteks 🗜 / usulan skill 🛠
              const Icon =
                it.kind === "noted"
                  ? PencilSimple
                  : it.kind === "compressed"
                    ? ArrowsInLineVertical
                    : Wrench;
              const title =
                it.kind === "noted"
                  ? "Learn nudge after a task — editable/removable on the Memory tab"
                  : it.kind === "compressed"
                    ? "P0-CORE-4: old history is summarized into a checkpoint so long sessions still fit the model window — the original history stays fully stored"
                    : "Skill proposed from experience — validate it on the Skill tab";
              return (
                <div
                  key={`r${i}`}
                  className="mx-auto flex max-w-[560px] items-start gap-2 rounded-xl border border-dashed border-line-strong bg-inset px-3 py-2 text-caption text-secondary"
                  title={title}
                >
                  <Icon
                    size={13}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-accent"
                  />
                  <span>
                    {it.kind === "noted" && (
                      <>
                        <b className="font-semibold text-primary">Yui noted</b>{" "}
                        (
                        {it.scope === "project"
                          ? "project memory"
                          : "about you"}
                        ): {it.text}
                      </>
                    )}
                    {it.kind === "compressed" && (
                      <>
                        <b className="font-semibold text-primary">
                          Context compressed
                        </b>{" "}
                        — {it.n} old messages summarized (~{it.before} → ~
                        {it.after} tokens); the original history stays fully
                        stored.
                      </>
                    )}
                    {it.kind === "skill" && (
                      <>
                        <b className="font-semibold text-primary">
                          Yui proposed a skill
                        </b>
                        : {it.text} — validate it on the{" "}
                        <b className="font-semibold text-primary">Skill</b> tab
                      </>
                    )}
                  </span>
                </div>
              );
            }
            return (
              <div
                key={`r${i}`}
                className="msg-in rounded-card border border-line-strong border-l-2 border-l-danger bg-danger-soft px-4 py-3 text-body text-secondary"
              >
                {it.text}
              </div>
            );
          })}

          {showTyping ? (
            <div className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-x-3">
              <span className="col-start-1">
                <PersonaFace personaId={personaId} size={28} />
              </span>
              <span
                className="flex gap-[3px] px-3"
                aria-label={`${personaName} sedang ${STATE_LABEL[personaState]}`}
              >
                <i className="typing-dot" />
                <i className="typing-dot [animation-delay:140ms]" />
                <i className="typing-dot [animation-delay:280ms]" />
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-none flex-col px-0 pb-4 sm:px-6">
        <div className="mx-auto flex w-full flex-col">
          <div className="mb-2 flex flex-wrap items-center gap-2 self-start">
            {onToggleApprovalMode ? (
              <button
                type="button"
                className={`flex items-center gap-2 rounded-md2 border px-3 py-1 text-caption transition-colors ease-[var(--ease-inout-yui)] duration-[var(--yui-dur-fast)] ${
                  approvalMode === "auto"
                    ? "border-accent bg-accent/12 text-accent"
                    : "border-line-strong text-muted hover:text-secondary"
                }`}
                onClick={onToggleApprovalMode}
                title="Fast mode: write_file & run_command are auto-approved (no approval cards). Click to switch."
              >
                <Lightning
                  size={12}
                  weight="fill"
                  aria-hidden
                  className={approvalMode === "auto" ? "text-accent" : ""}
                />
                {approvalMode === "auto" ? "Hardcore Mode" : "Safety Mode"}
              </button>
            ) : null}
            {/* Toggle Workflow Mode — sejajar Hardcore Mode (user 2026-11-08):
                nyala = pesan berikutnya jadi brief run; saat run hidup, pesan
                selalu steer apa pun toggle. Hanya utk conductor di project. */}
            {workflow && (
              <button
                type="button"
                className={`flex items-center gap-2 rounded-md2 border px-3 py-1 text-caption transition-colors ease-[var(--ease-inout-yui)] duration-[var(--yui-dur-fast)] ${
                  workflow.armed
                    ? "border-accent bg-accent/12 text-accent"
                    : "border-line-strong text-muted hover:text-secondary"
                }`}
                onClick={workflow.onToggleArmed}
                aria-pressed={workflow.armed}
                title="Workflow mode: your next message starts a structured run (7 phases, gate after each). While a run is active, messages steer it regardless of this toggle."
              >
                <Steps
                  size={12}
                  weight={workflow.armed ? "fill" : "regular"}
                  aria-hidden
                  className={workflow.armed ? "text-accent" : ""}
                />
                {workflow.armed ? "Workflow Mode" : "Ad-hoc Mode"}
              </button>
            )}
          </div>
          {/* Strip status workflow (chip/progres/gate/pause) — input brief &
              steer kini SATU dengan composer. */}
          {workflow && (
            <WorkflowRunBar
              armed={workflow.armed}
              activeRun={workflow.activeRun}
              lastRun={workflow.lastRun}
              run={workflow.run}
              busy={busy}
              onAction={workflow.onAction}
            />
          )}
          <form
            className="flex items-end gap-2 rounded-lg2 border border-line bg-surface p-2 transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-normal)] focus-within:border-line-strong"
            onSubmit={submit}
          >
            <textarea
              ref={taRef}
              rows={1}
              className="min-h-10 max-h-40 flex-1 resize-none border-0 bg-transparent px-2 py-2 leading-relaxed text-body text-primary outline-none placeholder:text-dim"
              value={input}
              placeholder={
                busy
                  ? `${personaName} is working…`
                  : workflow?.activeRun
                    ? "Steer the running workflow — e.g. keep scope minimal"
                    : workflow?.armed
                      ? "Describe the goal — this message starts a workflow run"
                      : `Describe a task for ${personaName}…`
              }
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey)
                  submit(e as unknown as React.FormEvent);
              }}
            />
            <button
              className="flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-md2 bg-accent text-white transition-colors ease-out duration-[var(--yui-dur-fast)] hover:bg-accent-hover disabled:cursor-default disabled:bg-control-active disabled:text-dim"
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
            >
              <PaperPlaneTilt size={15} weight="bold" aria-hidden />
            </button>
            {busy && onCancel && (
              <button
                className="flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-md2 bg-danger text-white transition-colors hover:opacity-90"
                type="button"
                onClick={onCancel}
                aria-label="Stop turn"
                title="Stop turn (progress is saved)"
              >
                <Stop size={13} weight="fill" aria-hidden />
              </button>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
