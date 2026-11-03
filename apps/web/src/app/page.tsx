"use client";
/**
 * Your-Yui demo shell — orchestrator UI (DEMO-WEEK-1 §2):
 * persona picker → sesi → SSE event stream → render msg/activity/delegation/approval.
 * SEMUA tipe dari @yui/contracts (dilarang tipe tangan — PLAN §6.3).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PersonaPicker } from "@/components/PersonaPicker";
import { PersonaPortrait } from "@/components/PersonaPortrait";
import { ChatView, STATE_LABEL, type ChatItem } from "@/components/ChatView";
import { OrinPortrait } from "@/components/OrinPortrait";
import type { PersonaInfo, PersonaState, YuiEvent } from "@yui/contracts";

/** Prompt saran per persona (pola ConversationPrompts OpenBot — klik = kirim). */
const SUGGESTIONS: Record<string, string[]> = {
  "yui-conductor": [
    "Riset 3 framework JS paling populer, bandingkan singkat, tulis laporan markdown ke reports/",
    "Susun rencana riset kompetitor aplikasi notes, lalu delegasikan",
  ],
  "yui-scholar": [
    "Riset tren AI agent 2025 dari web, tulis poin-poin dengan sumber",
    "Bandingkan SQLite vs Postgres untuk aplikasi lokal-first",
  ],
  "yui-scribe": [
    "Tulis draf laporan mingguan tim (markdown) ke reports/",
    "Ringkas hasil kerja sesi ini jadi memo satu halaman",
  ],
  "yui-coder": [
    "Review packages/core/src/loop.ts dan beri catatan perhatian",
    "Buat skrip kecil untuk memeriksa kontrak event lalu jelaskan",
  ],
};

export default function Home() {
  const [personas, setPersonas] = useState<PersonaInfo[]>([]);
  const [active, setActive] = useState<PersonaInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [personaState, setPersonaState] = useState<PersonaState>("idle");
  const [busy, setBusy] = useState(false);
  const lastEventId = useRef(0);

  useEffect(() => {
    fetch("/api/personas")
      .then((r) => r.json())
      .then((d: { personas: PersonaInfo[] }) => setPersonas(d.personas))
      .catch(console.error);
  }, []);

  // Assistant streaming: delta ditumpuk ke item terakhir; id item disimpan di sini.
  const openAssistant = useRef<number | null>(null);

  const applyEvent = useCallback((e: YuiEvent) => {
    // Dedupe: SSE replay+live bisa overlap saat reconnect (safety net — server sudah
    // dedupe by id; id monotonic per sesi).
    if (e.id <= lastEventId.current) return;
    lastEventId.current = Math.max(lastEventId.current, e.id);
    switch (e.type) {
      case "turn.started":
        setBusy(true);
        break;
      case "message.delta":
        setItems((prev) => {
          const idx = openAssistant.current;
          if (idx !== null && prev[idx]?.kind === "msg") {
            const next = [...prev];
            next[idx] = { ...next[idx]!, text: (next[idx]!.text ?? "") + e.delta };
            return next;
          }
          openAssistant.current = prev.length;
          return [...prev, { kind: "msg", role: "assistant", text: e.delta, streaming: true }];
        });
        break;
      case "message.done":
        setItems((prev) => {
          const idx = openAssistant.current;
          openAssistant.current = null;
          if (idx !== null && prev[idx]?.kind === "msg") {
            const next = [...prev];
            next[idx] = { ...next[idx]!, streaming: false };
            return next;
          }
          return prev;
        });
        break;
      case "tool.call":
        setItems((prev) => [...prev, { kind: "activity", name: e.name, callId: e.callId, detail: short(JSON.stringify(e.args)), done: false }]);
        break;
      case "tool.result":
        setItems((prev) => {
          // tutup activity tool.call yang cocok (match via callId — ToolResultEvent tanpa name)
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i]!.kind === "activity" && next[i]!.callId === e.callId) {
              next[i] = { ...next[i]!, detail: short(JSON.stringify(e.result)), isError: e.isError, done: true };
              return next;
            }
          }
          return [...prev, { kind: "activity", name: e.callId, detail: short(JSON.stringify(e.result)), isError: e.isError }];
        });
        break;
      case "delegation.started":
        setItems((prev) => [...prev, { kind: "delegation", personaId: e.personaId, childSessionId: e.childSessionId, goal: e.goal }]);
        break;
      case "delegation.progress":
        setItems((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i]!.kind === "delegation" && next[i]!.childSessionId === e.childSessionId && !next[i]!.text) {
              next[i] = { ...next[i]!, childState: e.state };
              break;
            }
          }
          return next;
        });
        break;
      case "delegation.done":
        setItems((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i]!.kind === "delegation" && next[i]!.personaId /* match last open */) {
              if (next[i]!.text) continue; // sudah ada summary → cari yang belum
              next[i] = { ...next[i]!, text: e.summary, childState: "done" };
              break;
            }
          }
          return next;
        });
        break;
      case "persona.state":
        setPersonaState(e.state);
        if (e.state === "done" || e.state === "celebrating" || e.state === "error" || e.state === "idle") {
          setBusy(false);
        }
        break;
      case "approval.requested":
        setItems((prev) => [...prev, { kind: "approval", requestId: e.requestId, name: e.tool, reason: e.reason, resolved: null }]);
        break;
      case "approval.resolved":
        setItems((prev) =>
          prev.map((it) =>
            it.kind === "approval" && it.requestId === e.requestId
              ? { ...it, resolved: e.approved ? ("approved" as const) : ("denied" as const) }
              : it,
          ),
        );
        break;
      case "session.error":
        setItems((prev) => [...prev, { kind: "error", text: e.message }]);
        setBusy(false);
        break;
    }
  }, []);

  // SSE: buka saat sesi ada; reconnect bawaan browser; replay pakai ?since=
  useEffect(() => {
    if (!sessionId) return;
    const es = new EventSource(`/api/sessions/${sessionId}/stream?since=${lastEventId.current}`);
    es.onmessage = (m) => {
      try {
        applyEvent(JSON.parse(m.data) as YuiEvent);
      } catch (err) {
        console.error("event parse gagal", err);
      }
    };
    es.onerror = () => {/* EventSource auto-reconnect; state replay via ?since */};
    return () => es.close();
  }, [sessionId, applyEvent]);

  async function pick(p: PersonaInfo) {
    setActive(p);
    setItems([]);
    setPersonaState("idle");
    openAssistant.current = null;
    lastEventId.current = 0;
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personaId: p.id }),
    });
    const d = (await res.json()) as { sessionId: string };
    setSessionId(d.sessionId);
  }

  async function send(text: string) {
    if (!sessionId) return;
    setItems((prev) => [...prev, { kind: "msg", role: "user", text }]);
    await fetch(`/api/sessions/${sessionId}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }

  async function approve(requestId: string, approved: boolean) {
    await fetch(`/api/approvals/${requestId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approved }),
    });
  }

  return (
    <div className="yui-shell">
      <aside className="yui-side">
        <div className="yui-logo">
          Your-Yui <span className="sub">demo</span>
        </div>
        <PersonaPicker personas={personas} activeId={active?.id ?? null} onPick={pick} />
      </aside>
      <main className="yui-main">
        {!active ? (
          <div className="empty-state">
            <div className="portrait-hero"><OrinPortrait state="idle" /></div>
            <h1>Pilih persona untuk memulai</h1>
            <p className="pitch">
              Conductor mengorkestrasi, Scholar meriset, Scribe menulis, Coder memrogram — saling
              mendelegasikan pekerjaan lewat satu sesi.
            </p>
          </div>
        ) : (
          <>
            <header className="chat-header">
              <PersonaPortrait name={active.name} state={personaState} personaId={active.id} variant="compact" />
              <div className="who">
                <b>{active.name}</b>
                <span>{active.expertise}</span>
              </div>
              <span className="state-chip" data-s={personaState}>
                <i />
                {STATE_LABEL[personaState]}
              </span>
            </header>
            {items.length === 0 ? (
              <div className="empty-state">
                <PersonaPortrait name={active.name} state={personaState} personaId={active.id} variant="hero" />
                <h1>{active.name} siap</h1>
                <p className="pitch">{active.description}</p>
                <div className="suggest-row">
                  {(SUGGESTIONS[active.id] ?? []).map((s) => (
                    <button key={s} className="suggest" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ChatView
                items={items}
                personaState={personaState}
                personaId={active.id}
                personaName={active.name}
                onSend={send}
                onApprove={approve}
                busy={busy}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function short(s: string, n = 140): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
