"use client";
/**
 * ChatView — pola visual OpenBot (D:\projects\openbot):
 * pesan agent = teks polos + gutter wajah + nama muted; user = bubble terang rata kanan;
 * tool = langkah senyap yang bisa dilipat; delegasi = baris subagent; approval = kartu tenang.
 * Logika event tetap dari page.tsx (semua tipe @yui/contracts).
 * DS-1: Tailwind semantik + komponen ui/* — tanpa CSS kustom (docs/DESIGN-SYSTEM.md).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PersonaState } from "@yui/contracts";
import {
  Brain,
  CaretDown,
  Lightning,
  PaperPlaneTilt,
  PencilSimple,
  Stop,
  ArrowsInLineVertical,
  Wrench,
} from "@phosphor-icons/react";
import { PersonaFace } from "./PersonaPicker";
import { Markdown } from "./Markdown";
import { Button, StateChip, STATE_LABEL } from "./ui";

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
  onSend,
  onCancel,
  onApprove,
  busy,
  emptySlot,
  approvalMode,
  onToggleApprovalMode,
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
  /** Fix dev-10: mode cepat — "auto" = write_file & run_command bebas-approval. */
  approvalMode?: "ask" | "auto";
  onToggleApprovalMode?: () => void;
  busy: boolean;
}) {
  const [input, setInput] = useState("");
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
        className="min-h-0 flex-1 scroll-smooth overflow-y-auto px-4 py-4 sm:px-6 sm:pb-6"
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (el)
            stickRef.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 160;
        }}
      >
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3">
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
                  <div className="col-start-2 rounded-card border border-line bg-surface px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-body font-semibold text-primary">
                        Delegasi · {it.personaId?.replace("yui-", "")}
                      </b>
                      {it.childState ? (
                        <StateChip state={it.childState} />
                      ) : null}
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
                    Berpikir{it.streaming ? "…" : ""}{" "}
                    <span className="text-muted">
                      ({full.length.toLocaleString("id-ID")} chars)
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
                          ? "Disetujui"
                          : it.resolved === "expired"
                            ? "Kedaluwarsa — server direstart saat menunggu"
                            : "Ditolak"}
                      </p>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => onApprove(it.requestId!, true, true)}
                          title="Setujui + tool ini bebas-approval untuk sisa sesi (dianjurkan)"
                        >
                          Setujui &amp; ingat
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => onApprove(it.requestId!, true)}
                        >
                          Setujui sekali
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => onApprove(it.requestId!, false)}
                        >
                          Tolak
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
                  ? "Learn nudge pasca-task — bisa diedit/dihapus di tab Memori"
                  : it.kind === "compressed"
                    ? "P0-CORE-4: history lama diringkas jadi checkpoint agar sesi panjang tetap muat di jendela model — riwayat asli tetap tersimpan utuh"
                    : "Usulan skill dari pengalaman — validasi di tab Skill";
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
                        <b className="font-semibold text-primary">
                          Yui mencatat
                        </b>{" "}
                        (
                        {it.scope === "project"
                          ? "memori proyek"
                          : "tentang Anda"}
                        ): {it.text}
                      </>
                    )}
                    {it.kind === "compressed" && (
                      <>
                        <b className="font-semibold text-primary">
                          Konteks dikompresi
                        </b>{" "}
                        — {it.n} pesan lama diringkas (~{it.before} → ~
                        {it.after} token); semua riwayat asli tetap tersimpan.
                      </>
                    )}
                    {it.kind === "skill" && (
                      <>
                        <b className="font-semibold text-primary">
                          Yui mengusulkan skill
                        </b>
                        : {it.text} — validasi di tab{" "}
                        <b className="font-semibold text-primary">Skill</b>
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
                        {it.isError ? "gagal" : it.done ? "✓" : "…"}
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
              className={`mb-2 self-start rounded-md2 border px-3 py-1 text-caption transition-colors ease-[var(--ease-inout-yui)] duration-[var(--yui-dur-fast)] ${
                approvalMode === "auto"
                  ? "border-accent bg-accent/12 text-accent"
                  : "border-line-strong text-muted hover:text-secondary"
              }`}
              onClick={onToggleApprovalMode}
              title="Mode cepat: write_file & run_command disetujui otomatis (tanpa kartu approval). Klik untuk berganti."
            >
              <Lightning
                size={12}
                weight="fill"
                aria-hidden
                className={approvalMode === "auto" ? "text-accent" : ""}
              />
              {approvalMode === "auto"
                ? "Auto-approve aktif"
                : "Auto-approve mati"}
            </button>
          ) : null}
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
                  ? `${personaName} sedang bekerja…`
                  : `Tulis tugas untuk ${personaName}…`
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
              aria-label="Kirim"
            >
              <PaperPlaneTilt size={15} weight="bold" aria-hidden />
            </button>
            {busy && onCancel && (
              <button
                className="flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-md2 bg-danger text-white transition-colors hover:opacity-90"
                type="button"
                onClick={onCancel}
                aria-label="Hentikan turn"
                title="Hentikan turn (progres tersimpan)"
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
