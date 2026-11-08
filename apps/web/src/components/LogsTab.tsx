"use client";

// Batch 14a++ (user 2026-11): tab Logs = observability PROJECT-WIDE, dua view:
//   Activity      : feed semua persona di project ini (tool calls, browser,
//                   vault, delegasi, approval, browsing history), realtime
//                   via poll ringan 2.5s; TIDAK lagi terikat sesi chat aktif.
//   Session Trace : timeline per turn sesi aktif (lama, P1-INF-4).
import { useCallback, useEffect, useState } from "react";
import { apiUrl, authFetch } from "@/lib/api";
import { TracePanel } from "./TracePanel";
import { Chip } from "./ui";
import { Barricade } from "@phosphor-icons/react";

interface ActivityItem {
  at: number;
  personaId: string;
  kind:
    | "tool"
    | "screen"
    | "vault"
    | "delegation"
    | "approval"
    | "qa"
    | "visit";
  label: string;
  isError: boolean;
}

const KIND_TONE: Record<
  ActivityItem["kind"],
  "accent" | "ok" | "info" | "muted" | "warn" | "danger"
> = {
  tool: "accent",
  screen: "info",
  vault: "warn",
  delegation: "info",
  approval: "warn",
  qa: "ok", // SCR-6: QA check, fail di-render danger via isError
  visit: "muted",
};

function ActivityFeed({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await authFetch(
        apiUrl(`/api/projects/${projectId}/activity?limit=200`),
      );
      if (r.ok) {
        const d = (await r.json()) as { activity?: ActivityItem[] };
        setItems(d.activity ?? []);
      }
    } catch {
      /* coba lagi di tick berikutnya */
    }
  }, [projectId]);

  useEffect(() => {
    setItems(null);
    void load();
    const t = setInterval(load, 2_500);
    return () => clearInterval(t);
  }, [load]);

  const fmt = (ts: number) =>
    new Date(ts).toLocaleTimeString("en-US", { hour12: false });

  const hint =
    "overflow-y-auto rounded-lg2 border border-line bg-inset p-2 h-full";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-3">
      {items === null ? (
        <p className="p-3 text-caption text-muted">Loading activity…</p>
      ) : items.length === 0 ? (
        <p className={`${hint} flex items-center justify-center flex-col`}>
          <Barricade className="text-dim" size={48} />
          <span className="text-lg text-dim">No Activity.</span>
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {items.map((a, i) => (
            <li
              key={`${a.at}-${i}`}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md2 px-2 py-1.5 hover:bg-hover"
            >
              <small className="flex-none font-mono text-[11px] text-dim">
                {fmt(a.at)}
              </small>
              <Chip
                size="sm"
                tone={a.isError ? "danger" : KIND_TONE[a.kind]}
                className="flex-none"
              >
                {a.personaId.replace("yui-", "")}
              </Chip>
              <span
                className={`min-w-0 flex-1 truncate font-mono text-caption ${a.isError ? "text-danger" : "text-secondary"}`}
                title={a.label}
              >
                {a.label}
              </span>
              <small className="flex-none text-[10px] uppercase tracking-wide text-dim">
                {a.kind}
              </small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LogsTab({
  projectId,
  sessionId,
  live,
  onBack,
}: {
  projectId: string;
  sessionId: string | null;
  /** Naik tiap event SSE baru, dipakai Session Trace (refetch debounce). */
  live?: number;
  onBack: () => void;
}) {
  const [view, setView] = useState<"activity" | "trace">("activity");

  return (
    <div className="flex min-h-0 flex-1 flex-col mt-3 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center gap-2 justify-between">
        <span className="text-dim text-sm">Logs</span>
        <div className="flex gap-1">
          {(["activity", "trace"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`cursor-pointer rounded-md2 px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                view === v
                  ? "bg-hover text-primary"
                  : "text-dim hover:bg-hover hover:text-secondary"
              }`}
            >
              {v === "activity" ? "Project activity" : "Session trace"}
            </button>
          ))}
        </div>
      </header>
      {view === "activity" ? (
        <ActivityFeed projectId={projectId} />
      ) : (
        <TracePanel sessionId={sessionId} live={live} onBack={onBack} />
      )}
    </div>
  );
}
