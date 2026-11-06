"use client";

// P2-STU-7: Docs tab — deliverable markdown + ringkasan run workflow
// sebagai dokumen terbaca. Kiri: daftar (run reports + file .md project);
// kanan: render Markdown (komponen yang sama dgn chat).
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiUrl, authFetch } from "@/lib/api";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui";
import { PersonaFace } from "@/components/PersonaPicker";

interface StepState {
  id: string;
  personaId: string;
  ok: boolean | null;
  summary: string;
}
interface PhaseState {
  phaseId: string;
  status: "pending" | "running" | "done";
  steps: StepState[];
  gatePassed?: boolean;
}
interface RunRow {
  id: string;
  status: string;
  workflow: { name?: string; phases?: Array<{ id: string; label?: string; gate?: boolean }> };
  phaseStates: PhaseState[];
  createdAt: number;
  updatedAt: number;
}
interface FileNode {
  name: string;
  relPath: string;
  dir: boolean;
  children?: FileNode[];
}

/** Kumpulkan semua file .md dari tree (urut path). */
function collectMd(nodes: FileNode[], out: FileNode[] = []): FileNode[] {
  for (const n of nodes) {
    if (n.dir) collectMd(n.children ?? [], out);
    else if (n.name.toLowerCase().endsWith(".md")) out.push(n);
  }
  return out.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

const STATUS_DOT: Record<string, string> = {
  done: "bg-emerald-500",
  running: "bg-accent animate-pulse",
  awaiting_gate: "bg-amber-500",
  paused: "bg-amber-500",
  failed: "bg-rose-500",
  stopped: "bg-rose-500",
  queued: "bg-dim",
};

/** Run → laporan markdown (ringkasan fase + step + gate). */
function runToMarkdown(run: RunRow): string {
  const label = (pid: string) => run.workflow.phases?.find((p) => p.id === pid)?.label ?? pid;
  const lines: string[] = [];
  lines.push(`# Run report — ${run.workflow.name ?? "workflow"}`, "");
  lines.push(
    `**Run** \`${run.id}\` · **Status** ${run.status} · ${new Date(run.createdAt).toLocaleString()} – ${new Date(run.updatedAt).toLocaleString()}`,
    "",
  );
  for (const ph of run.phaseStates) {
    const gate = ph.gatePassed === undefined ? "" : ph.gatePassed ? " · gate approved" : "";
    lines.push(`## ${label(ph.phaseId)} — ${ph.status}${gate}`, "");
    if (!ph.steps.length) {
      lines.push("_No steps recorded._", "");
      continue;
    }
    for (const st of ph.steps) {
      const mark = st.ok === true ? "x" : st.ok === false ? " " : "·";
      const summary = st.summary ? ` — ${st.summary.replace(/\n+/g, " ")}` : "";
      lines.push(`- [${mark}] **${st.id}** (${st.personaId})${summary}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function DocsTab({ projectId }: { projectId: string }) {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [mdFiles, setMdFiles] = useState<FileNode[]>([]);
  const [sel, setSel] = useState<{ kind: "run"; id: string } | { kind: "file"; path: string } | null>(null);
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [runsR, filesR] = await Promise.all([
        authFetch(apiUrl(`/api/projects/${projectId}/workflows/runs`)),
        authFetch(apiUrl(`/api/projects/${projectId}/files`)),
      ]);
      const runsBody = (await runsR.json()) as { runs?: RunRow[] };
      const filesBody = (await filesR.json()) as { tree?: FileNode[] };
      setRuns((runsBody.runs ?? []).slice().sort((a, b) => b.createdAt - a.createdAt));
      setMdFiles(collectMd(filesBody.tree ?? []));
    } catch {
      setErr("Failed to load docs");
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Buka dokumen terpilih (run → sintesis markdown lokal; file → baca isi).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!sel) return;
      setLoading(true);
      setErr(null);
      try {
        if (sel.kind === "run") {
          const r = await authFetch(apiUrl(`/api/workflows/runs/${sel.id}`));
          if (!r.ok) throw new Error(String(r.status));
          const body = (await r.json()) as { run?: RunRow };
          if (alive && body.run) setText(runToMarkdown(body.run));
        } else {
          const r = await authFetch(apiUrl(`/api/projects/${projectId}/files?path=${encodeURIComponent(sel.path)}`));
          if (!r.ok) throw new Error(String(r.status));
          const body = (await r.json()) as { content?: string };
          if (alive) setText(body.content ?? "");
        }
      } catch {
        if (alive) setErr("Failed to open document");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [sel, projectId]);

  const selLabel = useMemo(() => {
    if (!sel) return null;
    if (sel.kind === "file") return sel.path;
    const r = runs.find((x) => x.id === sel.id);
    return `Run report — ${r?.workflow.name ?? sel.id.slice(0, 8)}`;
  }, [sel, runs]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[260px_1fr]">
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-lg2 border border-line bg-surface p-2">
          <section>
            <h3 className="px-2 pb-1 text-caption font-semibold uppercase tracking-wide text-dim">Run reports</h3>
            {runs.length === 0 ? (
              <p className="px-2 pb-1 text-caption text-muted">No workflow runs yet.</p>
            ) : (
              runs.map((r) => (
                <button
                  key={r.id}
                  className={`flex w-full items-center gap-2 rounded-pill px-2 py-1.5 text-left text-body transition-colors hover:bg-hover ${
                    sel?.kind === "run" && sel.id === r.id ? "bg-hover" : ""
                  }`}
                  onClick={() => setSel({ kind: "run", id: r.id })}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[r.status] ?? "bg-dim"}`} />
                  <span className="min-w-0 flex-1 truncate text-secondary">
                    {r.workflow.name ?? "workflow"} · {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </button>
              ))
            )}
          </section>
          <section>
            <h3 className="px-2 pb-1 text-caption font-semibold uppercase tracking-wide text-dim">Documents</h3>
            {mdFiles.length === 0 ? (
              <p className="px-2 pb-1 text-caption text-muted">No markdown files in project.</p>
            ) : (
              mdFiles.map((f) => (
                <button
                  key={f.relPath}
                  className={`flex w-full items-center gap-2 rounded-pill px-2 py-1.5 text-left text-body transition-colors hover:bg-hover ${
                    sel?.kind === "file" && sel.path === f.relPath ? "bg-hover" : ""
                  }`}
                  onClick={() => setSel({ kind: "file", path: f.relPath })}
                >
                  <span className="text-caption text-dim">MD</span>
                  <span className="min-w-0 flex-1 truncate text-secondary">{f.relPath}</span>
                </button>
              ))
            )}
          </section>
          <div className="mt-auto px-2 pt-2">
            <Button variant="ghost" className="w-full" onClick={() => void refresh()}>
              Refresh
            </Button>
          </div>
        </aside>
        <section className="flex min-h-0 flex-col rounded-lg2 border border-line bg-surface">
          {err && <p className="p-3 text-body text-rose-400">{err}</p>}
          {!sel && !err && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <span className="text-caption text-muted">Select a run report or a document to read it here.</span>
            </div>
          )}
          {sel && (
            <>
              <header className="flex flex-none items-center gap-2 border-b border-line px-3 py-2">
                {sel.kind === "run" && <PersonaFace personaId="yui-conductor" size={18} />}
                <b className="min-w-0 flex-1 truncate text-body text-primary">{selLabel}</b>
                {loading && <span className="text-caption text-dim">loading…</span>}
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <Markdown text={text} />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
