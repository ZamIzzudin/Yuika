// @yuika/core, session store: SQLite append-only (DEMO-WEEK-1 §3.1).
// INVARIANT (PLAN §3.2): messages & events hanya INSERT, tidak ada UPDATE/DELETE.
// System prompt & toolset DIBEKUKAN saat createSession (prompt-cache discipline).
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { YuiEvent, type EventDraft, type YuiEvent as YuiEventType } from "@yuika/contracts";
import type { InternalMessage } from "../provider/adapter.js";
import { createPgStore } from "./pg-bridge.js";

export interface SessionRow {
  id: string;
  personaId: string;
  systemPrompt: string;
  toolsets: string[]; // frozen saat create
  createdAt: number;
  /** Project tempat sesi melekat (P1-PRJ-2/6); null = sesi workspace global. */
  projectId: string | null;
}

/** P0-DATA-1: kontrak penyimpanan sesi, SATU interface, dua driver:
 *  SQLite (default, embedded, zero-config, desktop/dev) & Postgres (server:
 *  multi-worker, skala events besar). Implementasi PG memakai worker-thread +
 *  sync-bridge sehingga interface tetap SINKRON (paritas dengan better-sqlite3,
 *  nol perubahan di call site & 250+ test). */
export interface ISessionStore {
  createSession(id: string, personaId: string, systemPrompt: string, toolsets: string[], projectId?: string | null): SessionRow;
  getSession(id: string): SessionRow | undefined;
  listProjectSessions(projectId: string): Array<{ id: string; personaId: string; createdAt: number; lastEventAt: number; lastEventId: number }>;
  /** P1-PRT-3: sesi terbaru lintas project (host.state / list_sessions remote). */
  listRecentSessions(limit: number): Array<{ id: string; personaId: string; title: string | null; updatedAt: number }>;
  personaSessionCounts(): Map<string, number>;
  personaDoneTurnCounts(): Map<string, number>;
  appendMessage(sessionId: string, msg: InternalMessage): void;
  searchMessages(q: { query: string; projectId?: string | null; limit?: number }): { sessionId: string; personaId: string; role: string; snippet: string; createdAt: number }[];
  getMessages(sessionId: string): InternalMessage[];
  getMessagesWithSeq(sessionId: string): Array<{ seq: number; msg: InternalMessage }>;
  saveContextCheckpoint(sessionId: string, uptoSeq: number, summary: string, model: string): void;
  latestContextCheckpoint(sessionId: string): { uptoSeq: number; summary: string; model: string } | null;
  startDelegationJob(input: { parentSessionId: string; parentTurnId: string; childSessionId: string; personaId: string; goal: string }): number;
  finishDelegationJob(id: number, patch: { status: "done" | "error" | "interrupted"; summary?: string; error?: string }): void;
  findRunningDelegationJobs(): Array<{ id: number; parentSessionId: string; childSessionId: string; personaId: string; goal: string }>;
  listDelegationJobs(projectId?: string | null): Array<import("@yuika/contracts").DelegationJob>;
  archiveOldEvents(retentionDays: number, nowMs?: number): { archived: number; sessions: number };
  appendEvent(sessionId: string, draft: EventDraft): YuiEventType;
  getEvents(sessionId: string, sinceId?: number): YuiEventType[];
  findInterruptedTurns(): Array<{ sessionId: string; personaId: string; lastTurnEventId: number }>;
  insertApproval(row: { requestId: string; sessionId: string; tool: string; args: Record<string, unknown>; reason: string }): void;
  settleApproval(requestId: string, status: "approved" | "denied" | "expired", remember?: boolean): boolean;
  listPendingApprovals(): { requestId: string; sessionId: string; tool: string; reason: string }[];
  rememberApproval(sessionId: string, tool: string): void;
  getRememberedTools(sessionId: string): string[];
  expirePendingApprovals(): number;
  deleteProjectSessions(projectId: string): { sessions: number; events: number; approvals: number };
  close(): void;
}

/** Factory driver (P0-DATA-1): YUI_DB_DRIVER=sqlite (default) | postgres.
 *  postgres → sync-bridge worker (session/pg-bridge.ts, hanya
 *  node:worker_threads, worker dibuat lazy); DATABASE_URL wajib (divalidasi
 *  fail-fast di env.ts). Sinkron: createYuiRuntime tidak berubah bentuk. */
export function createSessionStore(dbPath: string): ISessionStore {
  if (process.env.YUI_DB_DRIVER !== "postgres") return new SessionStore(dbPath);
  return createPgStore();
}

export class SessionStore implements ISessionStore {
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
      -- P0-DATA-2: arsip retention, baris events lama dipindah ke sini (id ASLI
      -- dipertahankan; identitas event tidak berubah). Bacaan memakai UNION
      -- events + events_archive sehingga replay/hidrasi tetap utuh.
      CREATE TABLE IF NOT EXISTS events_archive (
        id INTEGER PRIMARY KEY,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        ts INTEGER NOT NULL,
        archived_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_archive_session ON events_archive(session_id, id);
      -- P0-CORE-4: checkpoint kompresi konteks, append-only; baris ter-id TERBESAR
      -- per sesi = checkpoint aktif (view prompt memakainya; messages tak pernah diubah).
      CREATE TABLE IF NOT EXISTS context_checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        upto_seq INTEGER NOT NULL,
        summary TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ctxcp_session ON context_checkpoints(session_id, id);
      -- P0-DEL-1: job delegasi persist, status lintas restart (audit + heal).
      CREATE TABLE IF NOT EXISTS delegation_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_session_id TEXT NOT NULL,
        parent_turn_id TEXT NOT NULL,
        child_session_id TEXT NOT NULL,
        persona_id TEXT NOT NULL,
        goal TEXT NOT NULL,
        status TEXT NOT NULL, -- running|done|error|interrupted
        summary TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_deljob_parent ON delegation_jobs(parent_session_id);
      CREATE TABLE IF NOT EXISTS approvals (
        request_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        args TEXT NOT NULL DEFAULT '{}',
        reason TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|denied|expired
        remember INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_approvals_session ON approvals(session_id);
      CREATE TABLE IF NOT EXISTS approval_memory (
        session_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, tool)
      );
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

  /** Sesi sebuah project terurut terbaru-dulu (untuk riwayat/resume), berdasar event terakhir tiap sesi. */
  listProjectSessions(projectId: string): Array<{ id: string; personaId: string; createdAt: number; lastEventAt: number; lastEventId: number }> {
    const rows = this.db
      .prepare(
        `SELECT s.id, s.persona_id, s.created_at,
                COALESCE(u.max_id, 0) AS last_event_id, COALESCE(u.max_ts, s.created_at) AS last_event_at
         FROM sessions s
         LEFT JOIN (
           SELECT session_id, MAX(id) AS max_id, MAX(ts) AS max_ts FROM (
             SELECT session_id, id, ts FROM events
             UNION ALL SELECT session_id, id, ts FROM events_archive
           ) GROUP BY session_id
         ) u ON u.session_id = s.id
         WHERE s.project_id = ? ORDER BY last_event_at DESC`
      )
      .all(projectId) as Array<{ id: string; persona_id: string; created_at: number; last_event_id: number; last_event_at: number }>;
    return rows.map((r) => ({ id: r.id, personaId: r.persona_id, createdAt: r.created_at, lastEventAt: r.last_event_at, lastEventId: r.last_event_id }));
  }

  /** P1-PRT-3: sesi terbaru lintas project, judul = pesan user pertama.
   *  Dipakai host worker utk host.state / list_sessions (RemoteEvent). */
  listRecentSessions(limit: number): Array<{ id: string; personaId: string; title: string | null; updatedAt: number }> {
    const rows = this.db
      .prepare(
        `SELECT s.id, s.persona_id,
                COALESCE(u.max_ts, s.created_at) AS updated_at,
                (SELECT m.content FROM messages m
                  WHERE m.session_id = s.id AND m.role = 'user'
                  ORDER BY m.seq LIMIT 1) AS title
         FROM sessions s
         LEFT JOIN (
           SELECT session_id, MAX(ts) AS max_ts FROM (
             SELECT session_id, ts FROM events
             UNION ALL SELECT session_id, ts FROM events_archive
           ) GROUP BY session_id
         ) u ON u.session_id = s.id
         ORDER BY updated_at DESC LIMIT ?`
      )
      .all(limit) as Array<{ id: string; persona_id: string; personaId?: string; updated_at: number; title: string | null }>;
    return rows.map((r) => ({ id: r.id, personaId: r.persona_id, title: r.title, updatedAt: r.updated_at }));
  }

  /** P1-PER-4: jumlah sesi per persona (lintas project, growth tracking). */
  personaSessionCounts(): Map<string, number> {
    const rows = this.db.prepare(`SELECT persona_id, COUNT(*) AS n FROM sessions GROUP BY persona_id`).all() as Array<{ persona_id: string; n: number }>;
    return new Map(rows.map((r) => [r.persona_id, r.n]));
  }

  /** P1-PER-4: jumlah turn SELESAI per persona (event persona.state done).
   *  Scan events sekali, cukup cepat di skala demo; index menyusul bila perlu. */
  personaDoneTurnCounts(): Map<string, number> {
    // P0-DATA-2: scan events ∪ arsip, statistik growth tidak berubah karena retensi.
    const rows = this.db
      .prepare(
        `SELECT payload FROM events WHERE type = 'persona.state'
         UNION ALL SELECT payload FROM events_archive WHERE type = 'persona.state'`
      )
      .all() as Array<{ payload: string }>;
    const out = new Map<string, number>();
    for (const r of rows) {
      try {
        const p = JSON.parse(r.payload) as { state?: string; personaId?: string };
        if (p.state === "done" && p.personaId) out.set(p.personaId, (out.get(p.personaId) ?? 0) + 1);
      } catch {
        /* payload rusak, skip */
      }
    }
    return out;
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

  /** P0-CORE-4: messages + seq (untuk memotong batas kompresi yang aman,
   *  tidak boleh memotong di tengah pasangan assistant-toolCalls/tool-result). */
  getMessagesWithSeq(sessionId: string): Array<{ seq: number; msg: InternalMessage }> {
    const rows = this.db
      .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY seq ASC")
      .all(sessionId) as { seq: number; role: string; content: string; tool_calls: string | null; tool_call_id: string | null }[];
    return rows.map((r) => ({
      seq: r.seq,
      msg: {
        role: r.role as InternalMessage["role"],
        content: r.content,
        toolCalls: r.tool_calls ? (JSON.parse(r.tool_calls) as InternalMessage["toolCalls"]) : undefined,
        toolCallId: r.tool_call_id ?? undefined,
      },
    }));
  }

  /** P0-CORE-4: simpan checkpoint kompresi (append-only, tidak mengubah messages). */
  saveContextCheckpoint(sessionId: string, uptoSeq: number, summary: string, model: string): void {
    this.db
      .prepare("INSERT INTO context_checkpoints (session_id, upto_seq, summary, model, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(sessionId, uptoSeq, summary, model, Date.now());
  }

  /** P0-CORE-4: checkpoint aktif = id terbesar sesi (null bila belum pernah dikompresi). */
  latestContextCheckpoint(sessionId: string): { uptoSeq: number; summary: string; model: string } | null {
    const row = this.db
      .prepare("SELECT upto_seq, summary, model FROM context_checkpoints WHERE session_id = ? ORDER BY id DESC LIMIT 1")
      .get(sessionId) as { upto_seq: number; summary: string; model: string } | undefined;
    return row ? { uptoSeq: row.upto_seq, summary: row.summary, model: row.model } : null;
  }

  // ── P0-DEL-1: delegation job persist ─────────────────────────────

  startDelegationJob(input: { parentSessionId: string; parentTurnId: string; childSessionId: string; personaId: string; goal: string }): number {
    const now = Date.now();
    const info = this.db
      .prepare("INSERT INTO delegation_jobs (parent_session_id, parent_turn_id, child_session_id, persona_id, goal, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'running', ?, ?)")
      .run(input.parentSessionId, input.parentTurnId, input.childSessionId, input.personaId, input.goal, now, now);
    return Number(info.lastInsertRowid);
  }

  finishDelegationJob(id: number, patch: { status: "done" | "error" | "interrupted"; summary?: string; error?: string }): void {
    this.db
      .prepare("UPDATE delegation_jobs SET status = ?, summary = COALESCE(?, summary), error = COALESCE(?, error), updated_at = ? WHERE id = ?")
      .run(patch.status, patch.summary ?? null, patch.error ?? null, Date.now(), id);
  }

  /** Job berstatus running, kandidat heal saat boot (proses mati). */
  findRunningDelegationJobs(): Array<{ id: number; parentSessionId: string; childSessionId: string; personaId: string; goal: string }> {
    return (this.db
      .prepare("SELECT id, parent_session_id, child_session_id, persona_id, goal FROM delegation_jobs WHERE status = 'running'")
      .all() as Array<{ id: number; parent_session_id: string; child_session_id: string; persona_id: string; goal: string }>).map((r) => ({
      id: r.id,
      parentSessionId: r.parent_session_id,
      childSessionId: r.child_session_id,
      personaId: r.persona_id,
      goal: r.goal,
    }));
  }

  /** Riwayat job (terbaru dulu); filter projectId = project sesi PARENT. */
  listDelegationJobs(projectId?: string | null): Array<import("@yuika/contracts").DelegationJob> {
    const rows = (
      projectId
        ? this.db.prepare(
            `SELECT j.* FROM delegation_jobs j JOIN sessions s ON s.id = j.parent_session_id WHERE s.project_id = ? ORDER BY j.id DESC`,
          ).all(projectId)
        : this.db.prepare(`SELECT * FROM delegation_jobs ORDER BY id DESC`).all()
    ) as Array<{ id: number; parent_session_id: string; parent_turn_id: string; child_session_id: string; persona_id: string; goal: string; status: string; summary: string | null; error: string | null; created_at: number; updated_at: number }>;
    return rows.map((r) => ({
      id: r.id,
      parentSessionId: r.parent_session_id,
      parentTurnId: r.parent_turn_id,
      childSessionId: r.child_session_id,
      personaId: r.persona_id,
      goal: r.goal,
      status: r.status as "running" | "done" | "error" | "interrupted",
      summary: r.summary,
      error: r.error,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /** P0-DATA-2, pindahkan events lama ke events_archive.
   *
   *  Kandidat: baris `ts < cutoff` dari sesi DINGIN (event terakhir sesi < cutoff,
   *  sesi aktif tidak disentuh). Sesi dengan turn GANTUNG (belum ada penutup,
   *  dipakai boot-heal) dilewati seluruhnya; setelah heal menutupnya di boot
   *  berikutnya, sesi itu layak diarsip pada siklus sesudahnya.
   *
   *  Identitas event TIDAK berubah (id asli ikut pindah); bacaan memakai UNION
   *  (getEvents/growth/listSessions) sehingga replay & hidrasi tetap lengkap,
   *  hanya tabel aktif yang mengecil. `nowMs` disuntik untuk test (jam dimajukan).
   */
  archiveOldEvents(retentionDays: number, nowMs: number = Date.now()): { archived: number; sessions: number } {
    if (retentionDays <= 0) return { archived: 0, sessions: 0 };
    const cutoff = nowMs - retentionDays * 86_400_000;
    const tx = this.db.transaction(() => {
      // idempoten: baris yang sudah ada di arsip tidak diangkat dua kali
      const info = this.db
        .prepare(
          `INSERT OR IGNORE INTO events_archive (id, session_id, type, payload, ts, archived_at)
           SELECT e.id, e.session_id, e.type, e.payload, e.ts, ?
           FROM events e
           WHERE e.ts < ? AND e.session_id IN (
             SELECT session_id FROM events GROUP BY session_id HAVING MAX(ts) < ?
           ) AND e.session_id NOT IN (
             -- sesi turn gantung (logika = findInterruptedTurns): milik boot-heal,
             -- jangan diutak-atik, biasanya sudah ditutup heal sebelum housekeeping jalan
             SELECT s.id FROM sessions s
             JOIN (SELECT session_id, MAX(id) AS id FROM events WHERE type = 'turn.started' GROUP BY session_id) ts
               ON ts.session_id = s.id
             LEFT JOIN events e ON e.session_id = s.id AND e.id > ts.id AND (
               e.type = 'turn.cancelled' OR e.type = 'session.error' OR
               (e.type = 'persona.state' AND json_extract(e.payload, '$.state') IN ('done','idle','error'))
             )
             WHERE e.id IS NULL
           )`
        )
        .run(nowMs, cutoff, cutoff);
      const n = Number(info.changes);
      if (n > 0) {
        this.db
          .prepare(
            `DELETE FROM events WHERE id IN (SELECT id FROM events_archive)`
          )
          .run();
      }
      return n;
    });
    const archived = tx() as number;
    const sessions = archived > 0
      ? Number(
          (this.db.prepare(`SELECT COUNT(DISTINCT session_id) AS n FROM events_archive WHERE archived_at = ?`).get(nowMs) as { n: number }).n,
        )
      : 0;
    return { archived, sessions };
  }

  /** Append event draft + lekatkan meta (id monotonic, ts), kunci replay/resume. */
  appendEvent(sessionId: string, draft: EventDraft): YuiEventType {
    const withMeta = { ...draft, sessionId, id: 0, ts: Date.now() } as Record<string, unknown>;
    const info = this.db
      .prepare("INSERT INTO events (session_id, type, payload, ts) VALUES (?, ?, ?, ?)")
      .run(sessionId, draft.type, JSON.stringify(draft), withMeta.ts);
    withMeta.id = Number(info.lastInsertRowid);
    return YuiEvent.parse(withMeta);
  }

  getEvents(sessionId: string, sinceId = 0): YuiEventType[] {
    // P0-DATA-2: UNION dengan arsip, replay SSE & hidrasi melihat riwayat
    // lengkap walau baris lama sudah dipindah dari tabel aktif.
    const rows = this.db
      .prepare(
        `SELECT id, payload, ts FROM (
           SELECT id, payload, ts FROM events WHERE session_id = ? AND id > ?
           UNION ALL
           SELECT id, payload, ts FROM events_archive WHERE session_id = ? AND id > ?
         ) ORDER BY id ASC`
      )
      .all(sessionId, sinceId, sessionId, sinceId) as { id: number; payload: string; ts: number }[];
    return rows.map((r) => {
      const payload = JSON.parse(r.payload) as Record<string, unknown>;
      return YuiEvent.parse({ ...payload, id: r.id, ts: r.ts, sessionId });
    });
  }

  /** P0 reliabilitas (boot heal): sesi yang `turn.started` TERAKHIRNYA tidak
   *  punya event penutup (persona.state done/idle/error, turn.cancelled, atau
   *  session.error), turn itu mati bersama proses lama (server direstart saat
   *  berjalan). Tanpa heal, replay UI menampilkan "berjalan" zombie selamanya. */
  findInterruptedTurns(): Array<{ sessionId: string; personaId: string; lastTurnEventId: number }> {
    const rows = this.db
      .prepare(
        `SELECT s.id AS sid, s.persona_id AS pid, ts.id AS last_turn_id
         FROM sessions s
         JOIN (SELECT session_id, MAX(id) AS id FROM events WHERE type = 'turn.started' GROUP BY session_id) ts
           ON ts.session_id = s.id
         LEFT JOIN events e ON e.session_id = s.id AND e.id > ts.id AND (
           e.type = 'turn.cancelled' OR e.type = 'session.error' OR
           (e.type = 'persona.state' AND json_extract(e.payload, '$.state') IN ('done','idle','error'))
         )
         WHERE e.id IS NULL`
      )
      .all() as Array<{ sid: string; pid: string; last_turn_id: number }>;
    return rows.map((r) => ({ sessionId: r.sid, personaId: r.pid, lastTurnEventId: r.last_turn_id }));
  }

  /** P0-DATA-3: approval persist, kartu pending survive restart (jika mati →
   *  expired), dan "Setujui & ingat" lintas restart via approval_memory. */
  insertApproval(row: { requestId: string; sessionId: string; tool: string; args: Record<string, unknown>; reason: string }): void {
    this.db
      .prepare("INSERT INTO approvals (request_id, session_id, tool, args, reason, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)")
      .run(row.requestId, row.sessionId, row.tool, JSON.stringify(row.args), row.reason, Date.now());
  }

  settleApproval(requestId: string, status: "approved" | "denied" | "expired", remember = false): boolean {
    const info = this.db
      .prepare("UPDATE approvals SET status = ?, remember = ?, resolved_at = ? WHERE request_id = ?")
      .run(status, remember ? 1 : 0, Date.now(), requestId);
    return info.changes > 0;
  }

  listPendingApprovals(): { requestId: string; sessionId: string; tool: string; reason: string }[] {
    return (this.db
      .prepare("SELECT request_id, session_id, tool, reason FROM approvals WHERE status = 'pending'")
      .all() as { request_id: string; session_id: string; tool: string; reason: string }[])
      .map((r) => ({ requestId: r.request_id, sessionId: r.session_id, tool: r.tool, reason: r.reason }));
  }

  rememberApproval(sessionId: string, tool: string): void {
    this.db.prepare("INSERT OR REPLACE INTO approval_memory (session_id, tool, created_at) VALUES (?, ?, ?)").run(sessionId, tool, Date.now());
  }

  getRememberedTools(sessionId: string): string[] {
    return (this.db.prepare("SELECT tool FROM approval_memory WHERE session_id = ?").all(sessionId) as { tool: string }[]).map((r) => r.tool);
  }

  /** Sweep saat runtime start: approval pending dari proses lama → expired +
   *  event approval.expired ke sesi terkait (UI menampilkan kartu kedaluwarsa). */
  expirePendingApprovals(): number {
    const pending = this.listPendingApprovals();
    for (const p of pending) {
      this.settleApproval(p.requestId, "expired");
      this.appendEvent(p.sessionId, { type: "approval.expired", requestId: p.requestId, tool: p.tool });
    }
    return pending.length;
  }

  /** P1-PRJ-8: hapus SEMUA sesi milik project + turunannya (events, messages,
   *  approvals, approval_memory) dalam SATU transaksi. Return jumlah yang dihapus. */
  deleteProjectSessions(projectId: string): { sessions: number; events: number; approvals: number } {
    const ids = (this.db.prepare("SELECT id FROM sessions WHERE project_id = ?").all(projectId) as { id: string }[]).map(
      (r) => r.id,
    );
    if (ids.length === 0) return { sessions: 0, events: 0, approvals: 0 };
    const ph = ids.map(() => "?").join(",");
    let events = 0;
    let approvals = 0;
    const tx = this.db.transaction(() => {
      events = this.db.prepare(`DELETE FROM events WHERE session_id IN (${ph})`).run(...ids).changes;
      // P0-DATA-2: arsip ikut dibersihkan (paritas driver PG, project terhapus
      // tidak meninggalkan jejak events arsip); angka laporan tetap dari tabel aktif
      this.db.prepare(`DELETE FROM events_archive WHERE session_id IN (${ph})`).run(...ids).changes;
      this.db.prepare(`DELETE FROM messages WHERE session_id IN (${ph})`).run(...ids);
      approvals = this.db.prepare(`DELETE FROM approvals WHERE session_id IN (${ph})`).run(...ids).changes;
      this.db.prepare(`DELETE FROM approval_memory WHERE session_id IN (${ph})`).run(...ids);
      this.db.prepare(`DELETE FROM sessions WHERE id IN (${ph})`).run(...ids);
    });
    tx();
    return { sessions: ids.length, events, approvals };
  }

  close(): void {
    this.db.close();
  }
}
