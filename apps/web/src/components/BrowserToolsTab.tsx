"use client";

// Gabungan Browser + Terminal (user 2026-11 #5): tata letak ala VS Code —
// Browser = tampilan utama; terminal = panel bawah yang bisa di-hide/dibuka,
// ukurannya di-adjust via drag. Dua view panel: Shell (xterm, sesi shared
// dengan agent) & Commands (log eksekuksi run_command — #7). State persist
// di localStorage (yui.termPanel).
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { apiUrl, authFetch } from "@/lib/api";
import { BrowserTab } from "./BrowserTab";
import { CaretDown, TerminalWindow } from "@phosphor-icons/react";

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

const HEIGHT_MIN = 120;
const HEIGHT_MAX = 560;
const HEIGHT_DEFAULT = 240;

function loadPanelState(): { open: boolean; h: number; view: PanelView } {
  try {
    const raw = window.localStorage.getItem("yui.termPanel");
    if (raw) {
      const p = JSON.parse(raw) as { open?: boolean; h?: number; view?: PanelView };
      return {
        open: p.open !== false,
        h: Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, p.h ?? HEIGHT_DEFAULT)),
        view: p.view === "commands" ? "commands" : "shell",
      };
    }
  } catch {
    /* default */
  }
  return { open: true, h: HEIGHT_DEFAULT, view: "shell" };
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

export function BrowserToolsTab({
  project,
  onFloatScreen,
}: {
  project: { id: string; name: string };
  onFloatScreen?: (personaId: string) => void;
}) {
  const [panel, setPanel] = useState(() =>
    typeof window === "undefined"
      ? { open: true, h: HEIGHT_DEFAULT, view: "shell" as PanelView }
      : loadPanelState(),
  );
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem("yui.termPanel", JSON.stringify(panel));
    } catch {
      /* abaikan */
    }
  }, [panel]);

  /** Drag handle di tepi atas panel: pointer capture, height = startH - dy. */
  const onHandleDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { startY: e.clientY, startH: panel.h };
    },
    [panel.h],
  );
  const onHandleMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const next = d.startH - (e.clientY - d.startY);
    setPanel((p) => ({
      ...p,
      h: Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, next)),
    }));
  }, []);
  const onHandleUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* tampilan utama: Browser */}
      <div className="flex min-h-0 flex-1 flex-col">
        <BrowserTab projectId={project.id} onFloat={onFloatScreen} />
      </div>

      {/* panel terminal ala VS Code */}
      {panel.open ? (
        <section
          aria-label="Terminal panel"
          className="flex flex-none flex-col border-t border-slate-800 bg-[#0d1117]"
          style={{ height: panel.h }}
        >
          <div
            role="separator"
            aria-label="Resize terminal panel"
            aria-orientation="horizontal"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            className="h-1.5 shrink-0 cursor-row-resize bg-transparent transition-colors hover:bg-accent/40"
          />
          <header className="flex flex-none items-center gap-1 px-2 py-1">
            {(["shell", "commands"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={panel.view === v}
                onClick={() => setPanel((p) => ({ ...p, view: v }))}
                className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                  panel.view === v
                    ? "bg-slate-800 text-slate-100"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {v}
              </button>
            ))}
            <small className="ml-2 hidden font-mono text-[10px] text-slate-500 sm:inline">
              {panel.view === "shell"
                ? "shared with the agent (tool terminal)"
                : "run_command log"}
            </small>
            <button
              type="button"
              aria-label="Hide terminal panel"
              title="Hide terminal panel"
              onClick={() => setPanel((p) => ({ ...p, open: false }))}
              className="ml-auto flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            >
              <CaretDown size={13} aria-hidden /> Hide
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden">
            {panel.view === "shell" ? (
              <TerminalTabLazy project={project} />
            ) : (
              <CommandsView projectId={project.id} />
            )}
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setPanel((p) => ({ ...p, open: true }))}
          aria-label="Open terminal panel"
          className="flex flex-none cursor-pointer items-center justify-center gap-1.5 border-t border-slate-800 bg-[#0d1117] py-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200"
        >
          <TerminalWindow size={13} aria-hidden /> Terminal
        </button>
      )}
    </div>
  );
}
