"use client";

// Batch 14a++ (user 2026-11): tab Browser dibongkar — reader + Live pindah
// (reader dihapus; live screen = floating window via bubble chat). Tab ini
// kini TERMINAL PENUH: Shell (xterm, sesi shared agent) | Commands (log
// run_command). View pilihan persist localStorage yui.termView.
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { apiUrl, authFetch } from "@/lib/api";

const TerminalTabLazy = dynamic(() => import("./TerminalTab"), {
  ssr: false,
  loading: () => (
    <div className="p-3 text-caption text-slate-400">Loading terminal…</div>
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
      <div className="flex h-full items-center justify-center p-4 text-center text-caption text-slate-400">
        No agent commands yet — every run_command (node / npm / npx) shows up
        here live while a workflow or delegation works.
      </div>
    );

  return (
    <div className="h-full overflow-y-auto p-2">
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {cmds.map((c) => (
          <li
            key={c.id}
            className="rounded-md border border-slate-800 bg-slate-900/60"
          >
            <details>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-2.5 py-1.5 select-none [&::-webkit-details-marker]:hidden">
                <code className="font-mono text-xs text-slate-200">
                  $ {c.command} {c.args.join(" ")}
                </code>
                <span
                  className={`rounded-pill px-1.5 text-[10px] font-semibold ${
                    c.exitCode === 0
                      ? "bg-emerald-500/15 text-emerald-400"
                      : c.exitCode === null
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-rose-500/15 text-rose-400"
                  }`}
                >
                  {c.exitCode === null ? "n/a" : `exit ${c.exitCode}`}
                </span>
                {c.note && (
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                    {c.note}
                  </span>
                )}
                <small className="ml-auto font-mono text-[10px] text-slate-500">
                  {new Date(c.ts).toLocaleTimeString("en-US", { hour12: false })}
                </small>
              </summary>
              {(c.stdout || c.stderr) && (
                <pre className="max-h-48 overflow-auto border-t border-slate-800 px-2.5 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-slate-300">
                  {c.stdout}
                  {c.stderr && (
                    <span className="text-rose-400">{c.stderr}</span>
                  )}
                </pre>
              )}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TerminalFullTab({ project }: { project: { id: string; name: string } }) {
  const [view, setView] = useState<PanelView>(() => {
    try {
      return window.localStorage.getItem("yui.termView") === "commands" ? "commands" : "shell";
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
    <div className="flex min-h-0 flex-1 flex-col bg-[#0d1117]">
      <header className="flex flex-none items-center gap-1 border-b border-slate-800 px-2 py-1">
        {(["shell", "commands"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => pick(v)}
            className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
              view === v
                ? "bg-slate-800 text-slate-100"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {v}
          </button>
        ))}
        <small className="ml-2 hidden font-mono text-[10px] text-slate-500 sm:inline">
          {view === "shell"
            ? "shared with the agent (tool terminal)"
            : "run_command log"}
        </small>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        {view === "shell" ? (
          <TerminalTabLazy project={project} />
        ) : (
          <CommandsView projectId={project.id} />
        )}
      </div>
    </div>
  );
}
