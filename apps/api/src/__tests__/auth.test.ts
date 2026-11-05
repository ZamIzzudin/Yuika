// P1-INF-1: auth gate — register/login/logout/me + middleware tenant scope.
// Isolasi: YUI_AUTH_DB menunjuk file tmp per suite (di-setup sebelum import).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "yui-auth-"));
process.env.YUI_AUTH_DB = path.join(TMP, "auth.db");

const { buildApp } = await import("../app.js");
const { _resetAuthForTests, authUserCount } = await import("../auth/store.js");

const fake = { listPersonas: () => [] } as unknown as YuiRuntime;
let app: FastifyInstance;

beforeAll(() => {
  app = buildApp(fake);
});

afterAll(() => {
  _resetAuthForTests();
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("P1-INF-1 auth REST + gerbang tenant", () => {
  it("mode lokal: belum ada user → route non-auth terbuka (backward compat)", async () => {
    expect(authUserCount()).toBe(0);
    const r = await app.inject({ method: "GET", url: "/api/personas" });
    expect(r.statusCode).toBe(200);
  });

  it("register → 201 {token,user}; email duplikat → 409", async () => {
    const ok = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "Owner@Yuika.test", password: "strong-pass-1" },
    });
    expect(ok.statusCode).toBe(201);
    const b = ok.json() as { token: string; user: { id: string; email: string } };
    expect(b.token.length).toBeGreaterThan(20);
    expect(b.user.email).toBe("owner@yuika.test"); // dinormalkan lowercase

    const dup = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "owner@YUIKA.test", password: "another-pass-2" },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("setelah user ada: route non-auth tanpa token → 401; dengan token → 200", async () => {
    const no = await app.inject({ method: "GET", url: "/api/personas" });
    expect(no.statusCode).toBe(401);
    expect(no.json()).toEqual({ error: "authentication required" });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "owner@yuika.test", password: "strong-pass-1" },
    });
    expect(login.statusCode).toBe(200);
    const { token } = login.json() as { token: string };

    const yes = await app.inject({
      method: "GET",
      url: "/api/personas",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(yes.statusCode).toBe(200);

    // Token via query (?auth_token=) — jalur yang sama dengan SSE
    // (EventSource tak bisa set header).
    const viaQuery = await app.inject({
      method: "GET",
      url: "/api/personas",
      query: { auth_token: token },
    });
    expect(viaQuery.statusCode).toBe(200);
  });

  it("password salah → 401; me membaca Bearer; logout mencabut token", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "owner@yuika.test", password: "wrong-pass-999" },
    });
    expect(bad.statusCode).toBe(401);

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "owner@yuika.test", password: "strong-pass-1" },
    });
    const { token } = login.json() as { token: string };

    const me = await app.inject({ url: "/api/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ authRequired: true, user: { email: "owner@yuika.test" } });

    await app.inject({ method: "POST", url: "/api/auth/logout", headers: { authorization: `Bearer ${token}` } });
    const after = await app.inject({ url: "/api/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(after.json()).toMatchObject({ user: null, authRequired: true });
  });

  it("register validasi zod: password < 8 char → 400", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "x@yuika.test", password: "short" },
    });
    expect(r.statusCode).toBe(400);
  });
});
