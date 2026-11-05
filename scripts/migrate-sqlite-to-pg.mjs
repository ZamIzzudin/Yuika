#!/usr/bin/env node
// Yuika — P0-DATA-1: migrasi data SessionStore SQLite → Postgres.
// Sumber: yui.db (sessions/messages/events/events_archive/context_checkpoints/
// delegation_jobs/approvals/approval_memory) → target Postgres (skema pg-session).
//
// Pemakaian:
//   node scripts/migrate-sqlite-to-pg.mjs --from data/yui.db \
//     --to postgres://yui:yui@127.0.0.1:5432/yui [--clear]
//
// --clear: TRUNCATE tabel target dulu; tanpa itu INSERT ... ON CONFLICT DO
// NOTHING → aman diulang (id baris TIDAK berubah → replay SSE tetap konsisten).
// Sequences di-setel ke MAX(id)+1 tiap tabel supaya id baru tak bertabrakan.
// Catatan: per-baris dalam 1 transaksi per tabel — untuk data desktop (≤ ratusan
// ribu events) cukup; skala server lebih besar → COPY/batch menyusul (P2).
import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import pg from "postgres";
import { PgSessionStore } from "../packages/core/src/session/pg-session.js";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const { values } = parseArgs({
  options: {
    from: { type: "string", default: "data/yui.db" },
    to: { type: "string", default: process.env.DATABASE_URL ?? "postgres://yui:yui@127.0.0.1:5432/yui" },
    clear: { type: "boolean", default: false },
  },
});

const log = (...a) => console.log("[migrate]", ...a);
const src = new Database(values.from, { readonly: true });
const dst = pg(values.to, { max: 1 });

const now = Date.now();

/** tabel → [kolom urut sesuai CREATE TABLE PG, mapper nilai] */
const TABLES = [
  ["sessions", ["id", "persona_id", "system_prompt", "toolsets", "created_at", "project_id"], (r) => [r.id, r.persona_id, r.system_prompt, r.toolsets, r.created_at, r.project_id ?? null]],
  ["messages", ["seq", "session_id", "role", "content", "tool_calls", "tool_call_id", "created_at"], (r) => [r.seq, r.session_id, r.role, r.content ?? "", r.tool_calls ?? null, r.tool_call_id ?? null, r.created_at]],
  ["events", ["id", "session_id", "type", "payload", "ts"], (r) => [r.id, r.session_id, r.type, r.payload, r.ts]],
  ["events_archive", ["id", "session_id", "type", "payload", "ts", "archived_at"], (r) => [r.id, r.session_id, r.type, r.payload, r.ts, r.archived_at ?? now]],
  ["context_checkpoints", ["id", "session_id", "upto_seq", "summary", "model", "created_at"], (r) => [r.id, r.session_id, r.upto_seq, r.summary, r.model, r.created_at]],
  ["delegation_jobs", ["id", "parent_session_id", "parent_turn_id", "child_session_id", "persona_id", "goal", "status", "summary", "error", "created_at", "updated_at"], (r) => [r.id, r.parent_session_id, r.parent_turn_id, r.child_session_id, r.persona_id, r.goal, r.status, r.summary ?? null, r.error ?? null, r.created_at, r.updated_at]],
  ["approvals", ["request_id", "session_id", "tool", "args", "reason", "status", "remember", "created_at", "resolved_at"], (r) => [r.request_id, r.session_id, r.tool, r.args ?? "{}", r.reason ?? "", r.status ?? "pending", r.remember ?? 0, r.created_at, r.resolved_at ?? null]],
  ["approval_memory", ["session_id", "tool", "created_at"], (r) => [r.session_id, r.tool, r.created_at]],
];

async function copyTable([table, cols, map]) {
  const rows = src.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) return 0;
  const colList = cols.join(", ");
  let n = 0;
  await dst.begin(async (tx) => {
    const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
    for (const r of rows) {
      const v = map(r);
      const res = await tx.unsafe(`INSERT INTO ${table} (${colList}) VALUES (${ph}) ON CONFLICT DO NOTHING`, v);
      n += res.count;
    }
  });
  return n;
}

const SEQ_OF = {
  messages: ["messages_seq", "seq"],
  events: ["events_seq", "id"],
  context_checkpoints: ["ctxcp_seq", "id"],
  delegation_jobs: ["deljob_seq", "id"],
};

try {
  log(`from=${values.from} → to=${values.to}`);
  // bootstrap skema target (idempotent — satu sumber DDL dengan driver runtime)
  const boot = new PgSessionStore(values.to);
  await boot.migrate();
  await boot.close();
  log("skema target siap (DDL idempotent)");
  if (values.clear) {
    await dst.unsafe("TRUNCATE sessions, messages, events, events_archive, context_checkpoints, delegation_jobs, approvals, approval_memory");
    log("tabel target dibersihkan (--clear)");
  }
  for (const t of TABLES) {
    const n = await copyTable(t);
    log(`${t[0]}: ${n} baris`);
  }
  for (const [table, [seq, col]] of Object.entries(SEQ_OF)) {
    await dst.unsafe(`SELECT setval('${seq}', COALESCE((SELECT MAX(${col}) FROM ${table}), 0)::bigint + 1, false)`);
  }
  log("sequences disesuaikan ke MAX(id)+1");
  log(`SELESAI — jalankan api: YUI_DB_DRIVER=postgres DATABASE_URL=${values.to}`);
} finally {
  src.close();
  await dst.end({ timeout: 3 });
}
