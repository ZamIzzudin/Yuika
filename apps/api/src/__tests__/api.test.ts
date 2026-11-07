// P0-INF-1: REST contract test apps/api — buildApp dengan runtime PALSU
// (cast) → fastify.inject. Menguji kontrak HTTP (path/status/body), BUKAN
// logika runtime (sudut itu milik suite core).
import { describe, expect, it } from "vitest";
import type { YuiRuntime } from "@yuika/core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolasi auth gate (pola auth.test.ts): auth.db tmp — auth.db DEV punya user
// terdaftar → gate aktif → semua kontrak 401 tanpa ini.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "yui-api-contract-"));
process.env.YUI_AUTH_DB = path.join(TMP, "auth.db");

const { buildApp } = await import("../app.js");

const calls: string[] = [];
const fake = {
  createSession: (personaId: string, projectId: string | null) => {
    calls.push(`createSession:${personaId}`);
    return { sessionId: "s_new", persona: { id: personaId }, projectId };
  },
  listProjectSessions: () => [],
  getEvents: (_id: string, since: number) => [{ id: since + 1, ts: 1, sessionId: "s1", type: "turn.started", turnId: "t1" }],
  subscribe: () => () => undefined,
  cancelTurn: () => true,
  emitSessionError: () => undefined,
  runTurn: () => Promise.resolve(),
  getTrace: () => ({ turns: [] }),
  cancelDelegation: (id: string) => id !== "s_missing",
  steerDelegation: () => true,
  pauseDelegation: () => true,
  resumeDelegation: (id: string) => id !== "s_missing",
  resolveApproval: () => true,
  getProject: (id: string) => (id === "p_ok" ? { id, name: "demo" } : null),
  getProjectActivity: () => [
    { at: 2, sessionId: "s1", personaId: "yui-scholar", kind: "tool", label: "web_fetch https://example.com", isError: false },
  ],
  getProjectDashboard: (id: string) =>
    id === "p_ok"
      ? {
          tasks: { total: 2, todo: 1, doing: 1, review: 0, done: 0, unassigned: 1, reopened: 0, withAcceptancePct: 50 },
          health: { pendingApprovals: 0, qaFail: 0, delegationErrors: 0 },
          phases: [],
          runs: [],
          updatedAt: 1,
        }
      : null,
  writeProjectUpload: async (_id: string, rel: string, _buf: Buffer) => rel,
  listProjectTasks: () => [
    { id: "t_a", projectId: "p_ok", title: "A", status: "todo", assignee: "yui-coder", refs: [], description: null, acceptance: ["done a"], dependsOn: ["t_hantu"], estimate: "1d", phase: "planning", createdAt: 0, updatedAt: 0 },
    { id: "t_b", projectId: "p_ok", title: "B", status: "todo", assignee: null, refs: [], description: null, acceptance: [], dependsOn: [], estimate: null, phase: "research", createdAt: 0, updatedAt: 0 },
  ],
  getBrowserPage: async (_id: string, url: string) => {
    if (url.includes("evil")) {
      const { BrowserReadError } = await import("@yuika/core");
      throw new BrowserReadError("host_denied", `domain tidak di allowlist project: evil.com`);
    }
    return { url, title: "Doc", contentType: "text/html", html: "<h1>Hi</h1>" };
  },
  listBrowserVisits: () => [{ id: 1, url: "https://example.com", title: "E", byRole: "agent", createdAt: 1 }],
} as unknown as YuiRuntime;

const app = buildApp(fake);

describe("apps/api REST contract", () => {
  it("GET /api/projects/:id/activity — 200 shape {activity:[…]} (Batch 14a++ Logs)", async () => {
    const r = await app.inject({ method: "GET", url: "/api/projects/p_ok/activity?limit=50" });
    expect(r.statusCode).toBe(200);
    const d = r.json() as { activity: { personaId: string; kind: string; label: string }[] };
    expect(Array.isArray(d.activity)).toBe(true);
    // browsing history ikut tergabung (kind visit)
    expect(d.activity.some((a) => a.kind === "visit" && a.label.includes("example.com"))).toBe(true);
  });
  it("GET /api/projects/:id/activity — project tak dikenal → 404 {error}", async () => {
    const r = await app.inject({ method: "GET", url: "/api/projects/p_hantu/activity" });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ error: "project not found" });
  });
  it("GET /api/projects/:id/dashboard — 200 shape {dashboard} (P2-PM-4/5); tak dikenal → 404", async () => {
    const r = await app.inject({ method: "GET", url: "/api/projects/p_ok/dashboard" });
    expect(r.statusCode).toBe(200);
    const d = r.json() as { dashboard: { tasks: { total: number }; phases: unknown[] } };
    expect(d.dashboard.tasks.total).toBe(2);
    expect(Array.isArray(d.dashboard.phases)).toBe(true);
    const nf = await app.inject({ method: "GET", url: "/api/projects/p_hantu/dashboard" });
    expect(nf.statusCode).toBe(404);
    expect(nf.json()).toMatchObject({ error: "project tidak ditemukan" });
  });
  it("POST /api/sessions — valid → 200 shape {sessionId,persona,projectId}", async () => {
    const r = await app.inject({ method: "POST", url: "/api/sessions", payload: { personaId: "yui-scholar" } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ sessionId: "s_new", persona: { id: "yui-scholar" }, projectId: null });
    expect(calls).toContain("createSession:yui-scholar");
  });

  it("POST /api/sessions — body invalid → 400 {error} (zod via error handler)", async () => {
    const r = await app.inject({ method: "POST", url: "/api/sessions", payload: { personaId: "" } });
    expect(r.statusCode).toBe(400);
    expect(typeof r.json().error).toBe("string");
  });

  it("GET /api/sessions/:id/events?since → {events} replay", async () => {
    const r = await app.inject({ method: "GET", url: "/api/sessions/s1/events?since=5" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { events: { type: string }[] };
    expect(body.events[0]!.type).toBe("turn.started");
  });

  it("POST /api/delegations/:id — pause/resume/steer + 404 bila tak aktif", async () => {
    expect((await app.inject({ method: "POST", url: "/api/delegations/s_child", payload: { action: "pause" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/delegations/s_child", payload: { action: "resume" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/delegations/s_child", payload: { action: "steer", text: "fokus" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/delegations/s_child", payload: { action: "sleep" } })).statusCode).toBe(400);
    const gone = await app.inject({ method: "POST", url: "/api/delegations/s_missing", payload: { action: "resume" } });
    expect(gone.statusCode).toBe(404);
  });

  it("GET /api/projects/:id — 404 {error} bila tak ada", async () => {
    const r = await app.inject({ method: "GET", url: "/api/projects/p_nope" });
    expect(r.statusCode).toBe(404);
    expect(r.json().error).toContain("tidak ditemukan");
  });

  it("POST /api/projects/:id/uploads — nama divalidasi & ext luar daftar → 400", async () => {
    const bad = await app.inject({ method: "POST", url: "/api/projects/p_ok/uploads?name=..%2Fevil.exe", payload: Buffer.from("x"), headers: { "content-type": "application/octet-stream" } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: "POST", url: "/api/projects/p_ok/uploads?name=doc.pdf", payload: Buffer.from("%PDF-1.4"), headers: { "content-type": "application/octet-stream" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().path).toBe("uploads/doc.pdf");
  });

  it("P2-PM-3: GET /tasks/validate — lint DAG + coverage (kontrak bentuk)", async () => {
    const r = await app.inject({ method: "GET", url: "/api/projects/p_ok/tasks/validate" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.ok).toBe(false); // dep hantu + fase lain tak ter-cover
    expect(body.errors.some((e: string) => e.includes("t_hantu"))).toBe(true);
    expect(body.errors.some((e: string) => e.includes("ter-cover"))).toBe(true);
    expect(body.stats.phaseCoverage.length).toBe(7);
  });

  it("P2-STU-4: GET /browser/fetch — proxy read-only + 403 host_denied; GET /browser/visits", async () => {
    const ok = await app.inject({ method: "GET", url: "/api/projects/p_ok/browser/fetch?url=https%3A%2F%2Fexample.com" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ title: "Doc", html: "<h1>Hi</h1>" });

    const denied = await app.inject({ method: "GET", url: "/api/projects/p_ok/browser/fetch?url=https%3A%2F%2Fevil.com" });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ code: "host_denied" });

    const visits = await app.inject({ method: "GET", url: "/api/projects/p_ok/browser/visits" });
    expect(visits.statusCode).toBe(200);
    expect(visits.json().visits[0]).toMatchObject({ url: "https://example.com", byRole: "agent" });
  });

  it("CORS: origin direfleksikan (web:3000 ↔ api:3211)", async () => {
    const r = await app.inject({ method: "GET", url: "/api/sessions/s1/events", headers: { origin: "http://localhost:3000" } });
    expect(r.statusCode).toBe(200);
    expect(r.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });

  it("CORS di SSE stream: hijack() melewati pipeline fastify — ACAO harus tetap ada (fix E2E 2026-11)", async () => {
    // hijack + raw.writeHead menimpa header; tanpa refleksi manual browser
    // memblokir EventSource (kejadian E2E P0-QA-1: web:3990 → api:3291).
    const r = await app.inject({ method: "GET", url: "/api/sessions/s1/stream?snapshot=1", headers: { origin: "http://localhost:3990" } });
    expect(r.statusCode).toBe(200);
    expect(r.headers["access-control-allow-origin"]).toBe("http://localhost:3990");
    expect(r.headers["content-type"]).toContain("text/event-stream");
  });
});
