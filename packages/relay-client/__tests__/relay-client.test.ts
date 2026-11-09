// SDK relay-client terhadap SpecRelay (double spec v1).
// Skenario SPEC-PROTOCOL §11 butir 1–7 yang bisa diuji di lapisan klien
// (butir 8 = suite vectors @yuika/crypto; butir 9 = REST claim, di apps/api).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateDeviceKeys, type DeviceKeys } from "@yuika/crypto";
import { RelayClient } from "../src/core.js";
import { RelayHost } from "../src/host.js";
import { RelayRemote } from "../src/remote.js";
import { nodeSocket } from "../src/node.js";
import { createSpecRelay } from "../src/testing.js";
import { ByeCode, type ByeMsg } from "../src/wire.js";

const ACC_A = "acc_aaaa000000000001";
const ACC_B = "acc_bbbb000000000002";

let relay: ReturnType<typeof createSpecRelay>;
let url: string;
const host = generateDeviceKeys();
const r1 = generateDeviceKeys();
const r2 = generateDeviceKeys();
const other = generateDeviceKeys(); // akun B
const actions: Array<{ from: string; act: string }> = []; // lintas describe

beforeAll(async () => {
  relay = createSpecRelay({
    devices: [
      { deviceId: host.deviceId, accountId: ACC_A, kind: "web", name: "Web host (self-host)", signPub: host.signPub, dhPub: host.dhPub },
      { deviceId: r1.deviceId, accountId: ACC_A, kind: "mobile", name: "Phone", signPub: r1.signPub, dhPub: r1.dhPub },
      { deviceId: r2.deviceId, accountId: ACC_A, kind: "web", name: "Laptop browser", signPub: r2.signPub, dhPub: r2.dhPub },
      { deviceId: other.deviceId, accountId: ACC_B, kind: "mobile", name: "Stranger", signPub: other.signPub, dhPub: other.dhPub },
    ],
    stickyMs: 4_000,
  });
  await new Promise((r) => setTimeout(r, 300)); // ws server listen di konstruksi
  url = relay.url();
});

afterAll(async () => {
  await relay.close();
});

function makeClient(keys: DeviceKeys, urlOverride?: string): RelayClient {
  return new RelayClient({
    url: urlOverride ?? url,
    deviceId: keys.deviceId,
    signPriv: keys.signPriv,
    crypto: {
      signChallenge: async (p, d, n) => (await import("@yuika/crypto")).signChallenge(p, d, n),
      seal: async (f, t, pt) => (await import("@yuika/crypto")).seal(f, t, pt),
      open: async (t, f, b) => (await import("@yuika/crypto")).open(t, f, b).toString("utf8"),
    },
    socketFactory: nodeSocket,
    backoff: { minMs: 50, maxMs: 400 },
  });
}

async function waitFor<T>(fn: () => T | undefined, ms = 4_000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v !== undefined && v !== false) return v;
    if (Date.now() - t0 > ms) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("watchdog half-open (zombie socket)", () => {
  it("relay diam tanpa close → putus paksa + reconnect + auth ulang", async () => {
    const dev = generateDeviceKeys();
    const r = createSpecRelay({
      devices: [{ deviceId: dev.deviceId, accountId: ACC_A, kind: "web", name: "Zombie test", signPub: dev.signPub, dhPub: dev.dhPub }],
      stickyMs: 1_000,
    });
    await new Promise((res) => setTimeout(res, 250));

    // Simulasi half-open: setelah cut, event socket asli tidak pernah
    // diteruskan (proxy hangus — FIN tidak pernah sampai) dan perintah
    // klien jadi noop; watchdog harus mendeteksi keheningan itu. Flag mati
    // PER-SOCKET — socket reconnect berikutnya hidup normal.
    const inners: Array<{ kill: () => void; close: () => void }> = [];
    let sockets = 0;
    const factory = (u: string) => {
      sockets++;
      let dead = false;
      const inner = nodeSocket(u);
      const like = {
        send: (d: string) => !dead && inner.send(d),
        close: (c?: number, reason?: string) => !dead && inner.close(c, reason),
        ping: () => !dead && inner.ping?.(),
        terminate: () => !dead && inner.terminate?.(),
        onopen: null as (() => void) | null,
        onmessage: null as ((ev: { data: unknown }) => void) | null,
        onclose: null as ((ev: { code?: number; reason?: string }) => void) | null,
        onerror: null as ((err: unknown) => void) | null,
        onpong: null as (() => void) | null,
      };
      inners.push({
        kill: () => {
          dead = true;
          try {
            inner.terminate();
          } catch {
            /* sudah mati */
          }
        },
        close: () => inner.close(1000, "cleanup"),
      });
      inner.onopen = () => !dead && like.onopen?.();
      inner.onmessage = (ev) => !dead && like.onmessage?.(ev);
      inner.onclose = (ev) => !dead && like.onclose?.(ev);
      inner.onerror = (e) => !dead && like.onerror?.(e);
      inner.onpong = () => !dead && like.onpong?.();
      return like;
    };

    let authOk = 0;
    const c = new RelayClient(
      {
        url: r.url(),
        deviceId: dev.deviceId,
        signPriv: dev.signPriv,
        crypto: {
          signChallenge: async (p, d, n) => (await import("@yuika/crypto")).signChallenge(p, d, n),
          seal: async (f, t, pt) => (await import("@yuika/crypto")).seal(f, t, pt),
          open: async (t, f, b) => (await import("@yuika/crypto")).open(t, f, b).toString("utf8"),
        },
        socketFactory: factory,
        backoff: { minMs: 50, maxMs: 200 },
        keepaliveSec: 1, // mati setelah 3 dtk hening
      },
      { onAuthOk: () => { authOk++; } },
    );
    await c.connect();
    expect(authOk).toBe(1);
    expect(c.connected).toBe(true);

    // cut: blokir event + RST socket asli (sisi server melihat koneksi mati
    // seperti keepalive relay di produksi; klien TIDAK melihat apa pun).
    for (const s of inners) s.kill();
    await new Promise((res) => setTimeout(res, 4_500));

    expect(authOk).toBeGreaterThanOrEqual(2); // reconnect + auth ulang
    expect(sockets).toBeGreaterThanOrEqual(2);
    expect(c.connected).toBe(true);

    c.close();
    for (const s of inners) s.close();
    await r.close();
  }, 15_000);
});

describe("SPEC §11.1, handshake", () => {
  it("auth valid → auth_ok accountId", async () => {
    const c = makeClient(r1);
    const acc = await c.connect();
    expect(acc).toBe(ACC_A);
    c.close();
  });

  it("sig salah (kunci device lain) → bye 4003", async () => {
    const c = new RelayClient({
      url, deviceId: r1.deviceId,
      signPriv: other.signPriv, // kunci SALAH
      crypto: {
        signChallenge: async (p, d, n) => (await import("@yuika/crypto")).signChallenge(p, d, n),
        seal: async () => "",
        open: async () => "",
      },
      socketFactory: nodeSocket,
    });
    const bye = await new Promise<ByeMsg>((resolve) => {
      c.handlers.onBye = (code, error) => resolve({ t: "bye", code, error });
      void c.connect().catch(() => undefined);
    });
    expect(bye.code).toBe(ByeCode.BAD_SIGNATURE);
    c.close();
  });

  it("device tak dikenal → bye 4001", async () => {
    const c = makeClient({ ...r1, deviceId: "dev_ffffffffffffffff" });
    const bye = await new Promise<number>((resolve) => {
      c.handlers.onBye = (code) => resolve(code);
      void c.connect().catch(() => undefined);
    });
    expect(bye).toBe(ByeCode.UNKNOWN_DEVICE);
    c.close();
  });
});

describe("SPEC §11.2/3/4, host, join, E2E, broadcast", () => {
  let hc: RelayClient;
  let h: RelayHost;

  beforeAll(async () => {
    hc = makeClient(host);
    await hc.connect();
    h = new RelayHost({
      client: hc, deviceId: host.deviceId, dhPriv: host.dhPriv,
      onAction: (from, a) => actions.push({ from: from.deviceId, act: a.act }),
    });
    expect(await h.register()).toBe(host.deviceId);
  });
  afterAll(() => hc.close());

  it("join lintas akun → bye 4003, TERMINAL segera (tanpa retry 30 dtk)", async () => {
    const c = makeClient(other);
    await c.connect();
    const remote = new RelayRemote({
      client: c, deviceId: other.deviceId, dhPriv: other.dhPriv, dhPub: other.dhPub,
      onEvent: () => undefined,
    });
    const t0 = Date.now();
    await expect(remote.join(host.deviceId, 30_000)).rejects.toThrow(/another account/);
    expect(Date.now() - t0).toBeLessThan(3_000); // permanent codes are never repeated
    expect(remote.state).toBe("host-gone");
    c.close();
  });

  it("join dhPub invalid (bukan PEM) → bye 4102, terminal, ", async () => {
    const c = makeClient(r1);
    await c.connect();
    const remote = new RelayRemote({
      client: c, deviceId: r1.deviceId, dhPriv: r1.dhPriv, dhPub: "bukan-pem",
      onEvent: () => undefined,
    });
    await expect(remote.join(host.deviceId, 30_000)).rejects.toThrow(`bye ${ByeCode.PAYLOAD_REQUIRED}`);
    expect(remote.state).toBe("host-gone");
    c.close();
  });

  it("join benar → joined membawa hostDhPub; action E2E sampai host", async () => {
    const c = makeClient(r1);
    await c.connect();
    const remote = new RelayRemote({
      client: c, deviceId: r1.deviceId, dhPriv: r1.dhPriv, dhPub: r1.dhPub,
      onEvent: () => undefined,
    });
    const joined = await remote.join(host.deviceId);
    expect(joined.hostDhPub).toBe(host.dhPub);
    expect(joined.hostName).toBe("Web host (self-host)");

    await remote.sendAction({ proto: 1, act: "send_prompt", rid: "r-t1", sessionId: "s1", message: "hello from phone" });
    await waitFor(() => actions.find((a) => a.act === "send_prompt"));
    expect(actions[actions.length - 1]).toMatchObject({ from: r1.deviceId, act: "send_prompt" });
    c.close();
  });

  it("host event per-recipient: 2 remote masing-masing menerima box-nya", async () => {
    const c1 = makeClient(r1);
    const c2 = makeClient(r2);
    await Promise.all([c1.connect(), c2.connect()]);
    const got: string[][] = [[], []];
    const mk = (c: RelayClient, i: 0 | 1, keys: DeviceKeys) =>
      new RelayRemote({
        client: c, deviceId: keys.deviceId, dhPriv: keys.dhPriv, dhPub: keys.dhPub,
        onEvent: (ev) => {
          if (ev.ev === "message.delta") got[i]!.push(ev.delta);
        },
      });
    const rm1 = mk(c1, 0, r1);
    const rm2 = mk(c2, 1, r2);
    await rm1.join(host.deviceId);
    await rm2.join(host.deviceId);
    await waitFor(() => h.remotes.size === 2);

    // broadcast = 2 box berbeda (per-recipient), remote hanya bisa buka miliknya
    await h.sendEvent("all", { proto: 1, ev: "message.delta", sessionId: "s1", seq: 1, delta: "shared-but-sealed" });
    await waitFor(() => got[0]!.length > 0 && got[1]!.length > 0);
    expect(got[0]).toEqual(["shared-but-sealed"]);
    expect(got[1]).toEqual(["shared-but-sealed"]);

    // host → satu remote saja
    await h.sendEvent(r1.deviceId, { proto: 1, ev: "message.delta", sessionId: "s1", seq: 2, delta: "only-r1" });
    await waitFor(() => got[0]!.length === 2);
    expect(got[0]).toEqual(["shared-but-sealed", "only-r1"]);
    expect(got[1]).toEqual(["shared-but-sealed"]);
    c1.close();
    c2.close();
  });
});

describe("SPEC §11.5, list_hosts", () => {
  it("host akun sama terdaftar & urut deviceId; akun lain tak tampak", async () => {
    const host2 = generateDeviceKeys();
    relay.devices.set(host2.deviceId, {
      deviceId: host2.deviceId, accountId: ACC_A, kind: "desktop",
      name: "Desktop 2", signPub: host2.signPub, dhPub: host2.dhPub,
    });
    const h2c = makeClient(host2);
    await h2c.connect();
    const h2 = new RelayHost({
      client: h2c, deviceId: host2.deviceId, dhPriv: host2.dhPriv, onAction: () => undefined,
    });
    await h2.register();

    const c = makeClient(r2);
    await c.connect();
    const remote = new RelayRemote({
      client: c, deviceId: r2.deviceId, dhPriv: r2.dhPriv, dhPub: r2.dhPub, onEvent: () => undefined,
    });
    const hosts = await remote.listHosts();
    const ids = hosts.map((x) => x.deviceId);
    expect(ids).toContain(host2.deviceId);
    expect([...ids]).toEqual([...ids].sort());
    expect(hosts.every((x) => x.deviceId !== other.deviceId)).toBe(true);
    c.close();
    h2c.close();
  });
});

describe("SPEC §11.6, sticky host_offline/host_back", () => {
  it("host putus → remote host_offline → antrian; host kembali → host_back + flush", async () => {
    // host sengaja reconnect LAMBAT (backoff 1.5s) supaya window offline
    // cukup panjang untuk membuktikan antrian SDK menahan action.
    const hc = new RelayClient({
      url, deviceId: host.deviceId, signPriv: host.signPriv,
      crypto: {
        signChallenge: async (p, d, n) => (await import("@yuika/crypto")).signChallenge(p, d, n),
        seal: async (f, t, pt) => (await import("@yuika/crypto")).seal(f, t, pt),
        open: async (t, f, b) => (await import("@yuika/crypto")).open(t, f, b).toString("utf8"),
      },
      socketFactory: nodeSocket,
      backoff: { minMs: 1_500, maxMs: 1_600 },
    });
    await hc.connect();
    const h = new RelayHost({
      client: hc, deviceId: host.deviceId, dhPriv: host.dhPriv,
      onAction: (from, a) => actions.push({ from: from.deviceId, act: `RE:${a.act}` }),
    });
    await h.register();

    const c = makeClient(r2);
    await c.connect();
    const states: string[] = [];
    const remote = new RelayRemote({
      client: c, deviceId: r2.deviceId, dhPriv: r2.dhPriv, dhPub: r2.dhPub,
      onEvent: () => undefined,
      onHostState: (s) => states.push(s),
    });
    await remote.join(host.deviceId);
    expect(remote.state).toBe("joined");

    // host mati tak disengaja (simulasi drop: close socket level bawah)
    const raw = (hc as unknown as { ws: { close(): void } }).ws;
    raw?.close();
    await waitFor(() => remote.state === "host-offline");
    expect(states).toContain("host-offline");

    // action saat offline → ditahan SDK (relay tak melihat)
    const n0 = actions.length;
    await remote.sendAction({ proto: 1, act: "ping_host", rid: "r-p1" });
    await new Promise((r) => setTimeout(r, 300));
    expect(actions.length).toBe(n0);

    // host kembali (reconnect SDK → register ulang) dalam sticky window
    await waitFor(() => hc.getState() === "authed");
    await h.register();
    await waitFor(() => remote.state === "joined");
    expect(states).toContain("joined"); // host_back → flush antrian
    await waitFor(() => actions.some((a) => a.act === "RE:ping_host"));
    c.close();
    hc.close();
  });
});

describe("SPEC §11.7, limit", () => {
  it("frame > maxFrame → bye 4105 (double: maxFrame 256)", async () => {
    const small = createSpecRelay({
      devices: [{ deviceId: host.deviceId, accountId: ACC_A, kind: "web", name: "H", signPub: host.signPub, dhPub: host.dhPub }],
      maxFrame: 256,
    });
    await new Promise((r) => setTimeout(r, 200));
    const WS = (await import("ws")).default;
    const { signChallenge } = await import("@yuika/crypto");
    const ws = new WS(small.url());
    const codes: number[] = [];
    const closed = new Promise<void>((res) => ws.on("close", () => res()));
    ws.on("message", (d) => {
      const m = JSON.parse(String(d)) as { t: string; nonce?: string; code?: number };
      if (m.t === "hello") {
        ws.send(JSON.stringify({
          t: "auth", deviceId: host.deviceId,
          sig: signChallenge(host.signPriv, host.deviceId, m.nonce!),
        }));
      }
      if (m.code) codes.push(m.code);
    });
    await new Promise<void>((res) => ws.on("open", () => res()));
    await new Promise((r) => setTimeout(r, 250)); // auth_ok
    ws.send("x".repeat(1024)); // > 256 byte
    await closed;
    expect(codes).toContain(ByeCode.TOO_LARGE);
    await small.close();
  });

  it("koneksi ke-9 satu akun → bye 4201 (double: limit 2)", async () => {
    const two = createSpecRelay({
      devices: [
        { deviceId: host.deviceId, accountId: ACC_A, kind: "web", name: "H", signPub: host.signPub, dhPub: host.dhPub },
        { deviceId: r1.deviceId, accountId: ACC_A, kind: "web", name: "R", signPub: r1.signPub, dhPub: r1.dhPub },
      ],
      maxConnPerAccount: 2,
    });
    await new Promise((r) => setTimeout(r, 200));
    const c1 = makeClient(host, two.url());
    const c2 = makeClient(r1, two.url());
    await c1.connect();
    await c2.connect();
    const c3 = makeClient({ ...r1, deviceId: r1.deviceId }, two.url());
    const bye = await new Promise<number>((resolve) => {
      c3.handlers.onBye = (code) => resolve(code);
      void c3.connect().catch(() => undefined);
    });
    expect(bye).toBe(ByeCode.ACCOUNT_LIMIT);
    c1.close();
    c2.close();
    c3.close();
    await two.close();
  });
});

describe("SDK, outbox & rid", () => {
  it("pesan pra-auth masuk outbox, flush urut setelah auth_ok", async () => {
    const c = makeClient(r1);
    c.send({ t: "list_hosts" }); // belum connect → outbox
    await c.connect();
    const remote = new RelayRemote({
      client: c, deviceId: r1.deviceId, dhPriv: r1.dhPriv, dhPub: r1.dhPub, onEvent: () => undefined,
    });
    const hosts = await remote.listHosts();
    expect(Array.isArray(hosts)).toBe(true);
    c.close();
  });

  it("newRid unik 100x", async () => {
    const { newRid } = await import("../src/core.js");
    const s = new Set(Array.from({ length: 100 }, () => newRid()));
    expect(s.size).toBe(100);
  });
});

// unlink dari portal: device hilang dari registry relay → semua conn
// aktifnya kena bye 4001 (unknown device) → SDK PERMANEN (tidak reconnect).
describe(", unlink device → bye 4001 permanen", () => {
  it("bye 4001 → stopped: state closed & TIDAK reconnect setelah backoff", async () => {
    const d = generateDeviceKeys();
    const rl = createSpecRelay({
      devices: [{ deviceId: d.deviceId, accountId: ACC_A, kind: "mobile", name: "Unlink target", signPub: d.signPub, dhPub: d.dhPub }],
      stickyMs: 0,
    });
    await new Promise((r) => setTimeout(r, 300));
    const client = new RelayClient({
      url: rl.url(),
      deviceId: d.deviceId,
      signPriv: d.signPriv,
      crypto: {
        signChallenge: async (p, d, n) => (await import("@yuika/crypto")).signChallenge(p, d, n),
        seal: async (f, t, pt) => (await import("@yuika/crypto")).seal(f, t, pt),
        open: async (t, f, b) => (await import("@yuika/crypto")).open(t, f, b).toString("utf8"),
      },
      socketFactory: nodeSocket,
      backoff: { minMs: 100, maxMs: 200 }, // backoff cepat, bila SDK salah reconnect, cepat ketahuan
      log: () => {},
    });
    await client.connect();
    expect(client.getState()).toBe("authed");

    rl.unlink(d.deviceId); //  test hook: putus dgn bye 4001
    await new Promise((r) => setTimeout(r, 300));
    expect(client.getState()).toBe("closed"); // bye diterima, koneksi putus

    // jendela reconnect: 3× backoff max, transien akan reconnect di sini.
    await new Promise((r) => setTimeout(r, 700));
    expect(client.getState()).toBe("closed"); // PERMANEN, tidak ada retry
    client.close();
    await rl.close();
  });
});
