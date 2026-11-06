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
  Stop,
  ArrowsInLineVertical,
  Wrench,
} from "@phosphor-icons/react";
import { PersonaFace } from "./PersonaPicker";
import { toastErr } from "./ui/toast";
import { Markdown } from "./Markdown";
import { Button, StateChip, STATE_LABEL } from "./ui";
import { WorkflowRunBar } from "./WorkflowRunBar";

export interface ChatItem {
  kind:
    | "msg"
    | "activity"
    | "delegation"
    | "approval"
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
  // noted (P1-MEM-2: hasil learn nudge)
  scope?: "user" | "project";
  // compressed (P0-CORE-4: chip transparansi kompresi konteks)
  n?: number;
  before?: number;
  after?: number;
}

export { STATE_LABEL };

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
  projectId,
  sessionId,
  onSend,
  onCancel,
  onApprove,
  onOpenDelegation,
  busy,
  emptySlot,
  approvalMode,
  onToggleApprovalMode,
}: {
  items: ChatItem[];
  personaState: PersonaState;
  personaId: string;
  personaName: string;
  /** Project aktif — utk WorkflowRunBar (kendali workflow di chat, 2026-11-08). */
  projectId: string | null;
  sessionId: string | null;
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
  const [stepsOpen, setStepsOpen] = useState(true);
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

  const steps = items.filter((it) => it.kind === "activity");
  const rest = items.filter((it) => it.kind !== "activity");
  const showTyping = personaState === "thinking" || personaState === "working";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    onSend(input.trim());
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

          {steps.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              <button
                className="group inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md2 border border-transparent px-2 py-1 text-caption text-muted hover:bg-hover hover:text-primary"
                aria-expanded={stepsOpen}
                onClick={() => setStepsOpen((v) => !v)}
              >
                <span className={stepsOpen ? "rotate-180" : ""}>
                  <Chevron />
                </span>
                Langkah kerja · {steps.length}
              </button>
              {stepsOpen ? (
                <div className="ml-2 flex flex-col gap-px border-l border-line pl-2">
                  {steps.map((it, i) => (
                    <div
                      key={`s${i}`}
                      className="flex items-baseline gap-2 rounded-sm2 px-1 py-0.5 text-caption hover:bg-hover"
                    >
                      <code
                        className={`font-mono ${it.isError ? "text-danger" : "text-secondary"}`}
                      >
                        {it.name}
                      </code>
                      {it.detail ? (
                        <span className="min-w-0 flex-1 truncate text-dim">
                          {it.detail}
                        </span>
                      ) : null}
                      <span
                        className={`shrink-0 ${it.isError ? "text-danger" : it.done ? "text-success" : "text-dim"}`}
                      >
                        {it.isError ? "failed" : it.done ? "✓" : "…"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-none flex-col px-0 pb-4 sm:px-6">
        <div className="mx-auto flex w-full flex-col">
          {onToggleApprovalMode ? (
            <button
              type="button"
              className={`mb-2 flex items-center gap-2 self-start rounded-md2 border px-3 py-1 text-caption transition-colors ease-[var(--ease-inout-yui)] duration-[var(--yui-dur-fast)] ${
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
          {/* Kendali workflow hidup di CHAT (keputusan user 2026-11-08):
              brief/steer/gate/pause — hanya utk conductor di project. */}
          {personaId === "yui-conductor" && projectId && (
            <WorkflowRunBar projectId={projectId} sessionId={sessionId} />
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
