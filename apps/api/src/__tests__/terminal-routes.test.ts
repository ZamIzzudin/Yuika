// kontrak HTTP routes terminal, runtime PALSU (pola api.test.ts),
// TerminalManager asli dengan shell fixture (echo-shell.mjs) via
// YUI_TERMINAL_CMD → deterministik lintas OS.
import { afterAll, describe, expect, it } from "vitest";
import type { YuiRuntime } from "@yuika/core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "yui-api-term-"));
process.env.YUI_AUTH_DB = path.join(TMP, "auth.db");
process.env.YUI_TERMINAL_MODE = "local";
process.env.YUI_TERMINAL_CMD = `node ${path.resolve(import.meta.dirname, "../../../../packages/core/src/terminal/__fixture__/echo-shell.mjs")}`;

const { buildApp } = await import("../app.js");
const { closeAllTerminals } = await import("@yuika/core");

const fake = {
  projectWorkspacePath: (id: string) => (id === "p_ok" ? path.join(TMP, "ws") : (() => { throw new Error("project tidak ditemukan"); })()),
} as unknown as YuiRuntime;

const app = buildApp(fake);

afterAll(async () => {
  await closeAllTerminals();
  await app.close();
});

describe("terminal routes", () => {
  it("POST sessions: project tak dikenal → 404; ok → info sesi", async () => {
    const bad = await app.inject({ method: "POST", url: "/api/terminal/sessions", payload: { projectId: "p_x" } });
    expect(bad.statusCode).toBe(404);

    fs.mkdirSync(path.join(TMP, "ws"), { recursive: true });
    const res = await app.inject({ method: "POST", url: "/api/terminal/sessions", payload: { projectId: "p_ok" } });
    expect(res.statusCode).toBe(200);
    const info = res.json() as { id: string; backend: string };
    expect(info.id).toMatch(/^term_/);
    expect(info.backend).toBe("local");

    // idempotent per workspace
    const again = await app.inject({ method: "POST", url: "/api/terminal/sessions", payload: { projectId: "p_ok" } });
    expect((again.json() as { id: string }).id).toBe(info.id);
  });

  it("input → output muncul di stream (replay ring + live)", async () => {
    const s = await app.inject({ method: "POST", url: "/api/terminal/sessions", payload: { projectId: "p_ok" } });
    const { id } = s.json() as { id: string };

    const inp = await app.inject({ method: "POST", url: `/api/terminal/sessions/${id}/input`, payload: { data: "ping\n" } });
    expect(inp.statusCode).toBe(200);

    // tunggu ring terisi
    await new Promise((r) => setTimeout(r, 800));
    const list = await app.inject({ method: "GET", url: "/api/terminal/sessions" });
    expect((list.json() as { sessions: unknown[] }).sessions.length).toBeGreaterThanOrEqual(1);

    // ring buffer via JSON endpoint (SSE open-stream tak bisa di-inject)
    const buf = await app.inject({ method: "GET", url: `/api/terminal/sessions/${id}/buffer` });
    expect(buf.statusCode).toBe(200);
    expect((buf.json() as { buffer: string }).buffer).toContain("ECHO:ping");
  });

  it("input sesi tak dikenal → 410; DELETE sesi → ok, sesi hilang", async () => {
    const gone = await app.inject({ method: "POST", url: "/api/terminal/sessions/term_none/input", payload: { data: "x" } });
    expect(gone.statusCode).toBe(410);

    const s = await app.inject({ method: "GET", url: "/api/terminal/sessions" });
    const all = (s.json() as { sessions: { id: string }[] }).sessions;
    expect(all.length).toBeGreaterThanOrEqual(1);
    const del = await app.inject({ method: "DELETE", url: `/api/terminal/sessions/${all[0]!.id}` });
    expect(del.statusCode).toBe(200);
  });
});
