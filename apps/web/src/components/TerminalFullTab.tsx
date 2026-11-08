"use client";

// ++ (user 2026-11): tab Browser dibongkar, reader + Live pindah
// (reader dihapus; live screen = floating window via bubble chat). Tab ini
// kini TERMINAL PENUH: Shell (xterm, sesi shared agent) | Commands (log
// run_command). View pilihan persist localStorage yui.termView.
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { apiUrl, authFetch } from "@/lib/api";

const TerminalTabLazy = dynamic(() => import("./TerminalTab"), {
  ssr: false,
  loading: () => (
    <div className="p-4 text-caption text-dim">Loading terminal…</div>
  ),
});

type PanelView = "shell" | "commands";

interface CommandEntry {
  id: number;
  ts: number;
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  note?: string;
}

/** View "Commands": log run_command per project (poll 2.5s saat terlihat). */
function CommandsView({ projectId }: { projectId: string }) {
  const [cmds, setCmds] = useState<CommandEntry[]>([]);

  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const r = await authFetch(
          apiUrl(`/api/projects/${projectId}/terminal/commands?limit=50`),
        );
        if (!dead && r.ok) {
          const d = (await r.json()) as { commands?: CommandEntry[] };
          setCmds(d.commands ?? []);
        }
      } catch {
        /* coba lagi di tick berikutnya */
      }
    };
    void load();
    const t = setInterval(load, 2_500);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [projectId]);

  if (cmds.length === 0)
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-caption text-dim">
        No agent commands yet, every run_command (node / npm / npx) shows up
        here live while a workflow or delegation works.
      </div>
    );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg2 border border-line bg-inset p-2">
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {cmds.map((c) => (
          <li key={c.id}>
            <details className="rounded-md2 hover:bg-hover">
              <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md2 px-2 py-1.5 select-none [&::-webkit-details-marker]:hidden">
                <small className="flex-none font-mono text-[11px] text-dim">
                  {new Date(c.ts).toLocaleTimeString("en-US", {
                    hour12: false,
                  })}
                </small>
                <span
                  className={`flex-none rounded-pill border px-1.5 py-px text-[10px] font-semibold ${
                    c.exitCode === 0
                      ? "border-success/30 bg-success-soft text-success"
                      : c.exitCode === null
                        ? "border-warning/30 bg-warning-soft text-warning"
                        : "border-danger/30 bg-danger-soft text-danger"
                  }`}
                >
                  {c.exitCode === null ? "n/a" : `exit ${c.exitCode}`}
                </span>
                <code
                  className="min-w-0 flex-1 truncate font-mono text-caption text-secondary"
                  title={`$ ${c.command} ${c.args.join(" ")}`}
                >
                  $ {c.command} {c.args.join(" ")}
                </code>
                {c.note && (
                  <small className="flex-none text-[10px] uppercase tracking-wide text-dim">
                    {c.note}
                  </small>
                )}
              </summary>
              {(c.stdout || c.stderr) && (
                <pre className="max-h-48 overflow-auto border-t border-line px-2 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-secondary">
                  {c.stdout}
                  {c.stderr && <span className="text-danger">{c.stderr}</span>}
                </pre>
              )}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The Shell/Commands switcher, mounted on the RIGHT END of the status row
 *  (in line with the "● live" pill), not a separate header above. */
function ViewSwitcher({
  view,
  onPick,
}: {
  view: PanelView;
  onPick: (v: PanelView) => void;
}) {
  return (
    <div
      className="ml-auto flex shrink-0 items-center gap-1"
      role="group"
      aria-label="Terminal view"
    >
      {(["shell", "commands"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onPick(v)}
          className={`cursor-pointer rounded-md2 px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
            view === v
              ? "bg-hover text-primary"
              : "text-dim hover:bg-hover hover:text-secondary"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

export function TerminalFullTab({
  project,
}: {
  project: { id: string; name: string };
}) {
  const [view, setView] = useState<PanelView>(() => {
    try {
      return window.localStorage.getItem("yui.termView") === "commands"
        ? "commands"
        : "shell";
    } catch {
      return "shell";
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("yui.termView", view);
    } catch {
      /* abaikan */
    }
  }, [view]);

  const pick = useCallback((v: PanelView) => setView(v), []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {view === "shell" ? (
        <TerminalTabLazy
          project={project}
          toolbar={<ViewSwitcher view={view} onPick={pick} />}
        />
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-2.5 py-4">
          <div className="flex items-center gap-2 text-sm text-dim">
            <span>Command Log</span>
            <ViewSwitcher view={view} onPick={pick} />
          </div>
          <CommandsView projectId={project.id} />
        </div>
      )}
    </div>
  );
}
