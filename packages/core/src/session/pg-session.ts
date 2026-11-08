// @yuika/core, P0-DATA-1: SessionStore driver PostgreSQL (postgres.js).
// Hanya dimuat oleh WORKER (session/pg-worker.ts), paket `postgres` tak pernah
// masuk proses utama/bundle web. Interface-nya ASYNC (pg memang begitu); proses
// utama memakainya lewat sync-bridge (pg-bridge.ts) sehingga ISessionStore
// (sinkron) tetap terpenuhi.
//
// Keputusan tipe kolom: id/seq/ts = double precision (bukan bigint), driver
// mengembalikan number asli (bigint → string di postgres.js); nilai selalu
// < 2^53 (epoch ms / counter), exact. COUNT() di-cast ::int.
// Mono­tonisitas id events dipertahankan via sequence bersama (nextval).
import postgres from "postgres";
import { YuiEvent, type EventDraft, type YuiEvent as YuiEventType, type DelegationJob } from "@yuika/contracts";
import type { InternalMessage } from "../provider/adapter.js";
import type { ISessionStore, SessionRow } from "./store.js";

const DDL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  persona_id TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  toolsets TEXT NOT NULL,
  created_at double precision NOT NULL,
  project_id TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  seq double precision NOT NULL DEFAULT nextval('messages_seq')::double precision,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls TEXT,
  tool_call_id TEXT,
  created_at double precision NOT NULL,
  PRIMARY KEY (seq)
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
CREATE TABLE IF NOT EXISTS events (
  id double precision NOT NULL DEFAULT nextval('events_seq')::double precision,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  ts double precision NOT NULL,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, id);
CREATE TABLE IF NOT EXISTS events_archive (
  id double precision NOT NULL,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  ts double precision NOT NULL,
  archived_at double precision NOT NULL,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_events_archive_session ON events_archive(session_id, id);
CREATE TABLE IF NOT EXISTS context_checkpoints (
  id double precision NOT NULL DEFAULT nextval('ctxcp_seq')::double precision,
  session_id TEXT NOT NULL,
  upto_seq double precision NOT NULL,
  summary TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at double precision NOT NULL,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_ctxcp_session ON context_checkpoints(session_id, id);
CREATE TABLE IF NOT EXISTS delegation_jobs (
  id double precision NOT NULL DEFAULT nextval('deljob_seq')::double precision,
  parent_session_id TEXT NOT NULL,
  parent_turn_id TEXT NOT NULL,
  child_session_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT,
  error TEXT,
  created_at double precision NOT NULL,
  updated_at double precision NOT NULL,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_deljob_parent ON delegation_jobs(parent_session_id);
CREATE TABLE IF NOT EXISTS approvals (
  request_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  args TEXT NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  remember double precision NOT NULL DEFAULT 0,
  created_at double precision NOT NULL,
  resolved_at double precision
);
CREATE INDEX IF NOT EXISTS idx_approvals_session ON approvals(session_id);
CREATE TABLE IF NOT EXISTS approval_memory (
  session_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  created_at double precision NOT NULL,
  PRIMARY KEY (session_id, tool)
);
`;

async function ensureSequences(sql: postgres.Sql): Promise<void> {
  for (const name of ["messages_seq", "events_seq", "ctxcp_seq", "deljob_seq"]) {
    await sql.unsafe(`CREATE SEQUENCE IF NOT EXISTS ${name}`);
  }
}

export class PgSessionStore {
  private sql: postgres.Sql;

  constructor(databaseUrl: string, maxConnections = 1) {
    // max=1: sync-bridge menserialisasi pemanggil; satu koneksi menjaga
    // konsistensi id sequence & transaksi tanpa pool race.
    this.sql = postgres(databaseUrl, { max: maxConnections, idle_timeout: 60 });
  }

  /** Bootstrap skema (idempotent), dipanggil worker saat start. */
  async migrate(): Promise<void> {
    await ensureSequences(this.sql);
    await this.sql.unsafe(DDL);
  }

  async createSession(id: string, personaId: string, systemPrompt: string, toolsets: string[], projectId?: string | null): Promise<SessionRow> {
    const ts = Date.now();
    await this.sql`INSERT INTO sessions (id, persona_id, system_prompt, toolsets, created_at, project_id)
      VALUES (${id}, ${personaId}, ${systemPrompt}, ${JSON.stringify(toolsets)}, ${ts}, ${projectId ?? null})`;
    return { id, personaId, systemPrompt, toolsets, createdAt: ts, projectId: projectId ?? null };
  }

  async getSession(id: string): Promise<SessionRow | undefined> {
    const rows = await this.sql`SELECT id, persona_id, system_prompt, toolsets, created_at, project_id FROM sessions WHERE id = ${id}`;
    const r = rows[0] as { id: string; persona_id: string; system_prompt: string; toolsets: string; created_at: number; project_id: string | null } | undefined;
    if (!r) return undefined;
    return {
      id: r.id,
      personaId: r.persona_id,
      systemPrompt: r.system_prompt,
      toolsets: JSON.parse(r.toolsets) as string[],
      createdAt: r.created_at,
      projectId: r.project_id ?? null,
    };
  }

  async listProjectSessions(projectId: string): Promise<Array<{ id: string; personaId: string; createdAt: number; lastEventAt: number; lastEventId: number }>> {
    const rows = await this.sql`
      SELECT s.id, s.persona_id, s.created_at,
             COALESCE(u.max_id, 0) AS last_event_id, COALESCE(u.max_ts, s.created_at) AS last_event_at
      FROM sessions s
      LEFT JOIN (
        SELECT session_id, MAX(id) AS max_id, MAX(ts) AS max_ts FROM (
          SELECT session_id, id, ts FROM events
          UNION ALL SELECT session_id, id, ts FROM events_archive
        ) GROUP BY session_id
      ) u ON u.session_id = s.id
      WHERE s.project_id = ${projectId} ORDER BY last_event_at DESC`;
    return (rows as unknown as Array<{ id: string; persona_id: string; created_at: number; last_event_id: number; last_event_at: number }>).map((r) => ({
      id: r.id,
      personaId: r.persona_id,
      createdAt: r.created_at,
      lastEventAt: r.last_event_at,
      lastEventId: r.last_event_id,
    }));
  }

  async personaSessionCounts(): Promise<Map<string, number>> {
    const rows = await this.sql`SELECT persona_id, COUNT(*)::int AS n FROM sessions GROUP BY persona_id`;
    return new Map((rows as unknown as Array<{ persona_id: string; n: number }>).map((r) => [r.persona_id, r.n]));
  }

  async personaDoneTurnCounts(): Promise<Map<string, number>> {
    const rows = await this.sql`
      SELECT payload FROM events WHERE type = 'persona.state'
      UNION ALL SELECT payload FROM events_archive WHERE type = 'persona.state'`;
    const out = new Map<string, number>();
    for (const r of rows as unknown as Array<{ payload: string }>) {
      try {
        const p = JSON.parse(r.payload) as { state?: string; personaId?: string };
        if (p.state === "done" && p.personaId) out.set(p.personaId, (out.get(p.personaId) ?? 0) + 1);
      } catch {
        /* payload rusak, skip */
      }
    }
    return out;
  }

  async appendMessage(sessionId: string, msg: InternalMessage): Promise<void> {
    await this.sql`INSERT INTO messages (session_id, role, content, tool_calls, tool_call_id, created_at)
      VALUES (${sessionId}, ${msg.role}, ${msg.content ?? ""}, ${msg.toolCalls ? JSON.stringify(msg.toolCalls) : null}, ${msg.toolCallId ?? null}, ${Date.now()})`;
  }

  async searchMessages(q: { query: string; projectId?: string | null; limit?: number }): Promise<{ sessionId: string; personaId: string; role: string; snippet: string; createdAt: number }[]> {
    const needle = q.query.toLowerCase();
    const like = `%${q.query}%`;
    // ILIKE = case-insensitive (paritas default SQLite LIKE)
    const rows = q.projectId
      ? await this.sql`SELECT m.session_id AS sid, s.persona_id AS pid, m.role AS role, m.content AS content, m.created_at AS ts
          FROM messages m JOIN sessions s ON s.id = m.session_id
          WHERE m.role IN ('user','assistant') AND m.content ILIKE ${like} AND s.project_id = ${q.projectId}
          ORDER BY m.created_at DESC LIMIT ${q.limit ?? 8}`
      : await this.sql`SELECT m.session_id AS sid, s.persona_id AS pid, m.role AS role, m.content AS content, m.created_at AS ts
          FROM messages m JOIN sessions s ON s.id = m.session_id
          WHERE m.role IN ('user','assistant') AND m.content ILIKE ${like}
          ORDER BY m.created_at DESC LIMIT ${q.limit ?? 8}`;
    return (rows as unknown as Array<{ sid: string; pid: string; role: string; content: string; ts: number }>).map((r) => {
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
  }

  async getMessages(sessionId: string): Promise<InternalMessage[]> {
    const rows = await this.sql`SELECT role, content, tool_calls, tool_call_id FROM messages WHERE session_id = ${sessionId} ORDER BY seq ASC`;
    return (rows as unknown as Array<{ role: string; content: string; tool_calls: string | null; tool_call_id: string | null }>).map((r) => ({
      role: r.role as InternalMessage["role"],
      content: r.content,
      toolCalls: r.tool_calls ? (JSON.parse(r.tool_calls) as InternalMessage["toolCalls"]) : undefined,
      toolCallId: r.tool_call_id ?? undefined,
    }));
  }

  async getMessagesWithSeq(sessionId: string): Promise<Array<{ seq: number; msg: InternalMessage }>> {
    const rows = await this.sql`SELECT seq, role, content, tool_calls, tool_call_id FROM messages WHERE session_id = ${sessionId} ORDER BY seq ASC`;
    return (rows as unknown as Array<{ seq: number; role: string; content: string; tool_calls: string | null; tool_call_id: string | null }>).map((r) => ({
      seq: r.seq,
      msg: {
        role: r.role as InternalMessage["role"],
        content: r.content,
        toolCalls: r.tool_calls ? (JSON.parse(r.tool_calls) as InternalMessage["toolCalls"]) : undefined,
        toolCallId: r.tool_call_id ?? undefined,
      },
    }));
  }

  async saveContextCheckpoint(sessionId: string, uptoSeq: number, summary: string, model: string): Promise<void> {
    await this.sql`INSERT INTO context_checkpoints (session_id, upto_seq, summary, model, created_at)
      VALUES (${sessionId}, ${uptoSeq}, ${summary}, ${model}, ${Date.now()})`;
  }

  async latestContextCheckpoint(sessionId: string): Promise<{ uptoSeq: number; summary: string; model: string } | null> {
    const rows = await this.sql`SELECT upto_seq, summary, model FROM context_checkpoints WHERE session_id = ${sessionId} ORDER BY id DESC LIMIT 1`;
    const r = rows[0] as { upto_seq: number; summary: string; model: string } | undefined;
    return r ? { uptoSeq: r.upto_seq, summary: r.summary, model: r.model } : null;
  }

  // ── delegation job persist ─────────────────────────────

  async startDelegationJob(input: { parentSessionId: string; parentTurnId: string; childSessionId: string; personaId: string; goal: string }): Promise<number> {
    const now = Date.now();
    const rows = await this.sql`INSERT INTO delegation_jobs (parent_session_id, parent_turn_id, child_session_id, persona_id, goal, status, created_at, updated_at)
      VALUES (${input.parentSessionId}, ${input.parentTurnId}, ${input.childSessionId}, ${input.personaId}, ${input.goal}, 'running', ${now}, ${now})
      RETURNING id`;
    return Number((rows[0] as { id: number }).id);
  }

  async finishDelegationJob(id: number, patch: { status: "done" | "error" | "interrupted"; summary?: string; error?: string }): Promise<void> {
    await this.sql`UPDATE delegation_jobs SET status = ${patch.status},
      summary = COALESCE(${patch.summary ?? null}, summary),
      error = COALESCE(${patch.error ?? null}, error),
      updated_at = ${Date.now()} WHERE id = ${id}`;
  }

  async findRunningDelegationJobs(): Promise<Array<{ id: number; parentSessionId: string; childSessionId: string; personaId: string; goal: string }>> {
    const rows = await this.sql`SELECT id, parent_session_id, child_session_id, persona_id, goal FROM delegation_jobs WHERE status = 'running'`;
    return (rows as unknown as Array<{ id: number; parent_session_id: string; child_session_id: string; persona_id: string; goal: string }>).map((r) => ({
      id: r.id,
      parentSessionId: r.parent_session_id,
      childSessionId: r.child_session_id,
      personaId: r.persona_id,
      goal: r.goal,
    }));
  }

  async listDelegationJobs(projectId?: string | null): Promise<DelegationJob[]> {
    const rows = projectId
      ? await this.sql`SELECT j.* FROM delegation_jobs j JOIN sessions s ON s.id = j.parent_session_id WHERE s.project_id = ${projectId} ORDER BY j.id DESC`
      : await this.sql`SELECT * FROM delegation_jobs ORDER BY id DESC`;
    return (rows as unknown as Array<{ id: number; parent_session_id: string; parent_turn_id: string; child_session_id: string; persona_id: string; goal: string; status: string; summary: string | null; error: string | null; created_at: number; updated_at: number }>).map((r) => ({
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

  async archiveOldEvents(retentionDays: number, nowMs: number = Date.now()): Promise<{ archived: number; sessions: number }> {
    if (retentionDays <= 0) return { archived: 0, sessions: 0 };
    const cutoff = nowMs - retentionDays * 86_400_000;
    const archivedRows = await this.sql.begin(async (tx) => {
      const moved = await tx`
        INSERT INTO events_archive (id, session_id, type, payload, ts, archived_at)
        SELECT e.id, e.session_id, e.type, e.payload, e.ts, ${nowMs}
        FROM events e
        WHERE e.ts < ${cutoff} AND e.session_id IN (
          SELECT session_id FROM events GROUP BY session_id HAVING MAX(ts) < ${cutoff}
        ) AND e.session_id NOT IN (
          SELECT s.id FROM sessions s
          JOIN (SELECT session_id, MAX(id) AS id FROM events WHERE type = 'turn.started' GROUP BY session_id) ts2
            ON ts2.session_id = s.id
          LEFT JOIN events e ON e.session_id = s.id AND e.id > ts2.id AND (
            e.type = 'turn.cancelled' OR e.type = 'session.error' OR
            (e.type = 'persona.state' AND (e.payload::jsonb ->> 'state') IN ('done','idle','error'))
          )
          WHERE e.id IS NULL
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id`;
      if (moved.length > 0) await tx`DELETE FROM events WHERE id IN (SELECT id FROM events_archive)`;
      return moved;
    });
    const n = archivedRows.length;
    const sessions = n > 0
      ? Number(((await this.sql`SELECT COUNT(DISTINCT session_id)::int AS n FROM events_archive WHERE archived_at = ${nowMs}`) as unknown as Array<{ n: number }>)[0]!.n)
      : 0;
    return { archived: n, sessions };
  }

  async appendEvent(sessionId: string, draft: EventDraft): Promise<YuiEventType> {
    const ts = Date.now();
    const rows = await this.sql`INSERT INTO events (session_id, type, payload, ts)
      VALUES (${sessionId}, ${draft.type}, ${JSON.stringify(draft)}, ${ts}) RETURNING id`;
    const id = Number((rows[0] as { id: number }).id);
    return YuiEvent.parse({ ...(draft as Record<string, unknown>), sessionId, id, ts });
  }

  async getEvents(sessionId: string, sinceId = 0): Promise<YuiEventType[]> {
    const rows = await this.sql`
      SELECT id, payload, ts FROM (
        SELECT id, payload, ts FROM events WHERE session_id = ${sessionId} AND id > ${sinceId}
        UNION ALL
        SELECT id, payload, ts FROM events_archive WHERE session_id = ${sessionId} AND id > ${sinceId}
      ) ORDER BY id ASC`;
    return (rows as unknown as Array<{ id: number; payload: string; ts: number }>).map((r) => {
      const payload = JSON.parse(r.payload) as Record<string, unknown>;
      return YuiEvent.parse({ ...payload, id: r.id, ts: r.ts, sessionId });
    });
  }

  async findInterruptedTurns(): Promise<Array<{ sessionId: string; personaId: string; lastTurnEventId: number }>> {
    const rows = await this.sql`
      SELECT s.id AS sid, s.persona_id AS pid, ts.id AS last_turn_id
      FROM sessions s
      JOIN (SELECT session_id, MAX(id) AS id FROM events WHERE type = 'turn.started' GROUP BY session_id) ts
        ON ts.session_id = s.id
      LEFT JOIN events e ON e.session_id = s.id AND e.id > ts.id AND (
        e.type = 'turn.cancelled' OR e.type = 'session.error' OR
        (e.type = 'persona.state' AND (e.payload::jsonb ->> 'state') IN ('done','idle','error'))
      )
      WHERE e.id IS NULL`;
    return (rows as unknown as Array<{ sid: string; pid: string; last_turn_id: number }>).map((r) => ({
      sessionId: r.sid,
      personaId: r.pid,
      lastTurnEventId: r.last_turn_id,
    }));
  }

  async insertApproval(row: { requestId: string; sessionId: string; tool: string; args: Record<string, unknown>; reason: string }): Promise<void> {
    await this.sql`INSERT INTO approvals (request_id, session_id, tool, args, reason, status, created_at)
      VALUES (${row.requestId}, ${row.sessionId}, ${row.tool}, ${JSON.stringify(row.args)}, ${row.reason}, 'pending', ${Date.now()})`;
  }

  async settleApproval(requestId: string, status: "approved" | "denied" | "expired", remember = false): Promise<boolean> {
    const rows = await this.sql`UPDATE approvals SET status = ${status}, remember = ${remember ? 1 : 0}, resolved_at = ${Date.now()}
      WHERE request_id = ${requestId} RETURNING request_id`;
    return rows.length > 0;
  }

  async listPendingApprovals(): Promise<{ requestId: string; sessionId: string; tool: string; reason: string }[]> {
    const rows = await this.sql`SELECT request_id, session_id, tool, reason FROM approvals WHERE status = 'pending'`;
    return (rows as unknown as Array<{ request_id: string; session_id: string; tool: string; reason: string }>).map((r) => ({
      requestId: r.request_id,
      sessionId: r.session_id,
      tool: r.tool,
      reason: r.reason,
    }));
  }

  async rememberApproval(sessionId: string, tool: string): Promise<void> {
    await this.sql`INSERT INTO approval_memory (session_id, tool, created_at) VALUES (${sessionId}, ${tool}, ${Date.now()})
      ON CONFLICT (session_id, tool) DO UPDATE SET created_at = EXCLUDED.created_at`;
  }

  async getRememberedTools(sessionId: string): Promise<string[]> {
    const rows = await this.sql`SELECT tool FROM approval_memory WHERE session_id = ${sessionId}`;
    return (rows as unknown as Array<{ tool: string }>).map((r) => r.tool);
  }

  async expirePendingApprovals(): Promise<number> {
    const pending = await this.listPendingApprovals();
    for (const p of pending) {
      await this.settleApproval(p.requestId, "expired");
      await this.appendEvent(p.sessionId, { type: "approval.expired", requestId: p.requestId, tool: p.tool } as EventDraft);
    }
    return pending.length;
  }

  async deleteProjectSessions(projectId: string): Promise<{ sessions: number; events: number; approvals: number }> {
    const ids = (await this.sql`SELECT id FROM sessions WHERE project_id = ${projectId}`).map((r) => (r as { id: string }).id);
    if (ids.length === 0) return { sessions: 0, events: 0, approvals: 0 };
    return this.sql.begin(async (tx) => {
      const ev = await tx`DELETE FROM events WHERE session_id = ANY(${ids}::text[]) RETURNING id`;
      await tx`DELETE FROM events_archive WHERE session_id = ANY(${ids}::text[])`;
      await tx`DELETE FROM messages WHERE session_id = ANY(${ids}::text[])`;
      const ap = await tx`DELETE FROM approvals WHERE session_id = ANY(${ids}::text[]) RETURNING request_id`;
      await tx`DELETE FROM approval_memory WHERE session_id = ANY(${ids}::text[])`;
      await tx`DELETE FROM sessions WHERE id = ANY(${ids}::text[])`;
      return { sessions: ids.length, events: ev.length, approvals: ap.length };
    });
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 3 });
  }
}
