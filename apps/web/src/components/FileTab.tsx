"use client";
import { apiUrl, authFetch } from "@/lib/api";
// Tab File (P2-STU-3 v0 → merge Docs P2-STU-7, 2026-11-08): SATU konsep
// "artefak project" — tree file kiri (+ seksi Run reports di atasnya) dan
// viewer kanan. File .md default ter-render (toggle Rendered/Source),
// revisi & diff tetap utk file asli; run report workflow disintesis
// markdown lokal. Semua request memakai authFetch (FIX bug user:
// "authentication required" saat buka file — fetch polos tanpa token).
// DS-1: ui/* + Tailwind + Phosphor.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FileNode } from "@yuika/contracts";
import type { Icon } from "@phosphor-icons/react";
import {
  ArrowsClockwise,
  CaretDown,
  CaretRight,
  File,
  FileDoc,
  FolderSimple,
  UploadSimple,
} from "@phosphor-icons/react";
import { SkeletonRows } from "./Skeleton";
import { Button, Select } from "./ui";
import { toastErr, toastOk } from "./ui/toast";
import { diffLines, diffStat } from "@yuika/core/project/diff";
import { Markdown } from "./Markdown";

interface Content {
  content: string;
  size: number;
  truncated: boolean;
}
interface Revision {
  rev: number;
  bytes: number;
  createdAt: number;
}
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
type Sel = { kind: "file"; path: string } | { kind: "run"; id: string } | null;

const TEXT_EXT = new Set([
  "md",
  "txt",
  "json",
  "yaml",
  "yml",
  "html",
  "css",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "sh",
  "csv",
  "xml",
  "toml",
  "ini",
  "env",
  "log",
  "svg",
  "sql",
]);

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const DirIcon: Icon = FolderSimple;
const FileIcon: Icon = FileDoc;

/** Run → laporan markdown (ringkasan fase + step + gate) — dari DocsTab lama. */
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

const STATUS_DOT: Record<string, string> = {
  done: "bg-emerald-500",
  running: "bg-accent animate-pulse",
  awaiting_gate: "bg-amber-500",
  paused: "bg-amber-500",
  failed: "bg-rose-500",
  stopped: "bg-rose-500",
  queued: "bg-dim",
};

function TreeRow({
  node,
  depth,
  selPath,
  onPick,
}: {
  node: FileNode;
  depth: number;
  selPath: string | null;
  onPick: (n: FileNode) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const isDir = node.dir;
  return (
    <>
      <button
        aria-selected={selPath === node.relPath ? true : undefined}
        className={`flex w-full cursor-pointer items-center gap-1.5 rounded-md2 px-1.5 py-1 text-left text-[13px] leading-5 transition-colors ${
          selPath === node.relPath
            ? "bg-hover font-semibold text-primary"
            : "text-secondary hover:bg-hover hover:text-primary"
        }`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => (isDir ? setOpen(!open) : onPick(node))}
      >
        <span className="w-3.5 shrink-0 self-center">
          {isDir ? (
            open ? (
              <CaretDown size={11} aria-hidden className="text-dim" />
            ) : (
              <CaretRight size={11} aria-hidden className="text-dim" />
            )
          ) : null}
        </span>
        {isDir ? (
          <DirIcon
            size={13}
            aria-hidden
            className="shrink-0 self-center text-dim"
          />
        ) : (
          <FileIcon
            size={13}
            aria-hidden
            className="shrink-0 self-center text-dim"
          />
        )}
        <span className="truncate">{node.name}</span>
        {!isDir && (
          <small className="ml-auto shrink-0 text-[11px] text-dim">
            {fmtSize(node.size)}
          </small>
        )}
      </button>
      {isDir &&
        open &&
        node.children?.map((c) => (
          <TreeRow
            key={c.relPath}
            node={c}
            depth={depth + 1}
            selPath={selPath}
            onPick={onPick}
          />
        ))}
    </>
  );
}

export function FileTab({ projectId }: { projectId: string }) {
  const [tree, setTree] = useState<FileNode[] | null>(null);
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [diffRev, setDiffRev] = useState<string>("");
  const [diff, setDiff] = useState<{
    ops: { t: string; line: string }[];
    added: number;
    removed: number;
  } | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  // mode tampilan .md / run report: rendered (default, pengalaman baca) vs source
  const [view, setView] = useState<"rendered" | "source">("rendered");

  const loadTree = useCallback(async () => {
    try {
      const [t, rs] = await Promise.all([
        authFetch(apiUrl(`/api/projects/${projectId}/files`)),
        authFetch(apiUrl(`/api/projects/${projectId}/workflows/runs`)),
      ]);
      if (t.ok) setTree(((await t.json()) as { tree: FileNode[] }).tree);
      else
        toastErr(
          (((await t.json()) as { error?: string }).error ??
            "failed to load files") + "",
        );
      if (rs.ok)
        setRuns(
          ((await rs.json()) as { runs?: RunRow[] }).runs
            ?? [],
        );
    } catch {
      toastErr("could not reach the server");
    }
    // sinkronkan file yang sedang dibuka bila ditimpa agent di background
    // (FIX: authFetch — dulu fetch polos → 401 "authentication required")
    if (sel?.kind === "file") {
      try {
        const [c, rv] = await Promise.all([
          authFetch(
            apiUrl(
              `/api/projects/${projectId}/files?path=${encodeURIComponent(sel.path)}`,
            ),
          ),
          authFetch(
            apiUrl(
              `/api/projects/${projectId}/files?path=${encodeURIComponent(sel.path)}&revisions=1`,
            ),
          ),
        ]);
        if (c.ok) setContent((await c.json()) as Content);
        if (rv.ok)
          setRevisions(
            ((await rv.json()) as { revisions: Revision[] }).revisions,
          );
      } catch {
        /* biarkan state lama */
      }
    }
  }, [projectId, sel]);

  // latest-ref: effect reset (dep projectId) selalu memanggil loadTree terbaru
  const loadTreeRef = useRef(loadTree);
  loadTreeRef.current = loadTree;

  // Reset hanya saat GANTI PROJECT — jangan ikut identitas loadTree (dep `sel`):
  // FIX test user #2: klik file → sel berubah → loadTree baru → effect lama
  // me-reset sel ke null → pane kanan tak pernah menampilkan isi file.
  useEffect(() => {
    setTree(null);
    setRuns(null);
    setSel(null);
    setContent(null);
    setRevisions([]);
    setDiff(null);
    setView("rendered");
    void loadTreeRef.current();
  }, [projectId]);

  // FIX test user: file baru hasil agent tidak muncul — refresh berkala saat tab
  // terbuka + saat jendela kembali fokus (write_file bisa terjadi di background).
  useEffect(() => {
    const poll = setInterval(() => void loadTree(), 5_000);
    const onFocus = () => void loadTree();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadTree]);

  async function pick(n: FileNode) {
    setSel({ kind: "file", path: n.relPath });
    setContent(null);
    setRevisions([]);
    setDiff(null);
    setDiffRev("");
    setLoadingContent(true);
    try {
      // FIX: authFetch (bug user "authentication required" saat buka file)
      const [c, r] = await Promise.all([
        authFetch(
          apiUrl(
            `/api/projects/${projectId}/files?path=${encodeURIComponent(n.relPath)}`,
          ),
        ),
        authFetch(
          apiUrl(
            `/api/projects/${projectId}/files?path=${encodeURIComponent(n.relPath)}&revisions=1`,
          ),
        ),
      ]);
      const cd = (await c.json()) as Content & { error?: string };
      if (!c.ok) {
        toastErr(cd.error ?? "failed to read file");
        return;
      }
      setContent(cd);
      if (r.ok)
        setRevisions(((await r.json()) as { revisions: Revision[] }).revisions);
    } finally {
      setLoadingContent(false);
    }
  }

  /** Buka run report workflow (detail run → sintesis markdown lokal). */
  async function pickRun(id: string) {
    setSel({ kind: "run", id });
    setContent(null);
    setRevisions([]);
    setDiff(null);
    setDiffRev("");
    setView("rendered");
    setLoadingContent(true);
    try {
      const r = await authFetch(apiUrl(`/api/workflows/runs/${id}`));
      const body = (await r.json()) as { run?: RunRow };
      if (!r.ok || !body.run) {
        toastErr("failed to load run report");
        return;
      }
      setContent({ content: runToMarkdown(body.run), size: 0, truncated: false });
    } finally {
      setLoadingContent(false);
    }
  }

  /** Diff isi sekarang vs satu revisi lama (server kirim konten revisi; diff lokal). */
  async function showDiff(rev: string) {
    setDiffRev(rev);
    setDiff(null);
    if (!sel || sel.kind !== "file" || !rev || !content) return;
    const r = await authFetch(
      apiUrl(
        `/api/projects/${projectId}/files?path=${encodeURIComponent(sel.path)}&rev=${rev}`,
      ),
    );
    if (!r.ok) return;
    const old = ((await r.json()) as { content: string | null }).content ?? "";
    const ops = diffLines(old, content.content);
    setDiff({ ops, ...diffStat(ops) });
  }

  const selPath = sel?.kind === "file" ? sel.path : null;
  const selLabel =
    sel?.kind === "file"
      ? sel.path
      : sel?.kind === "run"
        ? `Run report — ${runs?.find((x) => x.id === sel.id)?.workflow.name ?? sel.id.slice(0, 8)}`
        : null;
  const isMd =
    (selPath?.toLowerCase().endsWith(".md") ?? false) || sel?.kind === "run";
  const isText = selPath
    ? TEXT_EXT.has(selPath.split(".").pop()!.toLowerCase())
    : false;

  /** Upload dokumen user → uploads/ (lalu minta scribe membacanya via doc_read). */
  async function upload(f: File) {
    // FIX: authFetch + content-type hanya bila ada body
    const r = await authFetch(
      apiUrl(
        `/api/projects/${projectId}/uploads?name=${encodeURIComponent(f.name)}`,
      ),
      { method: "POST", body: await f.arrayBuffer() },
    );
    if (!r.ok) {
      toastErr(
        ((await r.json()) as { error?: string }).error ?? "upload failed",
      );
      return;
    }
    toastOk(`${f.name} uploaded — ask Poe Yui to read it via doc_read.`);
    await loadTree();
  }

  const pane =
    "overflow-y-auto rounded-lg2 border border-line bg-inset p-2 h-full";

  return (
    <section aria-label="Project files" className="flex flex-col gap-2.5">
      <div className="flex justify-end gap-2">
        <label title="Upload a document (pdf/xlsx/csv/…) → uploads/ folder, read by the agent via doc_read">
          <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-md2 border border-line-strong px-3 py-1.5 text-[13px] font-medium text-secondary transition-colors hover:bg-hover hover:text-primary">
            <UploadSimple size={13} aria-hidden /> Upload
          </span>
          <input
            type="file"
            hidden
            accept=".pdf,.xlsx,.xls,.csv,.md,.txt,.json,.html,.htm,.xml,.yaml,.yml"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
        <Button
          size="md"
          onClick={() => void loadTree()}
          title="Reload file list"
        >
          <ArrowsClockwise size={12} aria-hidden />
        </Button>
      </div>
      <div className="grid min-h-80 grid-cols-[minmax(210px,290px)_minmax(0,1fr)] gap-3 h-[85dvh]">
        <div className={pane} role="tree">
          {/* Run reports — diserap dari tab Docs (P2-STU-7 merge, 2026-11-08) */}
          <h3 className="px-1.5 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-dim">
            Run reports
          </h3>
          {runs === null ? null : runs.length === 0 ? (
            <p className="px-1.5 pb-1.5 text-caption text-muted">
              No workflow runs yet.
            </p>
          ) : (
            runs.map((r) => (
              <button
                key={r.id}
                aria-selected={sel?.kind === "run" && sel.id === r.id ? true : undefined}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-md2 px-1.5 py-1 text-left text-[13px] leading-5 transition-colors ${
                  sel?.kind === "run" && sel.id === r.id
                    ? "bg-hover font-semibold text-primary"
                    : "text-secondary hover:bg-hover hover:text-primary"
                }`}
                onClick={() => void pickRun(r.id)}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[r.status] ?? "bg-dim"}`}
                  aria-label={r.status}
                />
                <span className="min-w-0 flex-1 truncate">
                  {r.workflow.name ?? "workflow"} ·{" "}
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </button>
            ))
          )}
          <div className="my-1.5 border-t border-line" aria-hidden />
          {tree === null ? (
            <SkeletonRows rows={5} />
          ) : tree.length === 0 ? (
            <p className="text-caption text-dim">Project belum punya file.</p>
          ) : (
            tree.map((n) => (
              <TreeRow
                key={n.relPath}
                node={n}
                depth={0}
                selPath={selPath}
                onPick={pick}
              />
            ))
          )}
        </div>
        <div className={pane}>
          {loadingContent && <SkeletonRows rows={4} />}
          {!loadingContent && sel?.kind === "file" && content?.truncated && (
            <p className="text-caption text-dim">
              File terlalu besar untuk dibaca ({fmtSize(content.size)} &gt; 256
              KB) — buka di file explorer.
            </p>
          )}
          {!loadingContent &&
            sel?.kind === "file" &&
            content &&
            !content.truncated &&
            !isText && (
              <p className="text-caption text-dim">
                Bukan file teks ({fmtSize(content.size)}) — preview teks tidak
                tersedia.
              </p>
            )}
          {!loadingContent &&
            sel &&
            content &&
            !content.truncated &&
            (isText || isMd) && (
              <>
                <header className="mb-2 flex items-center gap-2 border-b border-line pb-2">
                  <b className="min-w-0 flex-1 truncate font-mono text-caption font-semibold text-primary">
                    {selLabel}
                  </b>
                  {isMd && (
                    <span
                      className="flex shrink-0 overflow-hidden rounded-md2 border border-line"
                      role="group"
                      aria-label="View mode"
                    >
                      {(["rendered", "source"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={view === m}
                          className={`cursor-pointer px-2 py-0.5 text-[11px] font-medium capitalize transition-colors ${
                            view === m
                              ? "bg-hover text-primary"
                              : "text-dim hover:bg-hover hover:text-secondary"
                          }`}
                          onClick={() => setView(m)}
                        >
                          {m}
                        </button>
                      ))}
                    </span>
                  )}
                  {sel.kind === "file" && revisions.length > 0 && (
                    <Select
                      value={diffRev}
                      onChange={(e) => void showDiff(e.target.value)}
                      aria-label="Bandingkan dengan revisi"
                      className="h-7"
                    >
                      <option value="">revisi…</option>
                      {revisions.map((r) => (
                        <option key={r.rev} value={r.rev}>
                          r{r.rev} ·{" "}
                          {new Date(r.createdAt).toLocaleTimeString()}
                        </option>
                      ))}
                    </Select>
                  )}
                  {sel.kind === "file" && (
                    <small className="shrink-0 text-caption text-dim">
                      {fmtSize(content.size)}
                    </small>
                  )}
                </header>
                {diff ? (
                  <div aria-label="Diff vs revisi">
                    <p className="mb-1.5 text-caption text-secondary">
                      vs r{diffRev}:{" "}
                      <b className="text-success">+{diff.added}</b>{" "}
                      <b className="text-danger">−{diff.removed}</b> baris
                    </p>
                    <pre className="overflow-x-auto font-mono text-[12.5px] leading-5">
                      {diff.ops.map((o, i) => (
                        <span
                          key={i}
                          className={`block ${
                            o.t === "+"
                              ? "bg-success/10 text-success"
                              : o.t === "-"
                                ? "bg-danger/10 text-danger"
                                : "text-muted"
                          }`}
                        >
                          {o.t === "+" ? "+" : o.t === "-" ? "−" : " "} {o.line}
                        </span>
                      ))}
                    </pre>
                  </div>
                ) : isMd && view === "rendered" ? (
                  <div className="max-w-none px-1">
                    <Markdown text={content.content} />
                  </div>
                ) : (
                  <pre className="overflow-x-auto font-mono text-[12.5px] leading-5 text-secondary">
                    {content.content}
                  </pre>
                )}
              </>
            )}
          {!sel && (
            <div className="flex items-center justify-center h-full flex-col gap-3">
              <File className="text-dim" size={48} />
              <p className="text-lg text-dim">No File.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
