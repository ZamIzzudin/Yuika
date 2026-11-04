"use client";
/**
 * TracePanel (P1-INF-4) — observability per turn: timeline langkah (model call,
 * tool, delegasi, approval, error) + token per turn dari ledger. Poll 3 dtk
 * saat terbuka; turn berjalan ditandai "running".
 */
import { useCallback, useEffect, useState } from "react";
import type { SessionTrace } from "@yui/contracts";
import { Skeleton } from "./Skeleton";

const KIND_ICON: Record<string, string> = {
  model: "🧠",
  tool: "🔧",
  delegate: "🤝",
  approval: "🛂",
  error: "❌",
  message: "💬",
  skill: "📘",
  memory: "🧠",
  other: "·",
};

const STATUS_LABEL: Record<string, string> = {
  done: "selesai",
  running: "berjalan…",
  cancelled: "dibatalkan",
  error: "error",
};

export function TracePanel({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const [trace, setTrace] = useState<SessionTrace | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/sessions/${sessionId}/trace`);
      if (r.ok) setTrace(await r.json());
    } catch {
      /* coba lagi di tick berikutnya */
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 3_000);
    return () => clearInterval(t);
  }, [load]);

  const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("id-ID", { hour12: false });
  const fmtDur = (ms: number | null) => (ms === null ? "" : `${ms >= 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`}`);

  return (
    <div className="trace-view">
      <header className="trace-head">
        <b>🧭 Trace sesi</b>
        <small className="dim">
          <code>{sessionId.slice(0, 14)}…</code>
        </small>
        <button className="btn secondary" onClick={onBack}>
          ← Kembali ke chat
        </button>
      </header>
      {trace === null ? (
        <Skeleton lines={6} />
      ) : trace.turns.length === 0 ? (
        <p className="pane-hint">Belum ada turn di sesi ini.</p>
      ) : (
        <div className="trace-turns">
          {[...trace.turns].reverse().map((t) => (
            <details key={t.turnId} open={t.status === "running"}>
              <summary>
                <span className={`trace-status trace-${t.status}`}>{STATUS_LABEL[t.status]}</span>
                <span>
                  {fmtTime(t.startedAt)}
                  {t.endedAt ? ` → ${fmtTime(t.endedAt)}` : ""}
                </span>
                <small className="dim">
                  {t.steps.length} langkah · {t.tokens.calls}× model · {t.tokens.input.toLocaleString("id-ID")}+
                  {t.tokens.output.toLocaleString("id-ID")} tok
                </small>
              </summary>
              <ol className="trace-steps">
                {t.steps.map((s, i) => (
                  <li key={i} data-kind={s.kind} data-error={s.isError ? "" : undefined}>
                    <span className="trace-icon">{KIND_ICON[s.kind] ?? "·"}</span>
                    <code>{fmtTime(s.at)}</code>
                    <span className="trace-label">{s.label}</span>
                    {s.durationMs !== null && <small className="dim">{fmtDur(s.durationMs)}</small>}
                  </li>
                ))}
                {t.steps.length === 0 && <li className="dim">(tanpa langkah tercatat)</li>}
              </ol>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
