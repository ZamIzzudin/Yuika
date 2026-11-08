// @yuika/core, project files ( v0): tree + baca file untuk tab File.
// Guard: path HARUS resolve di dalam dir project (anti path-traversal);
// skip .git/node_modules; file > 256 KB tak dibaca (tampil di UI sebagai terlalu besar).
import fs from "node:fs";
import path from "node:path";

export interface FileNode {
  name: string;
  relPath: string;
  dir: boolean;
  size: number;
  children?: FileNode[];
}

const SKIP_DIRS = new Set([".git", "node_modules", ".next", "__pycache__"]);
const MAX_ENTRIES = 600;
const MAX_DEPTH = 6;
export const MAX_READ_BYTES = 256 * 1024;

export function safeProjectPath(root: string, rel: string): string {
  const abs = path.resolve(root, rel);
  const normRoot = path.resolve(root);
  if (abs !== normRoot && !abs.startsWith(normRoot + path.sep)) throw new Error("path di luar project (ditolak)");
  return abs;
}

export function buildFileTree(root: string, dir = root, depth = 0, counter = { n: 0 }): FileNode[] {
  const out: FileNode[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".well-known") continue;
    if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
    if (++counter.n > MAX_ENTRIES) return out;
    const abs = path.join(dir, e.name);
    const relPath = path.relative(root, abs).split(path.sep).join("/");
    if (e.isDirectory()) {
      out.push({ name: e.name, relPath, dir: true, size: 0, children: depth < MAX_DEPTH ? buildFileTree(root, abs, depth + 1, counter) : [] });
    } else {
      let size = 0;
      try {
        size = fs.statSync(abs).size;
      } catch {
        /* file hilang di tengah scan → 0 */
      }
      out.push({ name: e.name, relPath, dir: false, size });
    }
  }
  return out;
}

export function readProjectFile(root: string, rel: string): { content: string; size: number; truncated: boolean } {
  const abs = safeProjectPath(root, rel);
  const st = fs.statSync(abs); // throw natural bila hilang (route → 404)
  if (st.isDirectory()) throw new Error("path adalah direktori");
  if (st.size > MAX_READ_BYTES) return { content: "", size: st.size, truncated: true };
  return { content: fs.readFileSync(abs, "utf-8"), size: st.size, truncated: false };
}
