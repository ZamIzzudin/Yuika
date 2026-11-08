// double e2e: claim stub (pengganti portal web) + SpecRelay
// (pengganti relay produksi yuika-portal). Menjalankan SEMANTIK SPEC-PROTOCOL
// v1 yang sama; live verification vs relay asli menyusul "PORTAL READY FOR
// INTEGRATION" (lihat docs/portal/README.md).
// Claim stub: token APA PUN ≥20 char diterima (single-account e2e); deviceId
// deterministik dari signPub → host & remote dapat id stabil per kunci.
// SSO double: GET /authorize (AUTO-ACCEPT mode test → 302 balik dengan
// code) + POST /api/oauth/token (verifikasi PKCE S256 + single-use),
// semantik sama dengan /authorize portal nyata yang menampilkan tombol Accept.
import http from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { createSpecRelay } from "@yuika/relay-client/testing";

const CLAIM_PORT = Number(process.env.PORTAL_DOUBLE_PORT ?? 3110);
const RELAY_PORT = Number(process.env.PORTAL_DOUBLE_RELAY_PORT ?? 3111);
const ACCOUNT_ID = "acc_e2edouble0000001";

const relay = createSpecRelay({ devices: [], port: RELAY_PORT });
relay.port(); // pastikan listening

// code SSO sekali pakai: code → {challenge, redirectUri}
const oauthCodes = new Map<string, { challenge: string; redirectUri: string }>();
const SSO_EMAIL = "e2e-portal@yuika.test";

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${CLAIM_PORT}`);
  if (req.method === "GET" && url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, relay: RELAY_PORT }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/devices/claim") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const b = JSON.parse(body || "{}") as {
          token?: string; kind?: string; name?: string; signPub?: string; dhPub?: string;
        };
        if (!b.token || b.token.length < 20 || !b.signPub?.includes("BEGIN PUBLIC KEY") || !b.dhPub?.includes("BEGIN PUBLIC KEY") || !b.kind) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "field invalid" }));
          return;
        }
        const deviceId = `dev_${createHash("sha256").update(b.signPub).digest("hex").slice(0, 16)}`;
        relay.devices.set(deviceId, {
          deviceId,
          accountId: ACCOUNT_ID,
          kind: (b.kind as "desktop" | "mobile" | "web") ?? "web",
          name: (b.name ?? "device").slice(0, 64),
          signPub: b.signPub,
          dhPub: b.dhPub,
        });
        console.log(`[portal-double] claim ${deviceId} (${b.kind}), relay devices: ${relay.devices.size}`);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ deviceId, accountId: ACCOUNT_ID }));
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "bad json" }));
      }
    });
    return;
  }
 // ── SSO: GET /authorize → auto-accept (302 ke redirect_uri?code&state)
  if (req.method === "GET" && url.pathname === "/authorize") {
    const q = url.searchParams;
    const redirectUri = q.get("redirect_uri") ?? "";
    const state = q.get("state") ?? "";
    const challenge = q.get("code_challenge") ?? "";
    const method = q.get("code_challenge_method") ?? "";
    if (!redirectUri.startsWith("http") || state.length < 8 || !challenge || method !== "S256" || q.get("client") !== "yuika-web") {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid authorize request" }));
      return;
    }
    const code = `oc_${randomBytes(16).toString("base64url")}`;
    oauthCodes.set(code, { challenge, redirectUri });
    const back = new URL(redirectUri);
    back.searchParams.set("code", code);
    back.searchParams.set("state", state);
    console.log(`[portal-double] sso authorize → ${back.origin}${back.pathname}`);
    res.writeHead(302, { location: back.toString() });
    res.end();
    return;
  }
 // ── SSO: POST /api/oauth/token (server-to-server; PKCE + single-use)
  if (req.method === "POST" && url.pathname === "/api/oauth/token") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const bad = (error: string, status = 400) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify({ error }));
      };
      let b: { code?: string; code_verifier?: string; redirect_uri?: string };
      try {
        b = JSON.parse(body || "{}") as typeof b;
      } catch {
        return bad("bad json");
      }
      const rec = b.code ? oauthCodes.get(b.code) : undefined;
      oauthCodes.delete(b.code ?? ""); // sekali pakai (juga utk gagal, anti brute)
      if (!rec) return bad("code not found or already used", 401);
      const expect = createHash("sha256").update(String(b.code_verifier ?? "")).digest("base64url");
      if (expect !== rec.challenge) return bad("pkce verifier mismatch", 401);
      if (b.redirect_uri !== rec.redirectUri) return bad("redirect_uri mismatch", 401);
      res.writeHead(200, { "content-type": "application/json" });
 // double: deviceToken sekali-pakai (kind web) utk auto-link browser
 //kontrak sama dgn portal nyata setelah diterima.
      res.end(
        JSON.stringify({
          accountId: ACCOUNT_ID,
          email: SSO_EMAIL,
          deviceToken: `tok_sso_web_${randomBytes(12).toString("hex")}`,
        }),
      );
    });
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(CLAIM_PORT, "127.0.0.1", () => {
  console.log(`[portal-double] claim stub :${CLAIM_PORT} · spec relay ws://127.0.0.1:${RELAY_PORT}`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    server.close();
    void relay.close().finally(() => process.exit(0));
  });
}
