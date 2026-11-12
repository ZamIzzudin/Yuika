"use client";
import { apiUrl, authFetch } from "@/lib/api";
import { buildDesignAttachmentText, designRefLabel, parseDesignAttachment, type DesignRefPayload } from "@/lib/designRef";
/**
 * ChatView, pola visual OpenBot (D:\projects\openbot):
 * pesan agent = teks polos + gutter wajah + nama muted; user = bubble terang rata kanan;
 * tool = langkah senyap yang bisa dilipat; delegasi = baris subagent; approval = kartu tenang.
 * Logika event tetap dari page.tsx (semua tipe @yuika/contracts).
 * Tailwind semantik + komponen ui/*, tanpa CSS kustom (docs/DESIGN-SYSTEM.md).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PersonaState } from "@yuika/contracts";
import {
  Brain,
  CaretDown,
  ChatTeardropText,
  Lightning,
  PaperPlaneTilt,
  FrameCorners,
  Paperclip,
  X,
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
    | "login"
    | "screen"
    | "error"
    | "noted"
    | "skill"
    | "compressed"
    | "reasoning";
  // msg
  role?: "user" | "assistant";
  text?: string;
  streaming?: boolean;
  // reasoning (fix dev-10: pikiran model streaming, kolaps-able)
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
  /** Feed live anak (delegation.delta), streaming saat delegasi berjalan. */
  liveText?: string;
  liveKind?: "text" | "reasoning" | "tool";
 /** anak di-pause, menunggu resume (chip + tombol jadi Resume). */
  paused?: boolean;
  // approval
  requestId?: string;
  reason?: string;
  resolved?: "approved" | "denied" | "expired" | null;
 // vault : kartu protected, nilai TIDAK pernah di item/event;
  // user mengisi via REST fill langsung dari kartu.
  vkind?: "api_key" | "command" | "login";
  originHint?: string;
  saved?: boolean;
  vresolved?: "filled" | "skipped" | "expired" | null;
 // takeover ( SCR-4): persona minta kontrol screen, non-blocking.
  tresolved?: "granted" | "denied" | "expired" | null;
 // login : kartu kredensial, nilai via REST fill saja, TIDAK di item.
  loginRequestId?: string;
  loginOrigin?: string;
  lresolved?: "filled" | "skipped" | "expired" | "failed" | null;
  lsaved?: boolean;
 // screen (++): bubble "persona membuka browser" → Open Browser.
  screenUrl?: string;
  screenOpen?: boolean | null;
 // noted (: hasil learn nudge)
  scope?: "user" | "project";
 // compressed (: chip transparansi kompresi konteks)
  n?: number;
  before?: number;
  after?: number;
}

export { STATE_LABEL };

/** input nilai rahasia, uncontrolled (nilai hanya dibaca saat
 *  submit lalu input di-clear) + toggle "Save to Vault" (off = run-only).
 *  Nilai dikirim LANGSUNG ke POST /api/vault/fill/:id, tidak pernah masuk
 *  state React / event / chat. */
/** kartu login, dua field (username/password, uncontrolled; dibaca
 *  HANYA saat submit lalu di-clear DOM-side) + Save to Vault + Auto submit.
 *  Nilai dikirim LANGSUNG ke POST /api/login/:id/fill, tidak pernah masuk
 *  state React / event / chat. */
function LoginFillCard({
  requestId,
  origin,
}: {
  requestId: string;
  origin: string;
}) {
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const [save, setSave] = useState(true);
  const [submit, setSubmit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const clear = () => {
    if (userRef.current) userRef.current.value = "";
    if (passRef.current) passRef.current.value = "";
  };

  const fill = async () => {
    const u = userRef.current?.value ?? "";
    const p = passRef.current?.value ?? "";
    if (!u.trim() || !p || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await authFetch(
        apiUrl(`/api/login/${encodeURIComponent(requestId)}/fill`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ user: u, pass: p, save, submit }),
        },
      );
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      // resolved text datang via event login.resolved
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      clear(); // DOM-side clear, nilai tidak tinggal di UI
      setBusy(false);
    }
  };

  const skip = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await authFetch(
        apiUrl(`/api/login/${encodeURIComponent(requestId)}/skip`),
        { method: "POST" },
      );
    } catch {
      /* race dengan deadline, biarkan event resolved yang mengakhiri */
    } finally {
      clear();
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-2">
      <input
        ref={userRef}
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="Username or email"
        className="w-full rounded-md2 border border-line bg-surface px-2.5 py-1.5 text-caption text-primary placeholder:text-dim focus:border-accent focus:outline-none"
      />
      <input
        ref={passRef}
        type="password"
        autoComplete="new-password"
        spellCheck={false}
        placeholder={`Password for ${origin}`}
        className="w-full rounded-md2 border border-line bg-surface px-2.5 py-1.5 text-caption text-primary placeholder:text-dim focus:border-accent focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter") void fill();
        }}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <label className="flex cursor-pointer items-center gap-1.5 text-caption text-secondary select-none">
          <input
            type="checkbox"
            checked={save}
            onChange={() => setSave(!save)}
            className="accent-current"
          />
          Save to Vault
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-caption text-secondary select-none">
          <input
            type="checkbox"
            checked={submit}
            onChange={() => setSubmit(!submit)}
            className="accent-current"
          />
          Submit form
        </label>
      </div>
      {err && (
        <p role="alert" className="text-caption text-danger">
          {err}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => void fill()}>
          Fill login
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void skip()}
        >
          Skip
        </Button>
      </div>
    </div>
  );
}

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
      /* race dengan deadline, biarkan event resolved yang mengakhiri */
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
        Save to Vault (uncheck = use once for this run, deleted when the turn
        ends)
      </label>
      {err && <p className="text-caption text-danger">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => void submit()}
          disabled={busy}
        >
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
  onOpenScreen,
  sessionKey,
  designRefs,
  onRemoveDesignRef,
  onClearDesignRefs,
}: {
  items: ChatItem[];
  personaState: PersonaState;
  personaId: string;
  personaName: string;
  onSend: (text: string) => void;
 /** tombol Stop, batalkan turn aktif (progres tersimpan). */
  onCancel?: () => void;
  /** Konten state kosong (hero + saran), composer tetap tampil, user bisa langsung menulis. */
  emptySlot?: ReactNode;
  onApprove: (requestId: string, approved: boolean, remember?: boolean) => void;
  /** Klik kartu delegasi → buka sesi persona anak (fix 2026-11 user). */
  onOpenDelegation?: (childSessionId: string) => void;
  /** Fix dev-10: mode cepat, "auto" = write_file & run_command bebas-approval. */
  approvalMode?: "ask" | "auto";
  onToggleApprovalMode?: () => void;
  /** Konteks workflow utk composer conductor (null = chat biasa). */
  workflow?: WorkflowChatCtx | null;
  /** Buka floating live screen persona (bubble "Open Browser" + kartu takeover). */
  onOpenScreen?: (personaId: string) => void;
  /** Identitas sesi utk reset window (ganti sesi → kembali ke 8 terakhir). */
  sessionKey: string;
  busy: boolean;
  /** D93: komponen desain di-attach dari canvas → chip composer; saat kirim
   *  snapshot JSON ditanam ke teks pesan (bisa dirujuk persona). */
  designRefs?: DesignRefPayload[];
  onRemoveDesignRef?: (idx: number) => void;
  onClearDesignRefs?: () => void;
}) {
  const [input, setInput] = useState("");
 // kontrol delegasi aktif, steer input per kartu + cancel.
  const [steerOpenFor, setSteerOpenFor] = useState<string | null>(null);
  const [steerText, setSteerText] = useState("");

  // ---- Lampiran chat (D87+): pilih dokumen → upload ke uploads/ sesi →
  //  chip di composer → path otomatis ditanam ke pesan (persona baca via
  //  doc_read / read_file). Sama dgn tombol Upload di tab Files, tapi tanpa
  //  pindah tab.
  const MAX_ATTACH = 5;
  const [attachments, setAttachments] = useState<
    Array<{ name: string; size: number; path?: string; error?: string; busy: boolean }>
  >([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_ATTACH - attachments.length;
    if (room <= 0) return;
    const list = Array.from(files).slice(0, room);
    const start = attachments.length;
    setAttachments((prev) => [
      ...prev,
      ...list.map((f) => ({ name: f.name, size: f.size, busy: true })),
    ]);
    for (let i = 0; i < list.length; i++) {
      const f = list[i]!;
      const idx = start + i;
      try {
        const r = await authFetch(
          apiUrl(`/api/uploads?name=${encodeURIComponent(f.name)}&session=${sessionKey}`),
          { method: "POST", body: await f.arrayBuffer() },
        );
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "upload failed");
        }
        const d = (await r.json()) as { path: string };
        setAttachments((prev) => prev.map((a, j) => (j === idx ? { ...a, busy: false, path: d.path } : a)));
      } catch (err) {
        setAttachments((prev) =>
          prev.map((a, j) =>
            j === idx ? { ...a, busy: false, error: err instanceof Error ? err.message : "upload failed" } : a,
          ),
        );
      }
    }
  }
  async function sendSteer(childSessionId: string) {
    let text = steerText.trim();
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

  // ---- Windowing riwayat chat (konsep sama dgn mobile): render 8 item
  // terakhir; scroll dekat atas (atau klik chip) → muat +16 lebih lama.
  // Skeleton sesaat + offset scroll dipertahankan (metrik disimpan sebelum
  // batch baru dirender, dipulihkan setelah re-render) supaya tidak melompat.
  const WINDOW_FIRST = 8;
  const WINDOW_STEP = 16;
  const [visibleCount, setVisibleCount] = useState(WINDOW_FIRST);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const loadTimer = useRef<number | null>(null);
  const prevMetrics = useRef<{ offset: number; height: number } | null>(null);

  // Auto-scroll: MOUNT/switch sesi → selalu ke bawah; setelah itu hanya bila user
  // memang di dekat bawah (tidak mencuri scroll saat user membaca ke atas).
  const stickRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [items, personaState]);

  // ganti sesi/persona → window reset ke 8 terakhir + kembali nempel bawah
  useEffect(() => {
    setVisibleCount(WINDOW_FIRST);
    setLoadingEarlier(false);
    stickRef.current = true;
    if (loadTimer.current) window.clearTimeout(loadTimer.current);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sessionKey]);

  /** Pulihkan posisi scroll setelah item lama di-prepend (anti lompat). */
  useEffect(() => {
    const el = scrollRef.current;
    if (el && prevMetrics.current) {
      el.scrollTop = el.scrollHeight - prevMetrics.current.height + prevMetrics.current.offset;
      prevMetrics.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCount]);

  function loadEarlier() {
    if (loadingEarlier) return;
    setLoadingEarlier(true);
    const el = scrollRef.current;
    if (el) prevMetrics.current = { offset: el.scrollTop, height: el.scrollHeight };
    loadTimer.current = window.setTimeout(() => {
      setVisibleCount((v) => v + WINDOW_STEP);
      setLoadingEarlier(false);
    }, 350);
  }

  // Textarea auto-grow
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  // Tool steps TIDAK lagi dirender di chat (user 2026-11 #8), observability
  // langkah kerja ada di tab Logs (Session Trace, realtime). items activity
  // tetap terkumpul (dipakai indikator dot tab Chat/Team).
  const steps = items.filter((it) => it.kind === "activity");
  const rest = items.filter((it) => it.kind !== "activity");
  const hiddenBefore = Math.max(0, rest.length - visibleCount);
  const windowed = hiddenBefore > 0 ? rest.slice(rest.length - visibleCount) : rest;
  const showTyping = personaState === "thinking" || personaState === "working";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const uploading = attachments.some((a) => a.busy);
    if (uploading || busy) return;
    const attached = attachments.filter((a) => a.path).map((a) => a.path!);
    const base = input.trim();
    if (!base && attached.length === 0) return;
    // lampiran ditanam ke teks (transparan + ter-persist di riwayat);
    let text =
      attached.length > 0
        ? `${base}${base ? "\n\n" : ""}[files attached via chat]\n${attached.map((p) => `- ${p}`).join("\n")}`
        : base;
    // D93: snapshot komponen desain ditanam setelah teks user (riwayat bubble
    // merender ulang via parseDesignAttachment — JSON tak tampil polos).
    const drefs = designRefs ?? [];
    if (drefs.length > 0)
      text = `${text}${text ? "\n\n" : ""}${buildDesignAttachmentText(drefs)}`;
    // satu composer, makna menurut konteks: run hidup → steer; toggle
    // Workflow Mode nyala → brief; selain itu turn chat biasa.
    if (workflow) {
      if (workflow.activeRun) {
        void workflow.onSendWorkflow(text, "steer");
        setInput("");
        setAttachments([]);
        onClearDesignRefs?.();
        return;
      }
      if (workflow.armed) {
        void workflow.onSendWorkflow(text, "brief");
        setInput("");
        setAttachments([]);
        onClearDesignRefs?.();
        return;
      }
    }
    onSend(text);
    setInput("");
    setAttachments([]);
    onClearDesignRefs?.();
  }

  return (
    <>
      <div
        className="min-h-0 flex-1 scroll-smooth overflow-y-auto px-4 my-4 sm:px-6 sm:my-6"
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          stickRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 160;
          // dekat atas & masih ada history → muat batch sebelumnya
          if (el.scrollTop < 80 && hiddenBefore > 0 && !loadingEarlier) loadEarlier();
        }}
      >
        <div className="mx-auto flex w-full flex-col gap-3">
          {hiddenBefore > 0 || loadingEarlier ? (
            <div className="flex flex-col items-center gap-2 py-1">
              {loadingEarlier ? (
                <div className="flex w-full flex-col gap-3" aria-live="polite">
                  <div className="msg-out flex w-full justify-start">
                    <div className="h-10 w-2/5 animate-pulse rounded-bubble bg-inset" />
                  </div>
                  <div className="flex w-full justify-end">
                    <div className="h-10 w-1/3 animate-pulse rounded-bubble bg-inset" />
                  </div>
                </div>
              ) : (
                <button
                  className="cursor-pointer rounded-pill border border-line bg-surface px-3 py-1 text-caption text-secondary transition-colors hover:border-line-strong hover:text-primary"
                  onClick={loadEarlier}
                >
                  Load earlier messages ({hiddenBefore} more)
                </button>
              )}
            </div>
          ) : null}
          {items.length === 0 && emptySlot ? (
            <div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
              {emptySlot}
            </div>
          ) : null}
          {windowed.map((it, i) => {
            if (it.kind === "msg" && it.role === "user") {
              return (
                <div key={`r${i}`} className="msg-in flex justify-end">
                  <div className="max-w-[80%] rounded-bubble bg-[var(--yui-surface-light)] px-3.5 py-2 leading-relaxed text-body text-onlight">
                    {(() => {
                      // D93: blok [design component attached] dirender sebagai chip
                      // + data collapsed — bukan JSON polos di bubble.
                      const att = parseDesignAttachment(it.text ?? "");
                      return (
                        <>
                          {att?.labels.map((l, k) => (
                            <span
                              key={k}
                              className="mb-1 flex items-center gap-1.5 rounded-md2 bg-black/10 px-2 py-1 text-caption text-onlight"
                              title={l}
                            >
                              <FrameCorners size={11} className="shrink-0" aria-hidden />
                              <span className="max-w-[280px] truncate">{l}</span>
                            </span>
                          ))}
                          {att?.json ? (
                            <details className="mb-1">
                              <summary className="cursor-pointer text-caption text-onlight/70">Component data</summary>
                              <pre className="mt-1 max-h-48 overflow-auto rounded-md2 bg-black/10 p-2 text-caption whitespace-pre-wrap">{att.json}</pre>
                            </details>
                          ) : null}
                          {att ? (
                            att.text ? <span className="whitespace-pre-wrap break-words">{att.text}</span> : null
                          ) : (
                            <span className="whitespace-pre-wrap break-words">{it.text}</span>
                          )}
                        </>
                      );
                    })()}
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
                      {/* : kontrol anak saat masih bekerja (belum ada ringkasan). */}
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
              // Fix dev-10: pikiran model streaming (reasoning_content GLM),
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
                            ? "Expired, the server restarted while waiting"
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
 // kartu protected, nilai dikirim LANGSUNG ke REST
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
                    <p className="mt-0.5 text-caption text-muted">
                      {it.reason}
                    </p>
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
                            : "Expired, no value was provided"}
                      </p>
                    ) : (
                      <VaultFillCard requestId={it.requestId!} />
                    )}
                  </div>
                </div>
              );
            }
            if (it.kind === "login") {
 // kartu login, dua field; nilai LANGSUNG ke REST fill,
              // tidak pernah lewat state/event chat. resolved via SSE.
              return (
                <div
                  key={`r${i}`}
                  className="msg-in grid grid-cols-[36px_minmax(0,1fr)] gap-x-3"
                >
                  <div className="col-start-2 rounded-card border border-line-strong border-l-2 border-l-accent bg-inset px-4 py-3">
                    <b className="text-body font-medium text-primary">
                      Login needed ·{" "}
                      <code className="font-mono text-caption">
                        {it.loginOrigin}
                      </code>
                    </b>
                    <p className="mt-0.5 text-caption text-muted">
                      {it.name} needs credentials to sign in, values go straight
                      into the browser form, never into the chat.
                    </p>
                    {it.lresolved ? (
                      <p className="mt-2 text-caption text-muted">
                        {it.lresolved === "filled"
                          ? it.lsaved
                            ? "Filled, saved encrypted in the vault"
                            : "Filled for this run only"
                          : it.lresolved === "skipped"
                            ? "Skipped"
                            : it.lresolved === "expired"
                              ? "Expired, no credentials were provided"
                              : "No password field found, navigate to the sign-in form and ask again"}
                      </p>
                    ) : (
                      <LoginFillCard
                        requestId={it.loginRequestId!}
                        origin={it.loginOrigin ?? ""}
                      />
                    )}
                  </div>
                </div>
              );
            }
            if (it.kind === "takeover") {
 // (SCR-4): kartu non-blocking, persona minta kontrol
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
                    <p className="mt-0.5 text-caption text-muted">
                      {it.reason}
                    </p>
                    {it.tresolved ? (
                      <p className="mt-2 text-caption text-muted">
                        {it.tresolved === "granted"
                          ? "Control handed over, the agent is driving now (watch it on the Browser tab, Live mode)"
                          : it.tresolved === "denied"
                            ? "Denied, the agent continues read-only"
                            : "Expired with no answer, the agent continues read-only"}
                      </p>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {onOpenScreen && (
                          <Button
                            size="sm"
                            onClick={() => it.name && onOpenScreen(it.name)}
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
                              apiUrl(
                                `/api/takeover/${encodeURIComponent(it.requestId!)}/resolve`,
                              ),
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
                              apiUrl(
                                `/api/takeover/${encodeURIComponent(it.requestId!)}/resolve`,
                              ),
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
            if (it.kind === "screen") {
 // ++: persona menjalankan browser_open → bubble dengan
              // tombol membuka floating window (satu bubble per persona).
              return (
                <div
                  key={`r${i}`}
                  className="msg-in grid grid-cols-[36px_minmax(0,1fr)] gap-x-3"
                >
                  <div className="col-start-2 rounded-card border border-line bg-inset px-4 py-3">
                    <b className="text-body font-medium text-primary">
                      {it.name} is working in a browser
                    </b>
                    <p className="mt-0.5 truncate text-caption text-dim">
                      {it.screenUrl}
                    </p>
                    <div className="mt-3">
                      <Button
                        size="sm"
                        onClick={() => it.name && onOpenScreen?.(it.name)}
                        title="Open this screen in a floating window"
                      >
                        Open Browser
                      </Button>
                    </div>
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
                  ? "Learn nudge after a task, editable/removable on the Memory tab"
                  : it.kind === "compressed"
                    ? ": old history is summarized into a checkpoint so long sessions still fit the model window, the original history stays fully stored"
                    : "Skill proposed from experience, validate it on the Skill tab";
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
                        , {it.n} old messages summarized (~{it.before} → ~
                        {it.after} tokens); the original history stays fully
                        stored.
                      </>
                    )}
                    {it.kind === "skill" && (
                      <>
                        <b className="font-semibold text-primary">
                          Yui proposed a skill
                        </b>
                        : {it.text}, validate it on the{" "}
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
            {/* Toggle Workflow Mode, sejajar Hardcore Mode (user 2026-11-08):
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
          {/* Strip status workflow (chip/progres/gate/pause), input brief &
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
          {/* D93: chip komponen desain (attach dari canvas via klik kanan) */}
          {(designRefs ?? []).length > 0 && (
            <div className="flex flex-col gap-1.5">
              {designRefs!.map((r, i) => (
                <div
                  key={`${r.shapeId}-${i}`}
                  className="flex items-center gap-2 rounded-md2 border border-accent/40 bg-accent/5 px-2.5 py-1.5 text-caption"
                >
                  <FrameCorners size={12} className="shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-primary" title={designRefLabel(r)}>
                    {designRefLabel(r)}
                  </span>
                  <button
                    type="button"
                    className="cursor-pointer text-dim transition-colors hover:text-primary"
                    aria-label={`Remove component ${r.shapeName}`}
                    onClick={() => onRemoveDesignRef?.(i)}
                  >
                    <X size={12} weight="bold" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Lampiran chat: chip dokumen terpilih (upload → uploads/ sesi) */}
          {attachments.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {attachments.map((a, i) => (
                <div
                  key={`${a.name}-${i}`}
                  className="flex items-center gap-2 rounded-md2 border border-line bg-inset px-2.5 py-1.5 text-caption"
                >
                  {a.busy ? (
                    <span className="size-3 shrink-0 animate-spin rounded-full border border-line-strong border-t-transparent" aria-hidden />
                  ) : a.error ? (
                    <span className="shrink-0 text-danger" title={a.error}>
                      {a.error}
                    </span>
                  ) : (
                    <Paperclip size={12} className="shrink-0 text-secondary" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate text-primary">
                    {a.name}
                    {!a.busy && !a.error && (
                      <span className="ml-1.5 text-dim">
                        {(a.size / 1024).toFixed(0)} KB · {a.path}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="cursor-pointer text-dim transition-colors hover:text-primary"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X size={12} weight="bold" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
          <form
            className="flex items-end gap-2 rounded-lg2 border border-line bg-surface p-2 transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-normal)] focus-within:border-line-strong"
            onSubmit={submit}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept=".pdf,.xlsx,.xls,.csv,.md,.txt,.json,.html,.htm,.xml,.yaml,.yml"
              onChange={(e) => {
                void pickFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-md2 text-secondary transition-colors hover:bg-inset hover:text-primary disabled:cursor-default disabled:text-dim"
              onClick={() => fileRef.current?.click()}
              disabled={attachments.length >= MAX_ATTACH}
              aria-label="Attach documents"
              title="Attach documents (pdf/xlsx/csv/md/…) → uploads/, read by the agent via doc_read"
            >
              <Paperclip size={15} aria-hidden />
            </button>
            <textarea
              ref={taRef}
              rows={1}
              className="min-h-10 max-h-40 flex-1 resize-none border-0 bg-transparent px-2 py-2 leading-relaxed text-body text-primary outline-none placeholder:text-dim"
              value={input}
              placeholder={
                busy
                  ? `${personaName} is working…`
                  : workflow?.activeRun
                    ? "Steer the running workflow, e.g. keep scope minimal"
                    : workflow?.armed
                      ? "Describe the goal, this message starts a workflow run"
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
              disabled={busy || (!input.trim() && attachments.every((a) => !a.path)) || attachments.some((a) => a.busy)}
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
