// P1-PRT-6 — double e2e: claim stub (pengganti portal web) + SpecRelay
// (pengganti relay produksi yuika-portal). Menjalankan SEMANTIK SPEC-PROTOCOL
// v1 yang sama; live verification vs relay asli menyusul "PORTAL READY FOR
// INTEGRATION" (lihat docs/portal/README.md).
// Claim stub: token APA PUN ≥20 char diterima (single-account e2e); deviceId
// deterministik dari signPub → host & remote dapat id stabil per kunci.
import http from "node:http";
import { createHash } from "node:crypto";
import { createSpecRelay } from "@yuika/relay-client/testing";

const CLAIM_PORT = Number(process.env.PORTAL_DOUBLE_PORT ?? 3110);
const RELAY_PORT = Number(process.env.PORTAL_DOUBLE_RELAY_PORT ?? 3111);
const ACCOUNT_ID = "acc_e2edouble0000001";

const relay = createSpecRelay({ devices: [], port: RELAY_PORT });
relay.port(); // pastikan listening

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
        console.log(`[portal-double] claim ${deviceId} (${b.kind}) — relay devices: ${relay.devices.size}`);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ deviceId, accountId: ACCOUNT_ID }));
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "bad json" }));
      }
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
