"use client";
/**
 * TracePanel (P1-INF-4) — observability per turn: timeline langkah (model call,
 * tool, delegasi, approval, error) + token per turn dari ledger. Realtime via
 * prop `live` (SSE) — debounce 400ms. DS-1: ui/* + Tailwind + Phosphor.
 */
import { useCallback, useEffect, useState } from "react";
import type { SessionTrace } from "@yui/contracts";
import type { Icon } from "@phosphor-icons/react";
import {
  ArrowLeft,
  BookOpen,
  Brain,
  ChatCircle,
  DotsThree,
  Handshake,
  Notebook,
  ShieldCheck,
  Wrench,
  XCircle,
} from "@phosphor-icons/react";
import { Skeleton } from "./Skeleton";
import { Button, Chip } from "./ui";

const KIND_ICON: Record<string, Icon> = {
  model: Brain,
  tool: Wrench,
  delegate: Handshake,
  approval: ShieldCheck,
  error: XCircle,
  message: ChatCircle,
  skill: BookOpen,
  memory: Notebook,
};
const KIND_TONE: Record<string, string> = {
  model: "text-muted",
  tool: "text-accent",
  delegate: "text-accent",
  approval: "text-warn",
  error: "text-danger",
  message: "text-muted",
  skill: "text-accent",
  memory: "text-accent",
};
const STATUS_TONE: Record<
  string,
  "ok" | "accent" | "warn" | "muted" | "danger"
> = {
  done: "ok",
  running: "accent",
  cancelled: "muted",
  error: "danger",
};
const STATUS_LABEL: Record<string, string> = {
  done: "selesai",
  running: "berjalan…",
  cancelled: "dibatalkan",
  error: "error",
};

export function TracePanel({
  sessionId,
  live,
  onBack,
}: {
  sessionId: string | null;
  /** Naik tiap event SSE baru (realtime) — refetch debounce, bukan polling buta. */
  live?: number;
  onBack: () => void;
}) {
  const [trace, setTrace] = useState<SessionTrace | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      const r = await fetch(`/api/sessions/${sessionId}/trace`);
      if (r.ok) {
        setTrace(await r.json());
        setMissing(false);
      } else if (r.status === 404) {
        setMissing(true); // sesi terhapus (mis. hapus project) — jangan skeleton selamanya
      }
    } catch {
      /* coba lagi di tick berikutnya */
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Fix dev-10: REALTIME via SSE (prop `live` naik per event) — debounce 400ms
  // supaya burst delta tidak menghujani endpoint; menggantikan polling 3 dtk.
  useEffect(() => {
    if (!live) return; // 0 saat mount — initial load sudah dilakukan di atas
    const t = setTimeout(() => void load(), 400);
    return () => clearTimeout(t);
  }, [live, load]);

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("id-ID", { hour12: false });
  const fmtDur = (ms: number | null) =>
    ms === null
      ? ""
      : `${ms >= 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`}`;

  const hint = "px-1 py-6 text-center text-body text-dim";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3 sm:px-6">
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <b className="text-body font-semibold text-primary">Trace sesi</b>
        {sessionId && (
          <small className="font-mono text-caption text-dim">
            {sessionId.slice(0, 14)}…
          </small>
        )}
      </header>
      {sessionId === null ? (
        <p className={hint}>
          Belum ada percakapan aktif — buka atau mulai sesi chat dulu, lalu
          kembali ke sini untuk melihat jejak langkahnya.
        </p>
      ) : missing ? (
        <p className={hint}>
          Sesi ini tidak ditemukan (mungkin terhapus bersama project-nya). Pilih
          sesi lain dari sidebar.
        </p>
      ) : trace === null ? (
        <Skeleton lines={6} />
      ) : trace.turns.length === 0 ? (
        <p className={hint}>Belum ada turn di sesi ini.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {[...trace.turns].reverse().map((t) => (
            <details
              key={t.turnId}
              open={t.status === "running"}
              className="group rounded-lg2 border border-line bg-surface px-3 py-2"
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2.5 select-none [&::-webkit-details-marker]:hidden">
                <Chip tone={STATUS_TONE[t.status] ?? "muted"}>
                  {STATUS_LABEL[t.status] ?? t.status}
                </Chip>
                <span className="font-mono text-caption text-secondary">
                  {fmtTime(t.startedAt)}
                  {t.endedAt ? ` → ${fmtTime(t.endedAt)}` : ""}
                </span>
                <small className="ml-auto text-caption text-dim">
                  {t.steps.length} langkah · {t.tokens.calls}× model ·{" "}
                  {t.tokens.input.toLocaleString("id-ID")}+
                  {t.tokens.output.toLocaleString("id-ID")} tok
                </small>
              </summary>
              <ol className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
                {t.steps.map((s, i) => {
                  const Ic = KIND_ICON[s.kind] ?? DotsThree;
                  return (
                    <li
                      key={i}
                      className="flex items-baseline gap-2.5 text-caption leading-5"
                    >
                      <Ic
                        size={13}
                        aria-hidden
                        className={`shrink-0 self-center ${s.isError ? "text-danger" : (KIND_TONE[s.kind] ?? "text-muted")}`}
                      />
                      <code className="shrink-0 font-mono text-dim">
                        {fmtTime(s.at)}
                      </code>
                      <span
                        className={`min-w-0 flex-1 ${s.isError ? "text-danger" : "text-secondary"}`}
                      >
                        {s.label}
                      </span>
                      {s.durationMs !== null && (
                        <small className="shrink-0 text-dim tabular-nums">
                          {fmtDur(s.durationMs)}
                        </small>
                      )}
                    </li>
                  );
                })}
                {t.steps.length === 0 && (
                  <li className="text-caption text-dim">
                    (tanpa langkah tercatat)
                  </li>
                )}
              </ol>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
