"use client";
// Tab File (P2-STU-3 v0): tree kiri + viewer kanan. Artefak agent (reports/,
// code/, MEMORY.md) bisa diperiksa tanpa keluar app. File teks/kode ≤256 KB
// dibaca; selain itu tampil info ukuran. Diff hasil edit = penyusul (butuh snapshot lama).
import { useCallback, useEffect, useRef, useState } from "react";
import type { FileNode } from "@yui/contracts";
import { SkeletonRows } from "./Skeleton";
import { diffLines, diffStat } from "@yui/core/project/diff";

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
        className="file-row"
        data-dir={isDir ? "" : undefined}
        data-sel={sel === node.relPath ? "" : undefined}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => (isDir ? setOpen(!open) : onPick(node))}
      >
        <span className="file-ico">{isDir ? (open ? "▾" : "▸") : "•"}</span>
        <span className="file-name">{node.name}</span>
        {!isDir && <small className="file-size">{fmtSize(node.size)}</small>}
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
  const [err, setErr] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/files`);
      if (r.ok) setTree(((await r.json()) as { tree: FileNode[] }).tree);
      else
        setErr(
          (((await r.json()) as { error?: string }).error ??
            "gagal memuat file") + "",
        );
    } catch {
      setErr("gagal menghubungi server");
    }
    // sinkronkan file yang sedang dibuka bila ditimpa agent di background
    if (sel) {
      try {
        const [c, rv] = await Promise.all([
          fetch(
            `/api/projects/${projectId}/files?path=${encodeURIComponent(sel)}`,
          ),
          fetch(
            `/api/projects/${projectId}/files?path=${encodeURIComponent(sel)}&revisions=1`,
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
    setErr(null);
    try {
      const [c, r] = await Promise.all([
        fetch(
          `/api/projects/${projectId}/files?path=${encodeURIComponent(n.relPath)}`,
        ),
        fetch(
          `/api/projects/${projectId}/files?path=${encodeURIComponent(n.relPath)}&revisions=1`,
        ),
      ]);
      const cd = (await c.json()) as Content & { error?: string };
      if (!c.ok) setErr(cd.error ?? "gagal membaca file");
      else setContent(cd);
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
      `/api/projects/${projectId}/files?path=${encodeURIComponent(sel)}&rev=${rev}`,
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
    setErr(null);
    const r = await fetch(
      `/api/projects/${projectId}/uploads?name=${encodeURIComponent(f.name)}`,
      {
        method: "POST",
        body: await f.arrayBuffer(),
      },
    );
    if (!r.ok) {
      setErr(((await r.json()) as { error?: string }).error ?? "gagal upload");
      return;
    }
    await loadTree();
  }

  return (
    <section className="file-tab" aria-label="File project">
      <div className="file-toolbar">
        <label
          className="btn secondary"
          title="Upload dokumen (pdf/xlsx/csv/…) → folder uploads/, dibaca agent via doc_read"
        >
          ⬆ Upload dokumen
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
        <button
          className="btn secondary"
          onClick={() => void loadTree()}
          title="Muat ulang daftar file"
        >
          ↻ Segarkan
        </button>
      </div>
      <div className="file-split">
        <div className="file-tree" role="tree">
          {tree === null ? (
            <SkeletonRows rows={5} />
          ) : tree.length === 0 ? (
            <p className="dim">Project belum punya file.</p>
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
        <div className="file-view">
          {loadingContent && <SkeletonRows rows={4} />}
          {!loadingContent && err && <p className="project-err">{err}</p>}
          {!loadingContent && !err && sel && content?.truncated && (
            <p className="dim">
              File terlalu besar untuk dibaca ({fmtSize(content.size)} &gt; 256
              KB) — buka di file explorer.
            </p>
          )}
          {!loadingContent &&
            !err &&
            sel &&
            content &&
            !content.truncated &&
            !isText && (
              <p className="dim">
                Bukan file teks ({fmtSize(content.size)}) — preview teks tidak
                tersedia.
              </p>
            )}
          {!loadingContent &&
            !err &&
            sel &&
            content &&
            !content.truncated &&
            isText && (
              <>
                <header className="file-view-head">
                  <b>{sel}</b>
                  <span className="file-view-tools">
                    {revisions.length > 0 && (
                      <select
                        value={diffRev}
                        onChange={(e) => void showDiff(e.target.value)}
                        aria-label="Bandingkan dengan revisi"
                      >
                        <option value="">revisi…</option>
                        {revisions.map((r) => (
                          <option key={r.rev} value={r.rev}>
                            r{r.rev} ·{" "}
                            {new Date(r.createdAt).toLocaleTimeString()}
                          </option>
                        ))}
                      </select>
                    )}
                    <small>{fmtSize(content.size)}</small>
                  </span>
                </header>
                {diff ? (
                  <div className="file-diff" aria-label="Diff vs revisi">
                    <p className="file-diff-stat">
                      vs r{diffRev}: <b className="add">+{diff.added}</b>{" "}
                      <b className="del">−{diff.removed}</b> baris
                    </p>
                    <pre className="file-pre">
                      {diff.ops.map((o, i) => (
                        <span key={i} className={`dl-${o.t}`}>
                          {o.t === "+" ? "+" : o.t === "-" ? "−" : " "} {o.line}
                          {"\n"}
                        </span>
                      ))}
                    </pre>
                  </div>
                ) : (
                  <pre className="file-pre">{content.content}</pre>
                )}
              </>
            )}
          {!sel && <p className="dim">Pilih file di kiri.</p>}
        </div>
      </div>
    </section>
  );
}
