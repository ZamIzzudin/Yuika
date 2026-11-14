// @yuika/core, F2 Backup: bundle data host + generator script restore.
// Konsep: satu ARSIP JSON berisi seluruh data user di host (workspace:
// persona custom + override + dungeons + design + uploads + db) yang bisa
// (a) diunduh langsung, (b) di-share melalui portal, dan direstore di host
// mana pun dengan MENJALANKAN satu file: restore script .mjs self-contained
// (data ter-embed, logika penulis file + db ikut di dalamnya).
// Restore TIDAK pernah dieksekusi otomatis oleh api - user menjalankan file
// itu sendiri di host tujuan (kepercayaan eksplisit pada file miliknya).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

export const BACKUP_FORMAT = "yuika-backup";
export const BACKUP_VERSION = 1;

/** Batas arsip: file > 8 MB dilewati (lapor), total > 256 MB -> tolak. */
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
/** Nama di dalam workspace yang TIDAK ikut backup (artefak runtime/cache). */
const SKIP_NAMES = new Set(["node_modules", ".git", ".turbo", ".tmp", "tmp"]);

export interface BackupEntry {
  /** Path relatif terhadap repo root host ASAL (informative). */
  rel: string;
  /** Konten base64 (uniform: teks & biner sama jalur). */
  b64: string;
  bytes: number;
}

export interface BackupBundle {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: number;
  host: { platform: string; node: string };
  /** Workspace path relatif thd repo root saat export (dokumentasi restore). */
  workspaceRel: string;
  dbRel: string;
  files: BackupEntry[];
  skipped: string[];
}

function walk(dir: string, base: string, out: BackupEntry[], skipped: string[], repoRoot: string): number {
  let total = 0;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_NAMES.has(d.name) || d.name.startsWith(".tmp")) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) {
      total += walk(p, base, out, skipped, repoRoot);
      continue;
    }
    if (!d.isFile()) continue;
    const st = fs.statSync(p);
    if (st.size > MAX_FILE_BYTES) {
      skipped.push(path.relative(repoRoot, p));
      continue;
    }
    out.push({ rel: path.relative(repoRoot, p).split(path.sep).join("/"), b64: fs.readFileSync(p).toString("base64"), bytes: st.size });
    total += st.size;
  }
  return total;
}

/** Snapshot db SQLite via backup API (konsisten walau api hidup). */
async function dbSnapshot(dbPath: string, tmpDir: string): Promise<Buffer> {
  const tmp = path.join(tmpDir, `db-snap-${Date.now()}.sqlite`);
  const src = new Database(dbPath, { readonly: true });
  try {
    await src.backup(tmp);
    return fs.readFileSync(tmp);
  } finally {
    src.close();
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best-effort */
    }
  }
}

/** Kumpulkan seluruh data host jadi satu bundle. */
export async function buildBackupBundle(opts: { workspacePath: string; dbPath: string; repoRoot: string }): Promise<BackupBundle> {
  const { workspacePath, dbPath, repoRoot } = opts;
  const files: BackupEntry[] = [];
  const skipped: string[] = [];
  let total = 0;
  if (fs.existsSync(workspacePath)) {
    total += walk(workspacePath, workspacePath, files, skipped, repoRoot);
  }
  const dbB64 = fs.existsSync(dbPath) ? (await dbSnapshot(dbPath, os.tmpdir())).toString("base64") : null;
  const bundle: BackupBundle = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: Date.now(),
    host: { platform: process.platform, node: process.version },
    workspaceRel: path.relative(repoRoot, workspacePath).split(path.sep).join("/"),
    dbRel: path.relative(repoRoot, dbPath).split(path.sep).join("/"),
    files,
    skipped,
  };
  if (dbB64) {
    bundle.files.push({ rel: bundle.dbRel, b64: dbB64, bytes: dbB64.length });
    total += dbB64.length;
  }
  if (total > MAX_TOTAL_BYTES) {
    throw new Error(`backup terlalu besar (${(total / 1024 / 1024).toFixed(1)} MB > ${MAX_TOTAL_BYTES / 1024 / 1024} MB); perkecil workspace (uploads/design) lalu ulangi`);
  }
  return bundle;
}

/** Generator script restore: .mjs self-contained (data ter-embed). Restore
 *  menulis file + db relatif thd repo root yang ditemukan dari cwd (naik
 *  mencari turbo.json; fallback: folder restore-out/). Overwrite = konfirmasi
 *  stdin y/N. Script ini STRING - tidak pernah dieksekusi oleh api. */
export function restoreScriptText(bundle: BackupBundle): string {
  const payload = JSON.stringify(bundle);
  return `#!/usr/bin/env node
// Yuika host restore script - generated ${new Date(bundle.createdAt).toISOString()}
// Run: node <this-file>.mjs   (in or below the Yuika repo root on the target host)
// Restores ${bundle.files.length} files${bundle.skipped.length ? ` (skipped at export: ${bundle.skipped.length})` : ""} incl. the database.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const BUNDLE = ${payload};

function findRoot() {
  let dir = path.resolve(process.cwd());
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "turbo.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const root = findRoot();
if (!root) {
  console.error("[restore] repo root not found: run this script inside the Yuika repo (turbo.json not found from cwd). Files would be written to ./restore-out instead.");
  process.exit(1);
}
const relPaths = BUNDLE.files.map((f) => f.rel).slice(0, 5).join(", ");
console.log(\`[restore] target repo root: \${root}\`);
console.log(\`[restore] \${BUNDLE.files.length} files (\${relPaths}...), db: \${BUNDLE.dbRel}\`);
if (BUNDLE.skipped.length) console.warn(\`[restore] skipped at export time: \${BUNDLE.skipped.join(", ")}\`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("[restore] This OVERWRITES existing files and the database. Continue? [y/N] ", (ans) => {
  rl.close();
  if (!/^y(es)?\$/i.test(ans.trim())) {
    console.log("[restore] aborted, nothing written.");
    return;
  }
  let written = 0, failed = 0;
  for (const f of BUNDLE.files) {
    try {
      const dest = path.join(root, f.rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(f.b64, "base64"));
      written++;
    } catch (e) {
      failed++;
      console.error(\`[restore] FAILED \${f.rel}: \${e instanceof Error ? e.message : e}\`);
    }
  }
  console.log(\`[restore] done: \${written} written, \${failed} failed.\`);
  console.log("[restore] restart the Yuika api (docker compose / npm) so it picks up the restored database.");
});
`;
}
