// P1-PRT-6 — LIVE cross-repo smoke: SDK Yuika (@yuika/relay-client + crypto)
// melawan RELAY PRODUKSI yuika-portal (apps/relay hasil T1/P1-PRT-5) + claim
// nyata (lib portal: issuePairingToken → claimPairingToken — bukan stub).
// Menjalankan verifikasi kompatibilitas wire dua repo DI ATAS KODE NYATA,
// di luar gerbang playwright (yang memakai SpecRelay double).
//
// Jalankan manual (butuh sibling repo d:/projects/yuika-portal ter-clone):
//   npx tsx scripts/live-portal-smoke.mts
//
// Lapisan yang dibuktikan: handshake sig (Ed25519), register_host, join
// dhPub (X25519), data envelope E2E dua arah (seal/open @yuika/crypto vs
// relay buta), sticky host_offline/host_back.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORTAL = "D:/projects/yuika-portal";
process.env.PORTAL_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "yui-live-")), "portal.db");
process.env.RELAY_STICKY_MS = "1500";

// ── seed portal.db via lib ASLI portal (schema + akun + claim) ─────────────
const { portalDb } = await import(`file://${PORTAL}/apps/web/src/lib/db.ts`);
portalDb(); // buat schema
const { createAccount } = await import(`file://${PORTAL}/apps/web/src/lib/auth.ts`);
const { issuePairingToken, claimPairingToken } = await import(`file://${PORTAL}/apps/web/src/lib/pairing.ts`);

const acc = createAccount(`live-${Date.now()}@yuika.test`, "pw-live-smoke-123");
const tHost = issuePairingToken(acc.id, "desktop");
const tRemote = issuePairingToken(acc.id, "web");

// ── device keys via crypto Yuika (backend node — byte-exact portal) ───────
const { generateDeviceKeys } = await import("@yuika/crypto");
const hostKeys = generateDeviceKeys();
const remoteKeys = generateDeviceKeys();
const hostClaim = claimPairingToken({ token: tHost.token, kind: "desktop", name: "Live host", signPub: hostKeys.signPub, dhPub: hostKeys.dhPub });
const remoteClaim = claimPairingToken({ token: tRemote.token, kind: "web", name: "Live remote", signPub: remoteKeys.signPub, dhPub: remoteKeys.dhPub });
if (!("deviceId" in hostClaim) || !("deviceId" in remoteClaim)) throw new Error(`claim gagal: ${JSON.stringify({ hostClaim, remoteClaim })}`);
console.log(`[live] claim host=${hostClaim.deviceId} remote=${remoteClaim.deviceId} akun=${acc.id}`);

// ── relay PRODUKSI portal (createRelayServer asli, port acak) ─────────────
const { createRelayServer } = await import(`file://${PORTAL}/apps/relay/src/server.ts`);
const relay = await createRelayServer({ port: 0, dbPath: process.env.PORTAL_DB });
const relayPort = relay.port();
console.log(`[live] relay produksi portal di ws://127.0.0.1:${relayPort}`);

// ── klien Yuika: host + remote via SDK ────────────────────────────────────
const { RelayClient, RelayHost, RelayRemote } = await import("@yuika/relay-client");
const { nodeSocket } = await import("@yuika/relay-client/node");
const { seal, open, signChallenge } = await import("@yuika/crypto");
const url = `ws://127.0.0.1:${relayPort}`;
const crypto = {
  signChallenge: async (p: string, d: string, n: string) => signChallenge(p, d, n),
  seal: async (f: { deviceId: string; dhPriv: string }, t: { deviceId: string; dhPub: string }, pt: string) => seal(f, t, pt),
  open: async (t: { deviceId: string; dhPriv: string }, f: { deviceId: string; dhPub: string }, b: string) => open(t, f, b).toString("utf8"),
};
const mk = (keys: ReturnType<typeof generateDeviceKeys>, deviceId: string, backoff?: { minMs?: number; maxMs?: number }) =>
  new RelayClient({ url, deviceId, signPriv: keys.signPriv, crypto, socketFactory: nodeSocket, ...(backoff ? { backoff } : {}) });

let pass = 0;
const ok = (name: string, cond: boolean) => {
  if (!cond) throw new Error(`LIVE FAIL: ${name}`);
  pass++;
  console.log(`[live] ✓ ${name}`);
};

// 1) handshake + register host — identitas = deviceId HASIL CLAIM (bukan id
//    lokal generateDeviceKeys: kunci PEM sama, id-nya dari portal).
const hc = mk(hostKeys, hostClaim.deviceId, { minMs: 1_000, maxMs: 1_100 }); // window offline terlihat jelas
const accountId = await hc.connect();
ok("auth_ok (sig Ed25519 diverifikasi relay produksi)", accountId === acc.id);
const actions: string[] = [];
const host = new RelayHost({
  client: hc, deviceId: hostClaim.deviceId, dhPriv: hostKeys.dhPriv,
  onAction: (_f, a) => actions.push(a.act),
});
ok("host_ready (register_host relay produksi)", (await host.register()) === hostClaim.deviceId);

// 2) remote join (dhPub X25519)
const rc = mk(remoteKeys, remoteClaim.deviceId);
await rc.connect();
const events: string[] = [];
const states: string[] = [];
const remote = new RelayRemote({
  client: rc, deviceId: remoteClaim.deviceId, dhPriv: remoteKeys.dhPriv, dhPub: remoteKeys.dhPub,
  onEvent: (ev) => events.push(ev.ev),
  onHostState: (s) => states.push(s),
});
const joined = await remote.join(hostClaim.deviceId);
ok("joined (hostDhPub dari relay)", joined.hostDhPub === hostKeys.dhPub);
await new Promise((r) => setTimeout(r, 200));
ok("host menerima remote_joined", host.remotes.size === 1);

// 3) action E2E remote → host
await remote.sendAction({ proto: 1, act: "send_prompt", rid: "live-1", sessionId: "new", personaId: "yui-coder", message: "live smoke" });
await new Promise((r) => setTimeout(r, 500));
ok("action E2E diterima host (envelope dibuka relay buta)", actions.includes("send_prompt"));

// 4) event E2E host → remote
await host.sendEvent("all", { proto: 1, ev: "message.delta", sessionId: "s-live", seq: 1, delta: "live delta" });
await new Promise((r) => setTimeout(r, 500));
ok("event E2E diterima remote", events.includes("message.delta"));

// 5) sticky host_offline/host_back (relay produksi, RELAY_STICKY_MS=1500)
const rawWs = (hc as unknown as { ws: { close(): void } }).ws;
rawWs?.close();
const t0 = Date.now();
while (!states.includes("host-offline") && Date.now() - t0 < 4_000) await new Promise((r) => setTimeout(r, 50));
ok("remote diberi tahu host_offline (sticky)", states.includes("host-offline"));
// host SDK reconnect (backoff 1 dtk) dalam window 1.5 dtk → host_back
const t1 = Date.now();
while (remote.state !== "joined" && Date.now() - t1 < 8_000) await new Promise((r) => setTimeout(r, 100));
ok("host_back dalam sticky window + re-register", remote.state === "joined");

hc.close();
rc.close();
await relay.close();
console.log(`\nLIVE PORTAL SMOKE PASS — ${pass} langkah hijau (SDK Yuika ↔ relay produksi yuika-portal)`);
process.exit(0);
