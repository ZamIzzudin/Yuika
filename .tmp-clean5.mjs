// Pass 3b (followups) + test-name fixes + SAFE pass 4.
import fs from "node:fs";
import { execSync } from "node:child_process";

const sub = (file, pairs) => {
  let t = fs.readFileSync(file, "utf8");
  for (const [a, b] of pairs) {
    if (!t.includes(a)) { console.log("MISS", file, "::", a.slice(0, 60)); process.exitCode = 1; continue; }
    t = t.split(a).join(b);
  }
  fs.writeFileSync(file, t);
};

// ── pass 3b: the two leftovers + neighbors ─────────────────────────────────
sub("packages/contracts/src/mcp.ts", [
  ["// ── Katalog MCP (P1-MCP-1) ─────────────────────────────────────────",
   "// ── MCP catalog (curated servers) ─────────────────────────────────"],
]);
sub("packages/core/src/runtime.ts", [
  ["  // Batch 12 (P2-VLT): vault kredensial, store terenkripsi terpisah dari demo.db",
   "  // Credential vault: an encrypted store separate from the main DB"],
  ["  // (vault.db + vault.key di direktori data). Nilai tak pernah lewat jalur model.",
   "  // (vault.db + vault.key in the data dir). Values never cross the model path."],
  ["    // P2-STU-2: terminal shared user & agent, Batch 13: agent ikut masuk",
   "    // Shared user/agent terminal: the agent also enters a workshop"],
  ["    // container workshop bila hidup + kerja di PROJECT workspace.",
   "    // container when one is live, and works in the PROJECT workspace."],
]);

// ── test-name fixes (files restored from git) ──────────────────────────────
sub("apps/api/src/__tests__/api.test.ts", [
  ['it("GET /api/projects/:id/activity, 200 shape {activity:[…]} (Batch 14a++ Logs)", async',
   'it("GET /api/projects/:id/activity returns {activity:[…]}", async'],
  ['it("GET /api/projects/:id/dashboard, 200 shape {dashboard} (P2-PM-4/5); tak dikenal → 404", async',
   'it("GET /api/projects/:id/dashboard returns {dashboard}; unknown id 404s", async'],
  ['it("P2-PM-3: GET /tasks/validate, lint DAG + coverage (kontrak bentuk)", async',
   'it("GET /tasks/validate lints the DAG + coverage (contract shape)", async'],
  ['it("P2-STU-4: GET /browser/fetch, proxy read-only + 403 host_denied; GET /browser/visits", async',
   'it("GET /browser/fetch read-only proxy + 403 host_denied; GET /browser/visits", async'],
]);
sub("apps/api/src/__tests__/auth.test.ts", [
  ['it("D50 YUI_AUTH_REQUIRED=1: instance publik tertutup sejak boot (belum ada user pun non-auth 401; route auth tetap hidup)", async',
   'it("YUI_AUTH_REQUIRED=1: a public instance is closed from boot (401 before any user; auth routes stay up)", async'],
]);
sub("apps/api/src/__tests__/portal-unlink.test.ts", [
  ['describe("CP-5, host device di-unlink (bye 4001)"', 'describe("host device unlinked (bye 4001)"'],
  ['describe("CP-5, web device di-unlink (bye 4001)"', 'describe("web device unlinked (bye 4001)"'],
  ['describe("CP-5, guard: 4001 di auth PERTAMA bukan unlink"', 'describe("guard: 4001 on the FIRST auth is not an unlink"'],
]);
sub("apps/api/src/__tests__/terminal-routes.test.ts", [
  ['describe("routes terminal (P2-STU-2)"', 'describe("terminal routes"'],
]);

// ── SAFE pass 4: bare token strip, comment lines only for tidying ──────────
const files = execSync(
  'grep -rlE "(CP-[0-9]|PORT-[0-9]|PRT[0-9]|P[012]-[A-Z]{2,6}-[0-9]|Batch 1?[0-9]|PLAN §|TASKS\\.md|W5-C[0-9]|VLT-[0-9]|STU-[0-9]|DS-[0-9])" apps packages scripts e2e --include=*.ts --include=*.tsx --include=*.mjs --include=*.mts',
  { shell: true },
).toString().trim().split(/\r?\n/).filter((f) => !f.includes("node_modules"));

const TOKEN = /\b(?:P[012]-[A-Z]{2,6}-\d+(?:\.\d+)?(?:\/\d+)*|CP-\d+|PORT-\d+|PRT\d+|W5-C\d|VLT-\d|STU-\d|DS-\d|Batch 1?\d[ab]?\+*|PLAN §[\d.]+(?:\/\d+)*|TASKS\.md(?: §[\w\d.]+)?)\b/g;
// D-slices need a guard so hex colors / IDs stay intact: require the token to
// be surrounded by non-alphanumerics and not preceded by a digit or '#'.
const DTOKEN = /(^|[^\w#])(D\d{1,2}[a-z]?)(?=[^\w]|$)/g;

let lines = 0;
for (const f of files) {
  const txt = fs.readFileSync(f, "utf8");
  const eol = txt.includes("\r\n") ? "\r\n" : "\n";
  let changed = 0;
  const out = txt.split(/\r?\n/).map((line) => {
    if (!/(CP-\d|PORT-\d|PRT\d|P[012]-[A-Z]{2,6}-\d|Batch 1?\d|PLAN §|TASKS\.md|W5-C\d|VLT-\d|STU-\d|DS-\d|(^|[^\w#])D\d{1,2}[a-z]?([^\w]|$))/.test(line)) return line;
    let s = line.replace(TOKEN, "").replace(DTOKEN, "$1");
    const isComment = /^\s*(\/\/|\/\*|\*)/.test(s);
    if (isComment) {
      for (let i = 0; i < 3; i++) {
        s = s
          .replace(/\(\s*\)/g, "")
          .replace(/\(\s*,\s*\)/g, "")
          .replace(/ [,;:]\s*\*?$/, (m) => (m.trim().startsWith("*") ? " *" : ""))
          .replace(/^(\s*(?:\/\/|\*|\/\*+)\s*)[:,]\s+/, "$1")
          .replace(/  +/g, " ");
      }
      s = s.replace(/\s+$/, "");
    }
    if (s !== line) { changed++; lines++; }
    return s;
  });
  if (changed) fs.writeFileSync(f, out.join(eol));
}
console.log("pass4-safe files:", files.length, "lines:", lines);
