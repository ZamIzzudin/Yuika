// CP-5 — unlink device dari portal: relay putus semua conn device itu dgn
// bye 4001 (UNKNOWN_DEVICE) → sisi Yuika harus bereaksi permanen:
//   - HOST device  : worker berhenti, row host_device dihapus, status note
//                    "unlinked" (UI menampilkan "pairing ulang", bukan error
//                    jaringan generik).
//   - WEB device   : presence berhenti, row web_device dihapus, SEMUA sesi
//                    web milik portal account itu dicabut (login berikutnya
//                    auto-link ulang via deviceToken — CP-4).
// Pakai SpecRelay (packages/relay-client/src/testing.ts) + hook unlink().
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "yui-api-unlink-"));
process.env.YUI_AUTH_DB = path.join(TMP, "auth.db");
process.env.YUI_PORTAL_DEVICE_DB = path.join(TMP, "portal-device.db");
process.env.YUI_RELAY_URL = ""; // record membawa relayUrl sendiri (relay double)

const { generateDeviceKeys } = await import("@yuika/crypto");
const { createSpecRelay } = await import("@yuika/relay-client/testing");
const { getHostDevice, getWebDevice, saveHostDevice, saveWebDevice, _resetPortalStoreForTests } = await import(
  "../portal/store.js"
);
const { getPortalHost } = await import("../portal/service.js");
const { getWebPresence } = await import("../portal/web-presence.js");
const { createSession, findOrCreatePortalUser, validateToken, _resetAuthForTests } = await import("../auth/store.js");

const ACC = "acc_unlink_00000001";
const hostKeys = generateDeviceKeys();
const webKeys = generateDeviceKeys();
let relay: ReturnType<typeof createSpecRelay>;

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
  await getWebPresence().stop();
  await getPortalHost().stop();
  await relay.close();
  _resetAuthForTests();
  _resetPortalStoreForTests();
  delete process.env.YUI_AUTH_DB;
  delete process.env.YUI_PORTAL_DEVICE_DB;
  delete process.env.YUI_RELAY_URL;
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("CP-5 — host device di-unlink (bye 4001)", () => {
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

describe("CP-5 — web device di-unlink (bye 4001)", () => {
  it("presence berhenti, row web_device terhapus, sesi web dicabut", async () => {
    // sesi web milik portal account (ibarat hasil SSO CP-4)
    const user = findOrCreatePortalUser(ACC, "unlink@yuika.test");
    const token = createSession(user.id);
    expect(validateToken(token)?.id).toBe(user.id);

    const rec = { ...record(webKeys, "web"), relayUrl: relay.url() };
    saveWebDevice(rec);
    await getWebPresence().start(rec);
    await waitUntil(() => getWebPresence().status().state === "authed");

    relay.unlink(webKeys.deviceId); // → bye 4001 → unlink permanen
    await waitUntil(() => getWebDevice() === null);
    await waitUntil(() => !getWebPresence().running);
    // sesi dicabut: token tidak valid lagi (harus login ulang → auto-link CP-4)
    expect(validateToken(token)).toBeNull();
  });
});

describe("CP-5 — guard: 4001 di auth PERTAMA bukan unlink", () => {
  it("relay tak mengenal device → presence stop diam: row & sesi UTUH", async () => {
    // device #2: ada row + sesi, tapi TIDAK terdaftar di registry relay
    const user = findOrCreatePortalUser(ACC, "unlink@yuika.test");
    const token = createSession(user.id);
    const k2 = generateDeviceKeys();
    const rec2 = { ...record(k2, "web"), relayUrl: relay.url() };
    saveWebDevice(rec2);

    await getWebPresence().start(rec2); // connect() → auth → bye 4001 (unknown)
    await waitUntil(() => !getWebPresence().running);
    // bukan unlink: row tetap, sesi tetap valid
    expect(getWebDevice()?.deviceId).toBe(k2.deviceId);
    expect(validateToken(token)?.id).toBe(user.id);
  });
});
