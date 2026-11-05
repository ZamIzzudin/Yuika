// P0-INF-1: REST contract test apps/api — buildApp dengan runtime PALSU
// (cast) → fastify.inject. Menguji kontrak HTTP (path/status/body), BUKAN
// logika runtime (sudut itu milik suite core).
import { describe, expect, it } from "vitest";
import type { YuiRuntime } from "@yui/core";
import { buildApp } from "../app.js";

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
  writeProjectUpload: async (_id: string, rel: string, _buf: Buffer) => rel,
} as unknown as YuiRuntime;

const app = buildApp(fake);

describe("apps/api REST contract", () => {
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
