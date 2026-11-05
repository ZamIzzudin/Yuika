"use client";
import { apiUrl, authFetch } from "@/lib/api";
// Tab File (P2-STU-3 v0): tree kiri + viewer kanan. Artefak agent (reports/,
// code/, MEMORY.md) bisa diperiksa tanpa keluar app. File teks/kode ≤256 KB
// dibaca; selain itu tampil info ukuran. DS-1: ui/* + Tailwind + Phosphor.
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
import { Button, Select, TextInput } from "./ui";
import { toastErr, toastOk } from "./ui/toast";
import { diffLines, diffStat } from "@yuika/core/project/diff";

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

function TreeRow({
  node,
  depth,
  sel,
  onPick,
}: {
  node: FileNode;
  depth: number;
  sel: string | null;
  onPick: (n: FileNode) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const isDir = node.dir;
  return (
    <>
      <button
        aria-selected={sel === node.relPath ? true : undefined}
        className={`flex w-full cursor-pointer items-center gap-1.5 rounded-md2 px-1.5 py-1 text-left text-[13px] leading-5 transition-colors ${
          sel === node.relPath
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
            sel={sel}
            onPick={onPick}
          />
        ))}
    </>
  );
}

export function FileTab({ projectId }: { projectId: string }) {
  const [tree, setTree] = useState<FileNode[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [diffRev, setDiffRev] = useState<string>("");
  const [diff, setDiff] = useState<{
    ops: { t: string; line: string }[];
    added: number;
    removed: number;
  } | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  const loadTree = useCallback(async () => {
    try {
      const r = await authFetch(apiUrl(`/api/projects/${projectId}/files`));
      if (r.ok) setTree(((await r.json()) as { tree: FileNode[] }).tree);
      else
        toastErr(
          (((await r.json()) as { error?: string }).error ??
            "failed to load files") + "",
        );
    } catch {
      toastErr("could not reach the server");
    }
    // sinkronkan file yang sedang dibuka bila ditimpa agent di background
    if (sel) {
      try {
        const [c, rv] = await Promise.all([
          fetch(
            apiUrl(
              `/api/projects/${projectId}/files?path=${encodeURIComponent(sel)}`,
            ),
          ),
          fetch(
            apiUrl(
              `/api/projects/${projectId}/files?path=${encodeURIComponent(sel)}&revisions=1`,
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
    setSel(null);
    setContent(null);
    setRevisions([]);
    setDiff(null);
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
    setSel(n.relPath);
    setContent(null);
    setRevisions([]);
    setDiff(null);
    setDiffRev("");
    setLoadingContent(true);
    try {
      const [c, r] = await Promise.all([
        fetch(
          apiUrl(
            `/api/projects/${projectId}/files?path=${encodeURIComponent(n.relPath)}`,
          ),
        ),
        fetch(
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

  /** Diff isi sekarang vs satu revisi lama (server kirim konten revisi; diff lokal). */
  async function showDiff(rev: string) {
    setDiffRev(rev);
    setDiff(null);
    if (!sel || !rev || !content) return;
    const r = await fetch(
      apiUrl(
        `/api/projects/${projectId}/files?path=${encodeURIComponent(sel)}&rev=${rev}`,
      ),
    );
    if (!r.ok) return;
    const old = ((await r.json()) as { content: string | null }).content ?? "";
    const ops = diffLines(old, content.content);
    setDiff({ ops, ...diffStat(ops) });
  }

  const isText = sel
    ? TEXT_EXT.has(sel.split(".").pop()!.toLowerCase())
    : false;

  /** Upload dokumen user → uploads/ (lalu minta scribe membacanya via doc_read). */
  async function upload(f: File) {
    const r = await fetch(
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
      <div className="grid min-h-80 grid-cols-[minmax(200px,260px)_minmax(0,1fr)] gap-3 h-[85dvh]">
        <div className={pane} role="tree">
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
                sel={sel}
                onPick={pick}
              />
            ))
          )}
        </div>
        <div className={pane}>
          {loadingContent && <SkeletonRows rows={4} />}
          {!loadingContent && sel && content?.truncated && (
            <p className="text-caption text-dim">
              File terlalu besar untuk dibaca ({fmtSize(content.size)} &gt; 256
              KB) — buka di file explorer.
            </p>
          )}
          {!loadingContent &&
            sel &&
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
            isText && (
              <>
                <header className="mb-2 flex items-center gap-2 border-b border-line pb-2">
                  <b className="min-w-0 flex-1 truncate font-mono text-caption font-semibold text-primary">
                    {sel}
                  </b>
                  {revisions.length > 0 && (
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
                  <small className="shrink-0 text-caption text-dim">
                    {fmtSize(content.size)}
                  </small>
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
