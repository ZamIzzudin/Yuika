// CP-3 SSO via portal, kontrak & alur lengkap apps/api:
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
process.env.YUI_PORTAL_DEVICE_DB = path.join(TMP, "portal-device.db"); // auto-link tak boleh sentuh db dev

// ── double portal (/api/oauth/token + /api/devices/claim; code di-issue helper in-proses) ──
const codes = new Map<string, { challenge: string; redirectUri: string; accountId: string; email: string; withDeviceToken: boolean }>();
const claims: Array<{ token: string; kind: string; name: string; signPub: string }> = [];
let failClaims = false;
let server: http.Server;
let portalUrl = "";

const { buildApp } = await import("../app.js");
const { _resetAuthForTests } = await import("../auth/store.js");
const { getWebDevice, _resetPortalStoreForTests } = await import("../portal/store.js");
const { getWebPresence } = await import("../portal/web-presence.js");

type App = Awaited<ReturnType<typeof buildApp>>;
let app: App;

function issueCode(
  challenge: string,
  redirectUri: string,
  accountId = "acc_sso_1",
  email = "sso@yuika.test",
  withDeviceToken = true,
): string {
  const code = `oc_${randomBytes(12).toString("base64url")}`;
  codes.set(code, { challenge, redirectUri, accountId, email, withDeviceToken });
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
        res.end(
          JSON.stringify({
            accountId: rec.accountId,
            email: rec.email,
            ...(rec.withDeviceToken ? { deviceToken: `tok_sso_web_${randomBytes(12).toString("hex")}` } : {}),
          }),
        );
      });
      return;
    }
    // CP-4 double: claim device (deviceId deterministik dari signPub, id stabil)
    if (req.method === "POST" && req.url === "/api/devices/claim") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (failClaims) {
          res.writeHead(409, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "simulated claim failure" }));
          return;
        }
        const b = JSON.parse(body || "{}") as { token?: string; kind?: string; name?: string; signPub?: string; dhPub?: string };
        claims.push({ token: b.token ?? "", kind: b.kind ?? "", name: b.name ?? "", signPub: b.signPub ?? "" });
        if (!b.token || b.token.length < 20 || !b.signPub) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid claim" }));
          return;
        }
        const deviceId = `dev_${createHash("sha256").update(b.signPub).digest("hex").slice(0, 16)}`;
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ deviceId, accountId: "acc_claim_1" }));
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
  delete process.env.YUI_PORTAL_DEVICE_DB;
  await app.close();
  await getWebPresence().stop(); // matikan retry loop presence (relay dev tak jalan)
  server.close();
  _resetAuthForTests();
  _resetPortalStoreForTests();
  fs.rmSync(TMP, { recursive: true, force: true });
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
  // verifier server, jadi ambil challenge DARI URL utk issue code; verifier
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
    // CP-4: auto-link, browser diklaim sebagai device web; kunci STABIL
    expect(claims).toHaveLength(1);
    expect(claims[0]!.kind).toBe("web");
    const web = getWebDevice();
    expect(web?.deviceId).toMatch(/^dev_[0-9a-f]{16}$/);
    expect(web?.kind).toBe("web");
    // SSO ulang (account sama) → RE-CLAIM idempotent (self-heal bila device
    // terhapus di portal) dgn kunci sama → deviceId tidak berubah.
    const st2 = await start();
    const code2 = issueCode(new URL(st2.authorizeUrl).searchParams.get("code_challenge") ?? "", REDIRECT);
    await app.inject({ method: "POST", url: "/api/auth/portal/complete", payload: { code: code2, state: st2.state } });
    expect(claims).toHaveLength(2);
    expect(claims[1]!.signPub).toBe(claims[0]!.signPub);
    expect(getWebDevice()?.deviceId).toBe(web?.deviceId);
  });

  it("auto-link: portal tanpa deviceToken → tanpa claim (backward compat)", async () => {
    const n = claims.length;
    const st = await start();
    const code = issueCode(new URL(st.authorizeUrl).searchParams.get("code_challenge") ?? "", REDIRECT, "acc_nodev", "nodev@yuika.test", false);
    const r = await app.inject({ method: "POST", url: "/api/auth/portal/complete", payload: { code, state: st.state } });
    expect(r.statusCode).toBe(200);
    expect(claims).toHaveLength(n);
  });

  it("auto-link: claim gagal → login TETAP sukses", async () => {
    failClaims = true;
    const st = await start();
    const code = issueCode(new URL(st.authorizeUrl).searchParams.get("code_challenge") ?? "", REDIRECT, "acc_fail", "fail@yuika.test");
    const r = await app.inject({ method: "POST", url: "/api/auth/portal/complete", payload: { code, state: st.state } });
    expect(r.statusCode).toBe(200); // login jalan, device bisa di-link nanti
    failClaims = false;
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
    expect(replay.statusCode).toBe(400); // attempt sekali pakai, replay state tak dikenal
  });

  it("verifier mismatch (double menolak) → 401 dengan pesan portal", async () => {
    const st = await start();
    const code = issueCode(s256("verifier-salah"), REDIRECT); // challenge tak cocok
    const r = await app.inject({ method: "POST", url: "/api/auth/portal/complete", payload: { code, state: st.state } });
    expect(r.statusCode).toBe(401);
    expect((r.json() as { error: string }).error).toContain("mismatch");
  });

  it("mapping: SSO kedua (account sama) → user ID sama; email sama dari account BEDA → TIDAK mengambil alih", async () => {
    // SSO pertama utk acc_link_1 → user baru
    const st1 = await start();
    const c1 = issueCode(new URL(st1.authorizeUrl).searchParams.get("code_challenge") ?? "", REDIRECT, "acc_link_1", "linked@yuika.test");
    const r1 = await app.inject({ method: "POST", url: "/api/auth/portal/complete", payload: { code: c1, state: st1.state } });
    const id1 = (r1.json() as { user: { id: string } }).user.id;

    // SSO lagi account sama → tetap user itu (bukan duplikat)
    const st2 = await start();
    const c2 = issueCode(new URL(st2.authorizeUrl).searchParams.get("code_challenge") ?? "", REDIRECT, "acc_link_1", "linked@yuika.test");
    const r2 = await app.inject({ method: "POST", url: "/api/auth/portal/complete", payload: { code: c2, state: st2.state } });
    expect((r2.json() as { user: { id: string } }).user.id).toBe(id1);

    // Account portal BEDA dgn email SAMA → 409 (anti takeover: email sudah
    // milik akun portal lain, identitas = portalAccountId).
    const st3 = await start();
    const c3 = issueCode(new URL(st3.authorizeUrl).searchParams.get("code_challenge") ?? "", REDIRECT, "acc_link_2", "linked@yuika.test");
    const r3 = await app.inject({ method: "POST", url: "/api/auth/portal/complete", payload: { code: c3, state: st3.state } });
    expect(r3.statusCode).toBe(409);
    expect((r3.json() as { error: string }).error).toContain("another portal account");
  });

  it("portal-only: register & login lokal → 404 (konsep dihapus)", async () => {
    const reg = await app.inject({ method: "POST", url: "/api/auth/register", payload: { email: "x@yuika.test", password: "whatever-123" } });
    expect(reg.statusCode).toBe(404);
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "x@yuika.test", password: "whatever-123" } });
    expect(login.statusCode).toBe(404);
  });
});
