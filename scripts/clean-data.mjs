// yuika, reset data untuk retest dari nol (npm run data:clean).
// Yang dibersihkan (semuanya DATA, bukan kode):
//   • demo.db + -shm + -wal          → sesi, pesan, event, projects, file_revisions, audit MCP
//   • model-overrides.json (root)    → override model per persona (tabel di Pengaturan)
//   • workspace/projects/*           → folder artefak semua proyek (code/docs/reports/MEMORY.md)
//   • workspace/reports/*            → artefak sesi global
//   • workspace/mcp-trust.json       → trust & denyTools MCP
//   • workspace/USER.md              → profil user (Yui membangunnya ulang saat chat pertama)
//   • packages/skills/drafts/*       → draf skill hasil skill_propose (skill seed AKTIF tidak disentuh)
//   • mcp.json                       → di-restore ke versi repo (git checkout), bukan dihapus
// TIDAK disentuh: .env (API key), packages/skills/* aktif, packages/personas/*.
//
// Opsi:
//   node scripts/clean-data.mjs            → bersihkan semua
//   node scripts/clean-data.mjs --dry      → tampilkan saja yang akan dibersihkan (alias: npm run data:status)
//   node scripts/clean-data.mjs --keep-user  → pertahankan workspace/USER.md (profil tidak mulai dari nol)
//   node scripts/clean-data.mjs --keep-mcp   → pertahankan mcp.json + mcp-trust.json (server MCP tidak install ulang)
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry") || args.has("--status");
const KEEP_USER = args.has("--keep-user");
const KEEP_MCP = args.has("--keep-mcp");

// ---- root repo (naik sampai turbo.json, tahan dari cwd mana pun)
let root = path.dirname(fileURLToPath(import.meta.url));
for (let i = 0; i < 8; i++) {
  if (fs.existsSync(path.join(root, "turbo.json"))) break;
  root = path.dirname(root);
}

// ---- env sederhana: process.env menang, lalu .env root (YUI_DB_PATH / YUI_WORKSPACE_DIR)
const env = { ...process.env };
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    if (!(key in env)) env[key] = m[2].replace(/^["']|["']$/g, "");
  }
}
const dbPath = env.YUI_DB_PATH || path.join(root, "demo.db");
const workspace = env.YUI_WORKSPACE_DIR || path.join(root, "workspace");

// ---- kumpulkan target: [label, path, tipe]
const targets = [];
const push = (label, p) => targets.push({ label, p });
push("DB utama (sesi/pesan/event/projects/revisi/audit)", dbPath);
push("DB -wal", `${dbPath}-wal`);
push("DB -shm", `${dbPath}-shm`);
push("Override model per persona", path.join(path.dirname(dbPath), "model-overrides.json"));
if (!KEEP_MCP) push("Trust MCP (workspace/mcp-trust.json)", path.join(workspace, "mcp-trust.json"));
if (!KEEP_USER) push("Profil user (workspace/USER.md)", path.join(workspace, "USER.md"));
for (const sub of ["projects", "reports"]) {
  const d = path.join(workspace, sub);
  if (fs.existsSync(d)) for (const e of fs.readdirSync(d)) push(`workspace/${sub}/${e}`, path.join(d, e));
}
const drafts = path.join(root, "packages", "skills", "drafts");
if (fs.existsSync(drafts)) for (const e of fs.readdirSync(drafts)) push(`skill draft: ${e}`, path.join(drafts, e));

const exists = targets.filter((t) => fs.existsSync(t.p));
const fmt = (p) => {
  const st = fs.statSync(p);
  const kb = st.isDirectory() ? dirSize(p) : st.size;
  return kb > 1024 * 1024 ? `${(kb / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb / 1024))} KB`;
};

console.log(DRY ? "▾ Yang AKAN dibersihkan (dry-run, tidak ada yang dihapus):" : "▾ Membersihkan data test…");
if (!exists.length) console.log("  (tidak ada data, sudah bersih)");
for (const t of exists) console.log(`  • ${t.label}  ${fmt(t.p)}`);
if (DRY) {
  console.log("\nJalankan: npm run data:clean");
  process.exit(0);
}

// ---- kunci DB? SQLite terbuka oleh dev server → hapus akan gagal di Windows
if (fs.existsSync(dbPath)) {
  const probe = `${dbPath}.probe`;
  try {
    fs.renameSync(dbPath, probe);
    fs.renameSync(probe, dbPath);
  } catch {
    console.error("\n✗ demo.db masih dikunci, dev server kemungkinan masih jalan.");
    console.error("  1) hentikan dev server (Ctrl+C di terminal `npm run dev`)");
    console.error("  2) jalankan ulang: npm run data:clean");
    console.error("  3) nyalakan lagi: npm run dev");
    process.exit(1);
  }
}

let n = 0;
for (const t of exists) {
  try {
    fs.rmSync(t.p, { recursive: true, force: true });
    n++;
  } catch (e) {
    console.error(`  ! gagal: ${t.p}, ${e.message}`);
  }
}

// mcp.json: restore ke versi repo (file tracked) bila termodifikasi oleh installer
if (!KEEP_MCP) {
  try {
    const dirty = execSync("git status --porcelain -- mcp.json", { cwd: root, stdio: "pipe" }).toString().trim();
    if (dirty) {
      execSync("git checkout -- mcp.json", { cwd: root });
      console.log("  • mcp.json → di-restore ke versi repo");
    }
  } catch {
    /* bukan repo git / mcp.json tidak ada, abaikan */
  }
}

console.log(`\n✓ ${n} entri dibersihkan. Retest dari nol: npm run dev → http://localhost:3000`);

function dirSize(d) {
  let s = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    s += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return s;
}
