// @yui/core — MCP audit log (P1-MCP-3): setiap panggilan tool MCP dicatat
// append-only (siapa/sesi, server, tool, hasil, durasi) — bahan trust analytics.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { McpAuditEntry } from "@yui/contracts";

type Row = {
  id: number;
  ts: number;
  server: string;
  tool: string;
  session_id: string | null;
  ok: number;
  error: string | null;
  duration_ms: number;
};

export class McpAuditStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        server TEXT NOT NULL,
        tool TEXT NOT NULL,
        session_id TEXT,
        ok INTEGER NOT NULL,
        error TEXT,
        duration_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mcp_audit_ts ON mcp_audit(id DESC);
    `);
  }

  log(input: {
    server: string;
    tool: string;
    sessionId?: string | null;
    ok: boolean;
    error?: string | null;
    durationMs: number;
  }): void {
    this.db
      .prepare("INSERT INTO mcp_audit (ts, server, tool, session_id, ok, error, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(Date.now(), input.server, input.tool, input.sessionId ?? null, input.ok ? 1 : 0, input.error ?? null, Math.round(input.durationMs));
  }

  recent(limit = 50): McpAuditEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM mcp_audit ORDER BY id DESC LIMIT ?")
      .all(limit) as Row[];
    return rows.map((r) => ({
      id: r.id,
      ts: r.ts,
      server: r.server,
      tool: r.tool,
      sessionId: r.session_id,
      ok: r.ok === 1,
      error: r.error,
      durationMs: r.duration_ms,
    }));
  }

  close(): void {
    this.db.close();
  }
}
