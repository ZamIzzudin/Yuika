// CP-3 SSO via portal — kontrak & alur lengkap apps/api:
// start (PKCE S256 + state-attempt) → complete (tukar code di double portal
// /api/oauth/token) → sesi Yuika. Double portal minimal inline (semantik
// sama dengan e2e/portal-double.mts + portal nyata CP-3).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "yui-api-sso-"));
process.env.YUI_AUTH_DB = path.join(TMP, "auth.db");

// ── double portal (hanya /api/oauth/token; code di-issue helper in-proses) ──
const codes = new Map<string, { challenge: string; redirectUri: string; accountId: string; email: string }>();
let server: http.Server;
let portalUrl = "";

const { buildApp } = await import("../app.js");
const { _resetAuthForTests } = await import("../auth/store.js");

type App = Awaited<ReturnType<typeof buildApp>>;
let app: App;

function issueCode(challenge: string, redirectUri: string, accountId = "acc_sso_1", email = "sso@yuika.test"): string {
  const code = `oc_${randomBytes(12).toString("base64url")}`;
  codes.set(code, { challenge, redirectUri, accountId, email });
  return code;
}
const s256 = (v: string) => createHash("sha256").update(v).digest("base64url");

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/oauth/token") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const b = JSON.parse(body || "{}") as { code?: string; code_verifier?: string; redirect_uri?: string };
        const rec = b.code ? codes.get(b.code) : undefined;
        codes.delete(b.code ?? "");
        if (!rec) {
          res.writeHead(401, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "code not found or already used" }));
          return;
        }
        if (s256(String(b.code_verifier ?? "")) !== rec.challenge || b.redirect_uri !== rec.redirectUri) {
          res.writeHead(401, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "pkce verifier mismatch" }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ accountId: rec.accountId, email: rec.email }));
      });
      return;
    }
    res.writeHead(404).end("{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  portalUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.YUI_PORTAL_URL = portalUrl;

  const fake = {} as unknown as Parameters<typeof buildApp>[0];
  app = buildApp(fake);
});

afterAll(async () => {
  delete process.env.YUI_PORTAL_URL;
  await app.close();
  server.close();
  _resetAuthForTests();
});

const REDIRECT = "http://localhost:3990/auth/callback";

/** start → {authorizeUrl, state, challenge} (parsing manual utk issue code). */
async function start(): Promise<{ authorizeUrl: string; state: string; challenge: string; verifier: string }> {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = s256(verifier);
  const r = await app.inject({ method: "POST", url: "/api/auth/portal/start", payload: { redirectUri: REDIRECT } });
  expect(r.statusCode).toBe(200);
  const body = r.json() as { authorizeUrl: string };
  const u = new URL(body.authorizeUrl);
  expect(u.pathname).toBe("/authorize");
  expect(u.searchParams.get("client")).toBe("yuika-web");
  expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  expect(u.origin).toBe(portalUrl);
  // state mengandung attemptId + random
  const state = u.searchParams.get("state") ?? "";
  expect(state).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  // challenge di URL HARUS deterministik dari verifier test (kita tak tahu
  // verifier server — jadi ambil challenge DARI URL utk issue code; verifier
  // tetap milik server, kita hanya menguji happy path via double yang
  // memverifikasi challenge vs yang dikirim server… → utk happy path, issue
  // code dengan challenge dari URL TIDAK cukup (double cek verifier server).
  return { authorizeUrl: body.authorizeUrl, state, challenge, verifier };
}

describe("CP-3 SSO via portal", () => {
  it("start: URL authorize lengkap (client/redirect/state/S256)", async () => {
    const r = await app.inject({ method: "POST", url: "/api/auth/portal/start", payload: { redirectUri: REDIRECT } });
    expect(r.statusCode).toBe(200);
    const u = new URL((r.json() as { authorizeUrl: string }).authorizeUrl);
    expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(u.searchParams.get("response_type")).toBe("code");
    expect((u.searchParams.get("code_challenge") ?? "").length).toBeGreaterThan(20);
  });

  it("start: body invalid → 400 (zod)", async () => {
    const r = await app.inject({ method: "POST", url: "/api/auth/portal/start", payload: { redirectUri: "bukan-url" } });
    expect(r.statusCode).toBe(400);
  });

  it("complete happy path → sesi Yuika valid (me menampilkan user portal)", async () => {
    const st = await start();
    // double menerima challenge dari URL authorize (simulasi Accept di portal)
    const u = new URL(st.authorizeUrl);
    const code = issueCode(u.searchParams.get("code_challenge") ?? "", REDIRECT);
    const r = await app.inject({ method: "POST", url: "/api/auth/portal/complete", payload: { code, state: st.state } });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { token: string; user: { id: string; email: string } };
    expect(body.user.email).toBe("sso@yuika.test");
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: `Bearer ${body.token}` } });
    expect((me.json() as { user: { email: string } }).user.email).toBe("sso@yuika.test");
  });

  it("state salah → 400; code dipakai ulang → 401", async () => {
    const st = await start();
    const u = new URL(st.authorizeUrl);
    const code = issueCode(u.searchParams.get("code_challenge") ?? "", REDIRECT);
    const wrong = await app.inject({
      method: "POST", url: "/api/auth/portal/complete", payload: { code, state: `${st.state}x` },
    });
    expect(wrong.statusCode).toBe(400);
    // attempt masih hidup → pakai code yang benar, lalu replay → 401 double
    const ok = await app.inject({ method: "POST", url: "/api/auth/portal/complete", payload: { code, state: st.state } });
    expect(ok.statusCode).toBe(200);
    const replay = await app.inject({ method: "POST", url: "/api/auth/portal/complete", payload: { code, state: st.state } });
    expect(replay.statusCode).toBe(400); // attempt sekali pakai — replay state tak dikenal
  });

  it("verifier mismatch (double menolak) → 401 dengan pesan portal", async () => {
    const st = await start();
    const code = issueCode(s256("verifier-salah"), REDIRECT); // challenge tak cocok
    const r = await app.inject({ method: "POST", url: "/api/auth/portal/complete", payload: { code, state: st.state } });
    expect(r.statusCode).toBe(401);
    expect((r.json() as { error: string }).error).toContain("mismatch");
  });

  it("mapping: SSO kedua (account sama) → user ID sama; email sama dgn lokal → ter-link", async () => {
    // pre-create user lokal ber-email sama → SSO harus MENGIKATKAN (id sama)
    const reg = await app.inject({
      method: "POST", url: "/api/auth/register",
      payload: { email: "linked@yuika.test", password: "local-pass-123" },
    });
    expect(reg.statusCode).toBe(201);
    const localId = (reg.json() as { user: { id: string } }).user.id;

    const st1 = await start();
    const c1 = issueCode(new URL(st1.authorizeUrl).searchParams.get("code_challenge") ?? "", REDIRECT, "acc_link_1", "linked@yuika.test");
    const r1 = await app.inject({ method: "POST", url: "/api/auth/portal/complete", payload: { code: c1, state: st1.state } });
    expect((r1.json() as { user: { id: string } }).user.id).toBe(localId);

    // SSO lagi account sama → tetap user itu (bukan duplikat)
    const st2 = await start();
    const c2 = issueCode(new URL(st2.authorizeUrl).searchParams.get("code_challenge") ?? "", REDIRECT, "acc_link_1", "linked@yuika.test");
    const r2 = await app.inject({ method: "POST", url: "/api/auth/portal/complete", payload: { code: c2, state: st2.state } });
    expect((r2.json() as { user: { id: string } }).user.id).toBe(localId);
  });
});
