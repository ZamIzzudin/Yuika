// @yui/core — session store: SQLite append-only (DEMO-WEEK-1 §3.1).
// INVARIANT (PLAN §3.2): messages & events hanya INSERT — tidak ada UPDATE/DELETE.
// System prompt & toolset DIBEKUKAN saat createSession (prompt-cache discipline).
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { YuiEvent, type EventDraft, type YuiEvent as YuiEventType } from "@yui/contracts";
import type { InternalMessage } from "../provider/adapter.js";

export interface SessionRow {
  id: string;
  personaId: string;
  systemPrompt: string;
  toolsets: string[]; // frozen saat create
  createdAt: number;
  /** Project tempat sesi melekat (P1-PRJ-2/6); null = sesi workspace global. */
  projectId: string | null;
}

export class SessionStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        persona_id TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        toolsets TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_calls TEXT,
        tool_call_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, id);
    `);
    // Migration ringan (idempotent): kolom project_id untuk sesi yang melekat ke project
    const cols = this.db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "project_id")) {
      this.db.exec("ALTER TABLE sessions ADD COLUMN project_id TEXT");
    }
  }

  createSession(id: string, personaId: string, systemPrompt: string, toolsets: string[], projectId?: string | null): SessionRow {
    this.db
      .prepare("INSERT INTO sessions (id, persona_id, system_prompt, toolsets, created_at, project_id) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, personaId, systemPrompt, JSON.stringify(toolsets), Date.now(), projectId ?? null);
    return { id, personaId, systemPrompt, toolsets, createdAt: Date.now(), projectId: projectId ?? null };
  }

  getSession(id: string): SessionRow | undefined {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
      | { id: string; persona_id: string; system_prompt: string; toolsets: string; created_at: number }
      | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      personaId: row.persona_id,
      systemPrompt: row.system_prompt,
      toolsets: JSON.parse(row.toolsets) as string[],
      createdAt: row.created_at,
      projectId: (row as { project_id?: string | null }).project_id ?? null,
    };
  }

  /** Sesi sebuah project terurut terbaru-dulu (untuk riwayat/resume) — berdasar event terakhir tiap sesi. */
  listProjectSessions(projectId: string): Array<{ id: string; personaId: string; createdAt: number; lastEventAt: number; lastEventId: number }> {
    const rows = this.db
      .prepare(
        `SELECT s.id, s.persona_id, s.created_at, COALESCE(MAX(e.id), 0) AS last_event_id, COALESCE(MAX(e.ts), s.created_at) AS last_event_at
         FROM sessions s LEFT JOIN events e ON e.session_id = s.id
         WHERE s.project_id = ? GROUP BY s.id ORDER BY last_event_at DESC`
      )
      .all(projectId) as Array<{ id: string; persona_id: string; created_at: number; last_event_id: number; last_event_at: number }>;
    return rows.map((r) => ({ id: r.id, personaId: r.persona_id, createdAt: r.created_at, lastEventAt: r.last_event_at, lastEventId: r.last_event_id }));
  }

  appendMessage(sessionId: string, msg: InternalMessage): void {
    this.db
      .prepare("INSERT INTO messages (session_id, role, content, tool_calls, tool_call_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(
        sessionId,
        msg.role,
        msg.content ?? "",
        msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
        msg.toolCallId ?? null,
        Date.now(),
      );
  }

  /** P1-MEM-5: agent menelusuri riwayat sesinya sendiri (v0: LIKE + recency;
   *  hanya role user/assistant, snippet di sekitar kecocokan pertama). */
  searchMessages(q: {
    query: string;
    projectId?: string | null; // null = semua sesi (scope "all")
    limit?: number;
  }): { sessionId: string; personaId: string; role: string; snippet: string; createdAt: number }[] {
    const needle = q.query.toLowerCase();
    const like = `%${q.query}%`;
    const rows = (
      this.db
        .prepare(
          `SELECT m.session_id AS sid, s.persona_id AS pid, m.role AS role, m.content AS content, m.created_at AS ts
           FROM messages m JOIN sessions s ON s.id = m.session_id
           WHERE m.role IN ('user','assistant') AND m.content LIKE ?
             ${q.projectId ? "AND s.project_id = ?" : ""}
           ORDER BY m.created_at DESC LIMIT ?`,
        )
        .all(...(q.projectId ? [like, q.projectId] : [like]), q.limit ?? 8) as { sid: string; pid: string; role: string; content: string; ts: number }[]
    ).map((r) => {
      const idx = r.content.toLowerCase().indexOf(needle);
      const from = Math.max(0, idx - 60);
      return {
        sessionId: r.sid,
        personaId: r.pid,
        role: r.role,
        snippet: (from > 0 ? "…" : "") + r.content.slice(from, from + 180) + (from + 180 < r.content.length ? "…" : ""),
        createdAt: r.ts,
      };
    });
    return rows;
  }

  getMessages(sessionId: string): InternalMessage[] {
    const rows = this.db
      .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY seq ASC")
      .all(sessionId) as { role: string; content: string; tool_calls: string | null; tool_call_id: string | null }[];
    return rows.map((r) => ({
      role: r.role as InternalMessage["role"],
      content: r.content,
      toolCalls: r.tool_calls ? (JSON.parse(r.tool_calls) as InternalMessage["toolCalls"]) : undefined,
      toolCallId: r.tool_call_id ?? undefined,
    }));
  }

  /** Append event draft + lekatkan meta (id monotonic, ts) — kunci replay/resume. */
  appendEvent(sessionId: string, draft: EventDraft): YuiEventType {
    const withMeta = { ...draft, sessionId, id: 0, ts: Date.now() } as Record<string, unknown>;
    const info = this.db
      .prepare("INSERT INTO events (session_id, type, payload, ts) VALUES (?, ?, ?, ?)")
      .run(sessionId, draft.type, JSON.stringify(draft), withMeta.ts);
    withMeta.id = Number(info.lastInsertRowid);
    return YuiEvent.parse(withMeta);
  }

  getEvents(sessionId: string, sinceId = 0): YuiEventType[] {
    const rows = this.db
      .prepare("SELECT id, payload, ts FROM events WHERE session_id = ? AND id > ? ORDER BY id ASC")
      .all(sessionId, sinceId) as { id: number; payload: string; ts: number }[];
    return rows.map((r) => {
      const payload = JSON.parse(r.payload) as Record<string, unknown>;
      return YuiEvent.parse({ ...payload, id: r.id, ts: r.ts, sessionId });
    });
  }

  close(): void {
    this.db.close();
  }
}
