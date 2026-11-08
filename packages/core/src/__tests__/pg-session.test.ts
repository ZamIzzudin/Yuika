// P0-DATA-1, integrasi driver Postgres (gated: YUI_PG_IT=1 + DATABASE_URL).
// Menguji PgSessionStore (async) LANGSUNG, bukan pg-bridge (worker tsx tidak
// termuat di vitest worker; bridge diverifikasi via skrip live).
// Run lokal: docker run --rm -d -e POSTGRES_USER=yui -e POSTGRES_PASSWORD=yui \
//   -e POSTGRES_DB=yui -p 5544:5432 postgres:17-alpine
//   YUI_PG_IT=1 DATABASE_URL=postgres://yui:yui@127.0.0.1:5544/yui npx vitest run src/__tests__/pg-session.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgSessionStore } from "../session/pg-session.js";

const gate = process.env.YUI_PG_IT === "1";
const url = process.env.DATABASE_URL ?? "postgres://yui:yui@127.0.0.1:5544/yui";

describe.skipIf(!gate)("PgSessionStore (integrasi, YUI_PG_IT=1)", () => {
  let s: PgSessionStore;
  const sid = "pgit-" + Date.now().toString(36);

  beforeAll(async () => {
    s = new PgSessionStore(url);
    await s.migrate();
  });
  afterAll(async () => {
    if (s) await s.close();
  });

  it("CRUD sesi + events id monotonic + sinceId", async () => {
    await s.createSession(sid, "yui-coder", "SYS", ["code"], "pj1");
    expect(s.getSession(sid)).resolves.toMatchObject({ personaId: "yui-coder", projectId: "pj1" });
    const e1 = await s.appendEvent(sid, { type: "turn.started", turnId: "t1" } as never);
    const e2 = await s.appendEvent(sid, { type: "message.delta", turnId: "t1", delta: "x" } as never);
    expect(e2.id).toBeGreaterThan(e1.id);
    expect((await s.getEvents(sid)).length).toBe(2);
    expect((await s.getEvents(sid, e1.id)).length).toBe(1);
  });

  it("searchMessages ILIKE case-insensitive", async () => {
    await s.appendMessage(sid, { role: "user", content: "cari HALO dunia" });
    const hits = await s.searchMessages({ query: "halo", limit: 5 });
    expect(hits.length).toBe(1);
    expect(hits[0]!.snippet.toLowerCase()).toContain("halo");
  });

  it("heal: findInterruptedTurns tertutup oleh persona.state done", async () => {
    expect((await s.findInterruptedTurns()).some((t) => t.sessionId === sid)).toBe(true);
    await s.appendEvent(sid, { type: "persona.state", personaId: "yui-coder", state: "done" } as never);
    expect((await s.findInterruptedTurns()).some((t) => t.sessionId === sid)).toBe(false);
  });

  it("retensi arsip: identitas id & urutan tetap (UNION)", async () => {
    const r = await s.archiveOldEvents(30, Date.now() + 40 * 86_400_000);
    expect(r.archived).toBeGreaterThanOrEqual(3);
    expect((await s.getEvents(sid)).length).toBeGreaterThanOrEqual(3); // UNION arsip
    const lps = await s.listProjectSessions("pj1");
    expect(lps.length).toBe(1);
    expect(lps[0]!.lastEventId).toBeGreaterThan(0);
  });

  it("approvals + delegation job + deleteProjectSessions bersihkan arsip", async () => {
    const jobId = await s.startDelegationJob({ parentSessionId: sid, parentTurnId: "t1", childSessionId: sid + "-c", personaId: "yui-scholar", goal: "g" });
    await s.finishDelegationJob(jobId, { status: "done", summary: "ok" });
    expect((await s.listDelegationJobs()).some((j) => j.id === jobId && j.status === "done")).toBe(true);
    await s.insertApproval({ requestId: sid + "-apr", sessionId: sid, tool: "write_file", args: {}, reason: "uji" });
    expect(await s.settleApproval(sid + "-apr", "approved", true)).toBe(true);
    const del = await s.deleteProjectSessions("pj1");
    expect(del.sessions).toBe(1);
    expect((await s.getEvents(sid)).length).toBe(0); // arsip ikut bersih
  });
});
