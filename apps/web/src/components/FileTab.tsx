"use client";
// Tab File (P2-STU-3 v0): tree kiri + viewer kanan. Artefak agent (reports/,
// code/, MEMORY.md) bisa diperiksa tanpa keluar app. File teks/kode ≤256 KB
// dibaca; selain itu tampil info ukuran. Diff hasil edit = penyusul (butuh snapshot lama).
import { useCallback, useEffect, useState } from "react";
import type { FileNode } from "@yui/contracts";
import { SkeletonRows } from "./Skeleton";

interface Content {
  content: string;
  size: number;
  truncated: boolean;
}

const TEXT_EXT = new Set([
  "md", "txt", "json", "yaml", "yml", "html", "css", "js", "jsx", "ts", "tsx", "py", "sh",
  "csv", "xml", "toml", "ini", "env", "log", "svg", "sql",
]);

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function TreeRow({ node, depth, sel, onPick }: { node: FileNode; depth: number; sel: string | null; onPick: (n: FileNode) => void }) {
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
        node.children?.map((c) => <TreeRow key={c.relPath} node={c} depth={depth + 1} sel={sel} onPick={onPick} />)}
    </>
  );
}

export function FileTab({ projectId }: { projectId: string }) {
  const [tree, setTree] = useState<FileNode[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/files`);
      if (r.ok) setTree(((await r.json()) as { tree: FileNode[] }).tree);
      else setErr((((await r.json()) as { error?: string }).error ?? "gagal memuat file") + "");
    } catch {
      setErr("gagal menghubungi server");
    }
  }, [projectId]);

  useEffect(() => {
    setTree(null);
    setSel(null);
    setContent(null);
    void loadTree();
  }, [loadTree]);

  async function pick(n: FileNode) {
    setSel(n.relPath);
    setContent(null);
    setLoadingContent(true);
    setErr(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/files?path=${encodeURIComponent(n.relPath)}`);
      const d = (await r.json()) as Content & { error?: string };
      if (!r.ok) setErr(d.error ?? "gagal membaca file");
      else setContent(d);
    } finally {
      setLoadingContent(false);
    }
  }

  const isText = sel ? TEXT_EXT.has(sel.split(".").pop()!.toLowerCase()) : false;

  return (
    <section className="file-tab" aria-label="File project">
      <p className="pane-hint">
        Artefak sesi di <code>reports/</code> dan <code>code/</code>. Klik folder untuk buka/tutup; klik file untuk melihat isinya.
      </p>
      <div className="file-split">
        <div className="file-tree" role="tree">
          {tree === null ? <SkeletonRows rows={5} /> : tree.length === 0 ? <p className="dim">Project belum punya file.</p> : tree.map((n) => <TreeRow key={n.relPath} node={n} depth={0} sel={sel} onPick={pick} />)}
        </div>
        <div className="file-view">
          {loadingContent && <SkeletonRows rows={4} />}
          {!loadingContent && err && <p className="project-err">{err}</p>}
          {!loadingContent && !err && sel && content?.truncated && (
            <p className="dim">File terlalu besar untuk dibaca ({fmtSize(content.size)} &gt; 256 KB) — buka di file explorer.</p>
          )}
          {!loadingContent && !err && sel && content && !content.truncated && !isText && (
            <p className="dim">Bukan file teks ({fmtSize(content.size)}) — preview teks tidak tersedia.</p>
          )}
          {!loadingContent && !err && sel && content && !content.truncated && isText && (
            <>
              <header className="file-view-head">
                <b>{sel}</b>
                <small>{fmtSize(content.size)}</small>
              </header>
              <pre className="file-pre">{content.content}</pre>
            </>
          )}
          {!sel && <p className="dim">Pilih file di kiri.</p>}
        </div>
      </div>
    </section>
  );
}
