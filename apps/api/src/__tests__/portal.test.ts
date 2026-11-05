// P1-PRT-3 — host worker portal: dispatch RemoteAction → runtime (fake) dan
// proyeksi YuiEvent → RemoteEvent (seq + ring resume), lewat SpecRelay nyata
// + koneksi SDK nyata (sama seperti produksi, runtime saja dipalsukan).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { YuiRuntime, } from "@yuika/core";
import type { YuiEvent } from "@yuika/contracts";
import { generateDeviceKeys } from "@yuika/crypto";
import { RelayClient, RelayRemote } from "@yuika/relay-client";
import { nodeSocket } from "@yuika/relay-client/node";
import { createSpecRelay } from "@yuika/relay-client/testing";
import { PortalHostService } from "../portal/service.js";
import type { HostDeviceRecord } from "../portal/store.js";
import { _resetPortalStoreForTests, getHostDevice, saveHostDevice } from "../portal/store.js";

const ACC = "acc_test00000000009";

/** Runtime palsu: bus sederhana + pesan tersimpan + turn yang memancar delta. */
function fakeRuntime() {
  const listeners = new Map<string, Array<(e: YuiEvent) => void>>();
  const allListeners: Array<(e: YuiEvent) => void> = [];
  const messages = new Map<string, Array<{ role: string; content: string }>>();
  const sessions = new Map<string, { personaId: string }>();
  let eventSeq = 0;
  const emit = (sessionId: string, draft: Omit<YuiEvent, "id" | "ts" | "sessionId">) => {
    const e = { ...(draft as object), id: ++eventSeq, ts: Date.now(), sessionId } as YuiEvent;
    for (const l of listeners.get(sessionId) ?? []) l(e);
    for (const l of [...allListeners]) l(e);
  };
  return {
    emit,
    createSession: (personaId: string) => {
      const id = `s_${Math.random().toString(36).slice(2, 10)}`;
      sessions.set(id, { personaId });
      return { sessionId: id, persona: { id: personaId }, projectId: null };
    },
    listRecentSessions: (limit = 20) =>
      [...sessions.entries()].slice(0, limit).map(([sessionId, s]) => ({
        sessionId, title: "t", personaId: s.personaId, updatedAt: 1,
      })),
    runTurn: async (sessionId: string, text: string) => {
      messages.get(sessionId)?.push({ role: "user", content: text });
      emit(sessionId, { type: "message.delta", turnId: "t1", delta: `echo:${text}` } as YuiEvent);
      emit(sessionId, { type: "message.done", turnId: "t1" } as YuiEvent);
      messages.get(sessionId)?.push({ role: "assistant", content: `echo:${text}` });
    },
    subscribeAll: (l: (e: YuiEvent) => void) => { const h = (e: YuiEvent) => l(e); allListeners.push(h); return () => { const i = allListeners.indexOf(h); if (i >= 0) allListeners.splice(i, 1); }; },
    subscribe: (sessionId: string, l: (e: YuiEvent) => void) => {
      const arr = listeners.get(sessionId) ?? [];
      arr.push(l);
      listeners.set(sessionId, arr);
      return () => listeners.set(sessionId, (listeners.get(sessionId) ?? []).filter((x) => x !== l));
    },
    store: {
      getMessages: (sessionId: string) => (messages.get(sessionId) ?? []).map((m) => ({
        role: m.role as "user" | "assistant" | "tool", content: m.content,
      })),
    },
    steerDelegation: () => false,
    cancelTurn: () => true,
    resolveApproval: (id: string) => id === "ap_ok",
    emitSessionError: (sessionId: string, message: string) =>
      emit(sessionId, { type: "session.error", message, recoverable: false } as YuiEvent),
  } as unknown as YuiRuntime & { emit: typeof emit };
}

let relay: ReturnType<typeof createSpecRelay>;
let svc: PortalHostService;
let remote: RelayRemote;
let rc: RelayClient;
const hostKeys = generateDeviceKeys();
const remoteKeys = generateDeviceKeys();
const events: import("@yuika/contracts").RemoteEvent[] = [];

beforeAll(async () => {
  process.env.YUI_PORTAL_DEVICE_DB = "e2e/.tmp/portal-device-unit.db";
  relay = createSpecRelay({
    devices: [
      { deviceId: hostKeys.deviceId, accountId: ACC, kind: "desktop", name: "Yuika host", signPub: hostKeys.signPub, dhPub: hostKeys.dhPub },
      { deviceId: remoteKeys.deviceId, accountId: ACC, kind: "web", name: "Dev remote", signPub: remoteKeys.signPub, dhPub: remoteKeys.dhPub },
    ],
  });
  await new Promise((r) => setTimeout(r, 300));
  const rt = fakeRuntime();
  (globalThis as unknown as { __rt?: YuiRuntime }).__rt = rt;
  svc = new PortalHostService();
  await svc.start(rt, {
    deviceId: hostKeys.deviceId, accountId: ACC, kind: "desktop", name: "Yuika host",
    signPriv: hostKeys.signPriv, signPub: hostKeys.signPub,
    dhPriv: hostKeys.dhPriv, dhPub: hostKeys.dhPub,
    portalUrl: "http://localhost:3100", relayUrl: relay.url(), linkedAt: Date.now(),
  });

  rc = new RelayClient({
    url: relay.url(), deviceId: remoteKeys.deviceId, signPriv: remoteKeys.signPriv,
    crypto: {
      signChallenge: async (p, d, n) => (await import("@yuika/crypto")).signChallenge(p, d, n),
      seal: async (f, t, pt) => (await import("@yuika/crypto")).seal(f, t, pt),
      open: async (t, f, b) => (await import("@yuika/crypto")).open(t, f, b).toString("utf8"),
    },
    socketFactory: nodeSocket,
  });
  await rc.connect();
  remote = new RelayRemote({
    client: rc, deviceId: remoteKeys.deviceId, dhPriv: remoteKeys.dhPriv, dhPub: remoteKeys.dhPub,
    onEvent: (ev) => events.push(ev),
  });
  await remote.join(hostKeys.deviceId);
});

afterAll(async () => {
  rc?.close();
  await svc?.stop();
  await relay?.close();
  _resetPortalStoreForTests();
});

async function waitUntil(cond: () => boolean, ms = 4_000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("waitUntil timeout");
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("portal host worker", () => {
  it("status: linked + remote terlihat", async () => {
    await waitUntil(() => svc.status().remotes.length === 1);
    const st = svc.status();
    expect(st).toMatchObject({ linked: true, accountId: ACC, relayState: "authed" });
    expect(st.remotes[0]).toMatchObject({ deviceId: remoteKeys.deviceId, kind: "web" });
  });

  it("ping_host → pong_host (rid)", async () => {
    await remote.sendAction({ proto: 1, act: "ping_host", rid: "r-ping" });
    await waitUntil(() => events.some((e) => e.ev === "pong_host"));
    expect(events.find((e) => e.ev === "pong_host")).toMatchObject({ rid: "r-ping" });
  });

  it("send_prompt sesi baru → snapshot{rid, sessionId asli} + delta + done (seq naik)", async () => {
    await remote.sendAction({
      proto: 1, act: "send_prompt", rid: "r-1", sessionId: "new", personaId: "yui-scholar",
      message: "halo host",
    });
    await waitUntil(() => events.some((e) => e.ev === "message.done"));
    const snap = events.find((e) => e.ev === "session.snapshot")!;
    expect(snap).toMatchObject({ rid: "r-1" });
    expect(snap.sessionId).toMatch(/^s_/);
    const deltas = events.filter((e) => e.ev === "message.delta");
    expect(deltas.at(-1)).toMatchObject({ sessionId: snap.sessionId, delta: "echo:halo host", seq: 1 });
    expect(events.find((e) => e.ev === "message.done")).toMatchObject({ finish: "stop", seq: 2 });
  });

  it("subscribe{sinceSeq} → snapshot + replay ring delta yang terlewat", async () => {
    const sid = (events.find((e) => e.ev === "session.snapshot") as { sessionId: string }).sessionId;
    events.length = 0;
    await remote.sendAction({ proto: 1, act: "subscribe", rid: "r-2", sessions: [sid], sinceSeq: { [sid]: 1 } });
    await waitUntil(() => events.some((e) => e.ev === "message.done"));
    // replay: hanya seq 2 (done) — seq 1 (delta) sudah diterima remote
    expect(events.filter((e) => e.ev === "message.delta")).toHaveLength(0);
    expect(events.some((e) => e.ev === "message.done" && e.seq === 2)).toBe(true);
    // snapshot ikut terkirim (render cepat)
    expect(events.some((e) => e.ev === "session.snapshot" && e.sessionId === sid)).toBe(true);
  });

  it("approve id salah → error unknown_approval (rid)", async () => {
    await remote.sendAction({ proto: 1, act: "approve", rid: "r-3", approvalId: "ap_nope" });
    await waitUntil(() => events.some((e) => e.ev === "error" && e.code === "unknown_approval"));
    expect(events.find((e) => e.ev === "error")).toMatchObject({ rid: "r-3" });
  });

  it("approval.requested di bus → semua remote (tanpa subscribe sesi itu)", async () => {
    const rt = (globalThis as unknown as { __rt: ReturnType<typeof fakeRuntime> }).__rt;
    rt.emit("s_x", { type: "approval.requested", requestId: "ap_1", tool: "run_command", args: { cmd: "npm i" }, reason: "perintah berisiko" } as unknown as YuiEvent);
    await waitUntil(() => events.some((e) => e.ev === "approval.request"));
    expect(events.find((e) => e.ev === "approval.request")).toMatchObject({
      approvalId: "ap_1", title: "run_command", risk: "high",
    });
  });
});

describe("portal device store", () => {
  it("save/get/clear roundtrip (singleton row)", () => {
    _resetPortalStoreForTests();
    for (const f of ["portal-device-unit.db","portal-device-unit.db-wal","portal-device-unit.shm"]) {
      try { fs.rmSync(path.join("e2e/.tmp", f), { force: true }); } catch { /* WAL lock race di Windows */ }
    }
    _resetPortalStoreForTests();
    expect(getHostDevice()).toBeNull();
    saveHostDevice({
      deviceId: "dev_x", accountId: "acc_y", kind: "desktop", name: "n",
      signPriv: "p1", signPub: "p2", dhPriv: "p3", dhPub: "p4",
      portalUrl: "http://p", relayUrl: "ws://r", linkedAt: 1,
    });
    expect(getHostDevice()).toMatchObject({ deviceId: "dev_x", accountId: "acc_y" });
    saveHostDevice({
      deviceId: "dev_z", accountId: "acc_y", kind: "desktop", name: "n",
      signPriv: "p1", signPub: "p2", dhPriv: "p3", dhPub: "p4",
      portalUrl: "http://p", relayUrl: "ws://r", linkedAt: 2,
    });
    expect(getHostDevice()?.deviceId).toBe("dev_z");
  });
});
