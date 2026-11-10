// unlink device dari portal: relay putus semua conn device itu dgn
// bye 4001 (UNKNOWN_DEVICE) → sisi Yuika bereaksi permanen:
//   - HOST device pairing manual: worker berhenti, row host_device dihapus,
//     status note "unlinked" (UI menampilkan "pairing ulang", bukan error
//     jaringan generik).
//   - DEVICE WEB (SSO, kini = host service penuh): worker berhenti, row
//     web_device dihapus, SEMUA sesi web milik portal account itu dicabut
//     (login berikutnya auto-link ulang via deviceToken).
//   - Guard: 4001 pada auth PERTAMA (relay tak mengenal device) ≠ unlink.
// Pakai SpecRelay (packages/relay-client/src/testing.ts) + hook unlink().
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "yui-api-unlink-"));
process.env.YUI_AUTH_DB = path.join(TMP, "auth.db");
process.env.YUI_PORTAL_DEVICE_DB = path.join(TMP, "portal-device.db");
process.env.YUI_RELAY_URL = ""; // record membawa relayUrl sendiri (relay double)

const { generateDeviceKeys, verifyChallenge } = await import("@yuika/crypto");
const { createSpecRelay } = await import("@yuika/relay-client/testing");
const { getHostDevice, getWebDevice, saveHostDevice, saveWebDevice, _resetPortalStoreForTests } = await import(
  "../portal/store.js"
);
const { getPortalHost } = await import("../portal/service.js");
const { createSession, findOrCreatePortalUser, validateToken, _resetAuthForTests } = await import("../auth/store.js");

const ACC = "acc_unlink_00000001";
const hostKeys = generateDeviceKeys();
const webKeys = generateDeviceKeys();
let relay: ReturnType<typeof createSpecRelay>;
let portalSrv: http.Server | null = null;

const record = (k: ReturnType<typeof generateDeviceKeys>, kind: "desktop" | "web") => ({
  deviceId: k.deviceId,
  accountId: ACC,
  kind,
  name: kind === "web" ? "Yuika web (SSO)" : "Yuika host",
  signPriv: k.signPriv,
  signPub: k.signPub,
  dhPriv: k.dhPriv,
  dhPub: k.dhPub,
  portalUrl: "http://127.0.0.1:9",
  relayUrl: "", // diisi setelah relay listen
  linkedAt: Date.now(),
});

async function waitUntil(fn: () => boolean, ms = 5_000, step = 50): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error("waitUntil timeout");
    await new Promise((r) => setTimeout(r, step));
  }
}

const fakeRt = {
  subscribeAll: () => () => {},
  listRecentSessions: () => [],
} as unknown as import("@yuika/core").YuiRuntime;

beforeAll(async () => {
  relay = createSpecRelay({
    devices: [
      { deviceId: hostKeys.deviceId, accountId: ACC, kind: "desktop", name: "Yuika host", signPub: hostKeys.signPub, dhPub: hostKeys.dhPub },
      { deviceId: webKeys.deviceId, accountId: ACC, kind: "web", name: "Yuika web (SSO)", signPub: webKeys.signPub, dhPub: webKeys.dhPub },
    ],
  });
  await new Promise((r) => setTimeout(r, 300));
});

afterAll(async () => {
  await getPortalHost().stop();
  await relay.close();
  if (portalSrv) await new Promise<void>((r) => portalSrv!.close(() => r()));
  _resetAuthForTests();
  _resetPortalStoreForTests();
  delete process.env.YUI_AUTH_DB;
  delete process.env.YUI_PORTAL_DEVICE_DB;
  delete process.env.YUI_RELAY_URL;
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("host device unlinked (bye 4001)", () => {
  it("worker berhenti, row host_device terhapus, status note=unlinked", async () => {
    const rec = { ...record(hostKeys, "desktop"), relayUrl: relay.url() };
    saveHostDevice(rec);
    await getPortalHost().start(fakeRt, rec);
    expect(getHostDevice()).not.toBeNull();

    relay.unlink(hostKeys.deviceId); // user klik Unlink di halaman Devices portal
    await waitUntil(() => getHostDevice() === null);
    await waitUntil(() => !getPortalHost().running);
    const st = getPortalHost().status();
    expect(st.linked).toBe(false);
    expect(st.note).toBe("unlinked");
  });
});

describe("web device (SSO) unlinked (bye 4001)", () => {
  it("host service berhenti, row web_device terhapus, sesi web dicabut", async () => {
 // sesi web milik portal account (ibarat hasil SSO )
    const user = findOrCreatePortalUser(ACC, "unlink@yuika.test");
    const token = createSession(user.id);
    expect(validateToken(token)?.id).toBe(user.id);

    const rec = { ...record(webKeys, "web"), relayUrl: relay.url() };
    saveWebDevice(rec);
    await getPortalHost().start(fakeRt, rec);
    await waitUntil(() => getPortalHost().running);

    relay.unlink(webKeys.deviceId); // → bye 4001 → unlink permanen
    await waitUntil(() => getWebDevice() === null);
    await waitUntil(() => !getPortalHost().running);
 // sesi dicabut: token tidak valid lagi (harus login ulang → auto-link )
    expect(validateToken(token)).toBeNull();
  });
});

describe("guard: 4001 on the FIRST auth is not an unlink", () => {
  it("relay tak mengenal device → host stop diam: row & sesi UTUH", async () => {
    // device #2: ada row + sesi, tapi TIDAK terdaftar di registry relay
    const user = findOrCreatePortalUser(ACC, "unlink@yuika.test");
    const token = createSession(user.id);
    const k2 = generateDeviceKeys();
    const rec2 = { ...record(k2, "web"), relayUrl: relay.url() };
    saveWebDevice(rec2);

    await getPortalHost().start(fakeRt, rec2).catch(() => undefined); // connect() → auth → bye 4001 (unknown)
    await waitUntil(() => !getPortalHost().running);
    // bukan unlink: row tetap, sesi tetap valid
    expect(getWebDevice()?.deviceId).toBe(k2.deviceId);
    expect(validateToken(token)?.id).toBe(user.id);
  });
});

describe("sign-out symmetry (D74): logout → device melepas dirinya di portal", () => {
  it("logout memanggil /api/devices/unlink-self utk host+web device, stop service, kunci lokal dipertahankan", async () => {
    // Fake portal HTTP: catat & verifikasi signature persis route asli.
    // Device FRESH: registry relay double sudah menghapus host/web keys di
    // suite sebelumnya (suite #1/#2 memang memanggil relay.unlink).
    const kHost = generateDeviceKeys();
    const kWeb = generateDeviceKeys();
    const pubByDevice = new Map([
      [kHost.deviceId, kHost.signPub],
      [kWeb.deviceId, kWeb.signPub],
    ]);
    const seen: Array<string> = [];
    portalSrv = http.createServer((req, res) => {
      let buf = "";
      req.on("data", (c: Buffer) => (buf += c));
      req.on("end", () => {
        const b = JSON.parse(buf) as { deviceId: string; nonce: string; sig: string };
        const pub = pubByDevice.get(b.deviceId);
        const ok = pub ? verifyChallenge(pub, b.deviceId, b.nonce, b.sig) : false;
        seen.push(ok ? `${b.deviceId}:ok` : `${b.deviceId}:badsig`);
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"ok":true}');
      });
    });
    await new Promise<void>((r) => portalSrv!.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(portalSrv.address() as { port: number }).port}`;

    // Rows device menunjuk fake portal; host service hidup via web record.
    relay.devices.set(kWeb.deviceId, {
      deviceId: kWeb.deviceId,
      accountId: ACC,
      kind: "web",
      name: "Yuika web (SSO)",
      signPub: kWeb.signPub,
      dhPub: kWeb.dhPub,
    });
    saveHostDevice({ ...record(kHost, "desktop"), portalUrl: base, relayUrl: relay.url() });
    saveWebDevice({ ...record(kWeb, "web"), portalUrl: base, relayUrl: relay.url() });
    await getPortalHost().start(fakeRt, getWebDevice()!);
    await waitUntil(() => getPortalHost().running);

    const { buildApp } = await import("../app.js");
    const app = buildApp(fakeRt);
    const r = await app.inject({ method: "POST", url: "/api/auth/logout" });
    expect(r.statusCode).toBe(200);
    expect((r.json() as { ok: boolean }).ok).toBe(true);

    // kedua device di-unlink dengan signature VALID
    expect(seen.sort()).toEqual([`${kHost.deviceId}:ok`, `${kWeb.deviceId}:ok`].sort());
    // host service berhenti
    await waitUntil(() => !getPortalHost().running);
    // kunci TETAP tersimpan: login berikutnya re-claim deviceId stabil
    expect(getWebDevice()?.deviceId).toBe(kWeb.deviceId);
    expect(getHostDevice()?.deviceId).toBe(kHost.deviceId);
  });
});
