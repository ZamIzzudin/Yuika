// @yui/core — usage ledger (P1-CRED-1): tabel `usage_events` append-only.
// Sumber data: `usage` dari chunk done provider (loop & delegasi anak) —
// TIDAK ada estimasi; provider tanpa usage = tidak tercatat (jujur > penuh).
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { type UsageEvent, type UsageFilter, type UsageMatrixRow, type UsageRollup, type UsageSummary } from "@yui/contracts";

export class UsageLedger {
  private db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        project_id TEXT,
        persona_id TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        latency_ms INTEGER NOT NULL,
        at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_at ON usage_events(at);
      CREATE INDEX IF NOT EXISTS idx_usage_project ON usage_events(project_id, at);
      CREATE INDEX IF NOT EXISTS idx_usage_persona ON usage_events(persona_id, at);
    `);
  }

  record(u: UsageEvent): void {
    this.db
      .prepare(
        "INSERT INTO usage_events (session_id, project_id, persona_id, model, prompt_tokens, output_tokens, latency_ms, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(u.sessionId, u.projectId ?? null, u.personaId, u.model, u.promptTokens, u.outputTokens, u.latencyMs, u.at);
  }

  /** Event mentah terbaru-dulu (feed metering / audit). */
  recent(limit = 50, filter: UsageFilter = {}): UsageEvent[] {
    const { where, args } = this.where(filter);
    const rows = this.db
      .prepare(`SELECT * FROM usage_events ${where} ORDER BY id DESC LIMIT ?`)
      .all(...args, Math.min(limit, 500)) as Array<{
      session_id: string; project_id: string | null; persona_id: string; model: string;
      prompt_tokens: number; output_tokens: number; latency_ms: number; at: number;
    }>;
    return rows.map((r) => ({
      sessionId: r.session_id, projectId: r.project_id, personaId: r.persona_id, model: r.model,
      promptTokens: r.prompt_tokens, outputTokens: r.output_tokens, latencyMs: r.latency_ms, at: r.at,
    }));
  }

  /** Rollup total + per persona + per model (filter opsional — burn-rate via `since`). */
  summary(filter: UsageFilter = {}): UsageSummary {
    const { where, args } = this.where(filter);
    const roll = (col: "persona_id" | "model"): UsageRollup[] =>
      (this.db
        .prepare(
          `SELECT ${col} AS key, COUNT(*) AS calls, SUM(prompt_tokens) AS p, SUM(output_tokens) AS o
           FROM usage_events ${where} GROUP BY ${col} ORDER BY p + o DESC`
        )
        .all(...args) as Array<{ key: string; calls: number; p: number; o: number }>).map((r) => ({
        key: r.key, calls: r.calls, promptTokens: r.p, outputTokens: r.o,
      }));
    const total = this.db
      .prepare(`SELECT COUNT(*) AS calls, COALESCE(SUM(prompt_tokens),0) AS p, COALESCE(SUM(output_tokens),0) AS o, MIN(at) AS first FROM usage_events ${where}`)
      .get(...args) as { calls: number; p: number; o: number; first: number | null };
    return {
      calls: total.calls, promptTokens: total.p, outputTokens: total.o,
      byPersona: roll("persona_id"), byModel: roll("model"),
      windowStart: total.first,
    };
  }

  /** CRED-4: attribution matrix persona × model (biaya dihitung pemanggil via price book). */
  matrix(filter: UsageFilter = {}): UsageMatrixRow[] {
    const { where, args } = this.where(filter);
    const rows = this.db
      .prepare(
        `SELECT persona_id AS p, model AS m, COUNT(*) AS calls, SUM(prompt_tokens) AS pi, SUM(output_tokens) AS po
         FROM usage_events ${where} GROUP BY persona_id, model ORDER BY pi + po DESC`
      )
      .all(...args) as Array<{ p: string; m: string; calls: number; pi: number; po: number }>;
    return rows.map((r) => ({
      personaId: r.p, model: r.m, calls: r.calls, promptTokens: r.pi, outputTokens: r.po,
      cost: null, currency: null, // diisi usageMatrixWithCost (core/budget)
    }));
  }

  private where(f: UsageFilter): { where: string; args: (string | number)[] } {
    const conds: string[] = [];
    const args: (string | number)[] = [];
    if (f.projectId !== undefined) { conds.push("project_id = ?"); args.push(f.projectId); }
    if (f.sessionId !== undefined) { conds.push("session_id = ?"); args.push(f.sessionId); }
    if (f.personaId !== undefined) { conds.push("persona_id = ?"); args.push(f.personaId); }
    if (f.since !== undefined) { conds.push("at >= ?"); args.push(f.since); }
    return { where: conds.length ? `WHERE ${conds.join(" AND ")}` : "", args };
  }

  close(): void {
    this.db.close();
  }
}
