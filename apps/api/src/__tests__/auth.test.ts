// Auth gate (portal-only, CP-3+): me/logout + middleware tenant scope.
// Local register/login DIHAPUS, akun & signup hidup di yuika-portal.
// Isolasi: YUI_AUTH_DB menunjuk file tmp per suite (di-setup sebelum import).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "yui-auth-"));
process.env.YUI_AUTH_DB = path.join(TMP, "auth.db");

const { buildApp } = await import("../app.js");
const { _resetAuthForTests, authUserCount, createSession, findOrCreatePortalUser } = await import(
  "../auth/store.js"
);

const fake = { listPersonas: () => [] } as unknown as YuiRuntime;
let app: FastifyInstance;

beforeAll(() => {
  app = buildApp(fake);
});

afterAll(() => {
  _resetAuthForTests();
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("auth gate portal-only (me/logout + tenant scope)", () => {
  it("mode terbuka: belum ada user → route non-auth terbuka; me → {user null, authRequired false}", async () => {
    expect(authUserCount()).toBe(0);
    const r = await app.inject({ method: "GET", url: "/api/personas" });
    expect(r.statusCode).toBe(200);
    const me = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(me.json()).toMatchObject({ user: null, authRequired: false });
    expect((me.json() as { portalUrl: string }).portalUrl).toMatch(/^https?:\/\//);
  });

  it("portal-only: register & login lokal → 404 (konsep dihapus)", async () => {
    const reg = await app.inject({
      method: "POST", url: "/api/auth/register",
      payload: { email: "x@yuika.test", password: "whatever-123" },
    });
    expect(reg.statusCode).toBe(404);
    const login = await app.inject({
      method: "POST", url: "/api/auth/login",
      payload: { email: "x@yuika.test", password: "whatever-123" },
    });
    expect(login.statusCode).toBe(404);
  });

  it("setelah user portal ada: non-auth tanpa token → 401; Bearer/?auth_token → 200", async () => {
    // user pertama lahir dari SSO (bukan register)
    const user = findOrCreatePortalUser("acc_unit_1", "owner@yuika.test");
    const no = await app.inject({ method: "GET", url: "/api/personas" });
    expect(no.statusCode).toBe(401);
    expect(no.json()).toEqual({ error: "authentication required" });

    const token = createSession(user.id);
    const yes = await app.inject({ method: "GET", url: "/api/personas", headers: { authorization: `Bearer ${token}` } });
    expect(yes.statusCode).toBe(200);

    // Token via query (?auth_token=), jalur yang sama dengan SSE
    // (EventSource tak bisa set header).
    const viaQuery = await app.inject({ method: "GET", url: "/api/personas", query: { auth_token: token } });
    expect(viaQuery.statusCode).toBe(200);
  });

  it("me membaca Bearer; logout mencabut token", async () => {
    const user = findOrCreatePortalUser("acc_unit_1", "owner@yuika.test");
    const token = createSession(user.id);
    const me = await app.inject({ url: "/api/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ authRequired: true, user: { email: "owner@yuika.test" } });

    await app.inject({ method: "POST", url: "/api/auth/logout", headers: { authorization: `Bearer ${token}` } });
    const after = await app.inject({ url: "/api/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(after.json()).toMatchObject({ user: null, authRequired: true });
  });

  it("identitas = portalAccountId: email sama dari account beda → ditolak; user legacy NULL di-link", async () => {
    const a = findOrCreatePortalUser("acc_a", "same@yuika.test");
    // ulang account a → tetap user a (bukan duplikat)
    expect(findOrCreatePortalUser("acc_a", "same@yuika.test").id).toBe(a.id);

    // account BEDA dgn email yang sama → DITOLAK (anti takeover).
    expect(() => findOrCreatePortalUser("acc_b", "same@yuika.test")).toThrow(/another portal account/);

    // user legacy pra-portal (portal_account_id NULL) → SSO dgn email sama
    // MENGHUBUNGKANNYA (migrasi; portal menjamin kepemilikan email).
    const db = new Database(process.env.YUI_AUTH_DB!);
    db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES ('u_legacy', 'legacy@yuika.test', 's1$old', 1)").run();
    db.close();
    const legacy = findOrCreatePortalUser("acc_c", "legacy@yuika.test");
    expect(legacy.id).toBe("u_legacy");
    // …dan kini milik acc_c, account lain dgn email itu → tolak
    expect(() => findOrCreatePortalUser("acc_d", "legacy@yuika.test")).toThrow(/another portal account/);
  });
});
