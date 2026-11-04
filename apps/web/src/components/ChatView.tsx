"use client";
/**
 * ChatView — pola visual OpenBot (D:\projects\openbot):
 * pesan agent = teks polos + gutter wajah + nama muted; user = bubble terang rata kanan;
 * tool = langkah senyap yang bisa dilipat; delegasi = baris subagent; approval = kartu tenang.
 * Logika event tetap dari page.tsx (semua tipe @yui/contracts).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PersonaState } from "@yui/contracts";
import { PersonaFace } from "./PersonaPicker";
import { Markdown } from "./Markdown";

export interface ChatItem {
  kind: "msg" | "activity" | "delegation" | "approval" | "error" | "noted" | "skill" | "compressed" | "reasoning";
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

const STATE_LABEL: Record<PersonaState, string> = {
  idle: "menunggu",
  thinking: "berpikir",
  working: "bekerja",
  awaiting_input: "menunggu persetujuan",
  done: "selesai",
  error: "error",
  celebrating: "merayakan",
};

export { STATE_LABEL };

function Chevron({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 13V3m0 0L4 7m4-4l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
        className="chat-scroll"
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
        }}
      >
        <div className="chat-col">
          {items.length === 0 && emptySlot ? (
            <div className="chat-empty">{emptySlot}</div>
          ) : null}
          {rest.map((it, i) => {
            if (it.kind === "msg" && it.role === "user") {
              return (
                <div key={`r${i}`} className="msg-user">
                  <div className="body">{it.text}</div>
                </div>
              );
            }
            if (it.kind === "msg") {
              return (
                <div key={`r${i}`} className="msg-agent">
                  <span className="face"><PersonaFace personaId={personaId} size={28} /></span>
                  <div className="author">{personaName}</div>
                  <div className="body">
                    <Markdown text={it.text ?? ""} />
                    {it.streaming ? <span className="caret" /> : null}
                  </div>
                </div>
              );
            }
            if (it.kind === "delegation") {
              return (
                <div key={`r${i}`} className="subagent">
                  <span className="face"><PersonaFace personaId={it.personaId ?? "yui-scholar"} size={28} /></span>
                  <div className="card">
                    <div className="head">
                      <b>Delegasi · {it.personaId?.replace("yui-", "")}</b>
                      {it.childState ? (
                        <span className="state-chip" data-s={it.childState}>
                          <i />
                          {STATE_LABEL[it.childState]}
                        </span>
                      ) : null}
                    </div>
                    {it.goal ? <p className="goal">{it.goal}</p> : null}
                    {it.liveText && !it.text ? (
                      <div className="delegation-live" data-kind={it.liveKind}>
                        <span className="live-dot" aria-hidden />
                        <span className="live-text">{it.liveText}</span>
                      </div>
                    ) : null}
                    {it.text ? (
                      <div className="summary">
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
              const shown = full.length > 2000 ? `… ${full.slice(-2000)}` : full;
              return (
                <details key={`r${i}`} className="reasoning" open={it.streaming}>
                  <summary>
                    💭 Berpikir{it.streaming ? "…" : ""}{" "}
                    <span className="dim">({full.length.toLocaleString("id-ID")} chars)</span>
                  </summary>
                  <pre>{shown}</pre>
                </details>
              );
            }
            if (it.kind === "approval") {
              return (
                <div key={`r${i}`} className="approval">
                  <div className="card">
                    <b>Perlu persetujuan · <code>{it.name}</code></b>
                    <p className="why">{it.reason}</p>
                    {it.resolved ? (
                      <p className="verdict">
                        {it.resolved === "approved" ? "Disetujui" : it.resolved === "expired" ? "Kedaluwarsa — server direstart saat menunggu" : "Ditolak"}
                      </p>
                    ) : (
                      <div className="actions">
                        <button className="btn" onClick={() => onApprove(it.requestId!, true, true)} title="Setujui + tool ini bebas-approval untuk sisa sesi (dianjurkan)">
                          Setujui &amp; ingat
                        </button>
                        <button className="btn secondary" onClick={() => onApprove(it.requestId!, true)}>Setujui sekali</button>
                        <button className="btn secondary" onClick={() => onApprove(it.requestId!, false)}>Tolak</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            if (it.kind === "noted") {
              return (
                <div key={`r${i}`} className="noted-chip" title="Learn nudge pasca-task — bisa diedit/dihapus di tab Memori">
                  <span className="noted-icon">✎</span>
                  <span className="noted-text">
                    <b>Yui mencatat</b> ({it.scope === "project" ? "memori proyek" : "tentang Anda"}): {it.text}
                  </span>
                </div>
              );
            }
            if (it.kind === "compressed") {
              return (
                <div
                  key={`r${i}`}
                  className="noted-chip"
                  title="P0-CORE-4: history lama diringkas jadi checkpoint agar sesi panjang tetap muat di jendela model — riwayat asli tetap tersimpan utuh"
                >
                  <span className="noted-icon">🗜</span>
                  <span className="noted-text">
                    <b>Konteks dikompresi</b> — {it.n} pesan lama diringkas (~{it.before} → ~{it.after} token); semua riwayat asli tetap tersimpan.
                  </span>
                </div>
              );
            }
            if (it.kind === "skill") {
              return (
                <div key={`r${i}`} className="noted-chip skill-chip" title="Usulan skill dari pengalaman — validasi di tab Skill">
                  <span className="noted-icon">🛠</span>
                  <span className="noted-text">
                    <b>Yui mengusulkan skill</b>: {it.text} — validasi di tab <b>Skill</b>
                  </span>
                </div>
              );
            }
            return (
              <div key={`r${i}`} className="error-row">
                {it.text}
              </div>
            );
          })}

          {showTyping ? (
            <div className="typing-row">
              <span className="face"><PersonaFace personaId={personaId} size={28} /></span>
              <span className="dots" aria-label={`${personaName} sedang ${STATE_LABEL[personaState]}`}>
                <i /><i /><i />
              </span>
            </div>
          ) : null}

          {steps.length > 0 ? (
            <div className="steps">
              <button className="step-toggle" aria-expanded={stepsOpen} onClick={() => setStepsOpen((v) => !v)}>
                <Chevron />
                Langkah kerja · {steps.length}
              </button>
              {stepsOpen ? (
                <div className="step-rows">
                  {steps.map((it, i) => (
                    <div key={`s${i}`} className="step-row" data-ok={it.done && !it.isError ? "1" : undefined} data-err={it.isError ? "1" : undefined}>
                      <code>{it.name}</code>
                      {it.detail ? <span className="detail">{it.detail}</span> : null}
                      <span className="st">{it.isError ? "gagal" : it.done ? "✓" : "…"}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="composer-wrap">
        {onToggleApprovalMode ? (
          <button
            type="button"
            className="approval-mode-chip"
            data-on={approvalMode === "auto" ? "" : undefined}
            onClick={onToggleApprovalMode}
            title="Mode cepat: write_file & run_command disetujui otomatis (tanpa kartu approval). Klik untuk berganti."
          >
            ⚡ {approvalMode === "auto" ? "Auto-approve aktif" : "Auto-approve mati"}
          </button>
        ) : null}
        <form className="composer" onSubmit={submit}>
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            placeholder={busy ? `${personaName} sedang bekerja…` : `Tulis tugas untuk ${personaName}…`}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) submit(e as unknown as React.FormEvent);
            }}
          />
          <button className="send-btn" type="submit" disabled={busy || !input.trim()} aria-label="Kirim">
            <SendIcon />
          </button>
          {busy && onCancel && (
            <button className="send-btn stop-btn" type="button" onClick={onCancel} aria-label="Hentikan turn" title="Hentikan turn (progres tersimpan)">
              ■
            </button>
          )}
        </form>
      </div>
    </>
  );
}
