"use client";
import { useState } from "react";
import type { PersonaState } from "@yui/contracts";

export interface ChatItem {
  kind: "msg" | "activity" | "delegation" | "approval" | "error";
  // msg
  role?: "user" | "assistant";
  text?: string;
  streaming?: boolean;
  // activity (tool)
  name?: string;
  callId?: string;
  detail?: string;
  isError?: boolean;
  // delegation
  personaId?: string;
  childSessionId?: string;
  goal?: string;
  childState?: PersonaState;
  // approval
  requestId?: string;
  reason?: string;
  resolved?: "approved" | "denied" | null;
}

export function ChatView({
  items,
  personaState,
  onSend,
  onApprove,
  busy,
}: {
  items: ChatItem[];
  personaState: PersonaState;
  onSend: (text: string) => void;
  onApprove: (requestId: string, approved: boolean) => void;
  busy: boolean;
}) {
  const [input, setInput] = useState("");

  return (
    <>
      <div className="chat-scroll">
        {items.map((it, i) => {
          if (it.kind === "msg") {
            return (
              <div key={i} className={`msg ${it.role}`}>
                <div className="msg-label">{it.role === "user" ? "Kamu" : "Yui"}</div>
                {it.text}
                {it.streaming ? <span className="yui-sub"> ▍</span> : null}
              </div>
            );
          }
          if (it.kind === "activity") {
            return (
              <div key={i} className="activity">
                ⚙️ <code>{it.name}</code> {it.detail ? <span className="yui-sub">{it.detail}</span> : null}{" "}
                {it.isError ? <span className="err">✗ error</span> : <span className="ok">✓</span>}
              </div>
            );
          }
          if (it.kind === "delegation") {
            return (
              <div key={i} className="delegation-card">
                <b>🤝 Delegasi → {it.personaId}</b>
                {it.goal ? <div className="goal">{it.goal}</div> : null}
                {it.childState ? <div className="yui-sub">status anak: {it.childState}</div> : null}
                {it.text ? <div style={{ marginTop: 6 }}>{it.text}</div> : null}
              </div>
            );
          }
          if (it.kind === "approval") {
            return (
              <div key={i} className="approval-card">
                <b>🛂 Approval diminta: <code>{it.name}</code></b>
                <div className="yui-sub">{it.reason}</div>
                {it.resolved ? (
                  <div>{it.resolved === "approved" ? "✅ disetujui" : "🚫 ditolak"}</div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <button className="btn" onClick={() => onApprove(it.requestId!, true)}>Setujui</button>
                    <button className="btn secondary" onClick={() => onApprove(it.requestId!, false)}>Tolak</button>
                  </div>
                )}
              </div>
            );
          }
          return (
            <div key={i} className="activity err">
              ⚠️ {it.text}
            </div>
          );
        })}
        {personaState === "thinking" || personaState === "working" ? (
          <div className="activity">… Yui sedang {personaState === "thinking" ? "berpikir" : "bekerja"} …</div>
        ) : null}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || busy) return;
          onSend(input.trim());
          setInput("");
        }}
      >
        <input
          value={input}
          placeholder={busy ? "Yui sedang bekerja…" : "Tulis tugas untuk Yui…"}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button className="btn" type="submit" disabled={busy || !input.trim()}>
          Kirim
        </button>
      </form>
    </>
  );
}
