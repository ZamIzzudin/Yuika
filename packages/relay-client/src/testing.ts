// @yuika/relay-client/testing — SpecRelay: DOUBLE relay untuk unit test &
// e2e gerbang P1-PRT-6. Mengimplementasi SPEC-PROTOCOL v1 secara fideli
// (handshake, register_host + replace + batch remote_joined, list_hosts,
// join dhPub, data mux buta, sticky host_offline/host_back, err 4104,
// bye codes, limit frame & koneksi/akun). BUKAN relay produksi — produksi
// ada di repo yuika-portal (apps/relay); double ini mengecek KLIEN Yuika
// terhadap semantik spec yang sama.
//
// Device registry (pengganti claim portal): pre-register device + pub keys.
import { verifyChallenge } from "@yuika/crypto";
import { randomBytes } from "node:crypto";
import WS from "ws";
import { WebSocketServer, type WebSocket } from "ws";
import { ByeCode, PROTO } from "./wire.js";

export interface SpecDevice {
  deviceId: string;
  accountId: string;
  kind: "desktop" | "mobile" | "web";
  name: string;
  signPub: string;
  dhPub: string;
}

export interface SpecRelayOpts {
  devices: SpecDevice[];
  port?: number;
  stickyMs?: number;
  maxFrame?: number;
  maxConnPerAccount?: number;
  log?: (...args: unknown[]) => void;
}

interface Conn {
  ws: WebSocket;
  nonce: string;
  deviceId: string | null;
  account: string | null;
  isHost: boolean;
  /** remote: host yang ditempel */
  joinedHost: string | null;
  alive: boolean;
}

interface Attached {
  deviceId: string;
  kind: SpecDevice["kind"];
  name: string;
  dhPub: string;
  conn: Conn | null;
}

export function createSpecRelay(opts: SpecRelayOpts) {
  const devices = new Map(opts.devices.map((d) => [d.deviceId, d]));
  const lastSeen = new Map<string, number>();
  const stickyMs = opts.stickyMs ?? 60_000;
  const maxFrame = opts.maxFrame ?? 262_144;
  const maxConn = opts.maxConnPerAccount ?? 8;
  const log = opts.log ?? (() => {});

  const wss = new WebSocketServer({ port: opts.port ?? 0 });
  const conns = new Set<Conn>();
  /** host online: hostDeviceId → Conn */
  const hosts = new Map<string, Conn>();
  /** lampiran remote: hostDeviceId → Map(remoteDeviceId → Attached) —
   *  tetap hidup melewati host_offline selama sticky window (SPEC §4.6). */
  const attached = new Map<string, Map<string, Attached>>();
  const stickyTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const port = () => (wss.address() as { port: number }).port;

  function send(ws: WebSocket, msg: unknown): void {
    if (ws.readyState === WS.OPEN) ws.send(JSON.stringify(msg));
  }
  function bye(c: Conn, code: number, error: string): void {
    send(c.ws, { t: "bye", code, error });
    c.alive = false;
    c.ws.close(code, error);
  }
  function attachmentsOf(hostId: string): Map<string, Attached> {
    let m = attached.get(hostId);
    if (!m) {
      m = new Map();
      attached.set(hostId, m);
    }
    return m;
  }

  wss.on("connection", (ws) => {
    const conn: Conn = {
      ws, nonce: randomBytes(24).toString("base64url"),
      deviceId: null, account: null, isHost: false, joinedHost: null, alive: true,
    };
    conns.add(conn);
    send(ws, { t: "hello", proto: PROTO, nonce: conn.nonce });

    ws.on("message", (data, isBinary) => {
      if (isBinary) return bye(conn, ByeCode.BAD_JSON, "bad json");
      const raw = data.toString();
      if (raw.length > maxFrame) return bye(conn, ByeCode.TOO_LARGE, "message too large");
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return bye(conn, ByeCode.BAD_JSON, "bad json");
      }
      handle(conn, msg).catch((e) => log("relay error", e));
    });

    ws.on("close", () => {
      conns.delete(conn);
      if (conn.isHost && conn.deviceId) hostDown(conn.deviceId);
      if (conn.joinedHost) {
        const m = attached.get(conn.joinedHost);
        const a = m?.get(conn.deviceId ?? "");
        const host = hosts.get(conn.joinedHost);
        if (conn.deviceId && a && host) {
          // host online: lepas + kabari; host offline: buang lampiran diam-diam.
          send(host.ws, { t: "remote_left", deviceId: conn.deviceId });
          m!.delete(conn.deviceId);
        } else if (a) {
          a.conn = null;
        }
      }
    });
  });

  async function handle(conn: Conn, msg: Record<string, unknown>): Promise<void> {
    const t = msg.t as string;

    // ── auth (SPEC §3) ───────────────────────────────────────────────────
    if (t === "auth") {
      if (conn.deviceId) return bye(conn, ByeCode.ALREADY_AUTH, "already authenticated");
      const deviceId = String(msg.deviceId ?? "");
      const dev = devices.get(deviceId);
      if (!dev) return bye(conn, ByeCode.UNKNOWN_DEVICE, "unknown device");
      const sigOk = verifyChallenge(dev.signPub, deviceId, conn.nonce, String(msg.sig ?? ""));
      if (!sigOk) return bye(conn, ByeCode.BAD_SIGNATURE, "bad signature");
      const n = [...conns].filter((c) => c.account === dev.accountId).length;
      if (n >= maxConn) return bye(conn, ByeCode.ACCOUNT_LIMIT, "account connection limit");
      conn.deviceId = deviceId;
      conn.account = dev.accountId;
      lastSeen.set(deviceId, Date.now());
      return send(conn.ws, { t: "auth_ok", accountId: dev.accountId, deviceId });
    }
    if (!conn.deviceId) return bye(conn, ByeCode.UNKNOWN_DEVICE, "not authenticated");

    switch (t) {
      case "register_host": {
        const hostId = conn.deviceId!;
        const old = hosts.get(hostId);
        if (old && old !== conn) bye(old, ByeCode.REPLACED, "replaced by new host connection");
        conn.isHost = true;
        hosts.set(hostId, conn);
        const st = stickyTimers.get(hostId);
        if (st) {
          clearTimeout(st);
          stickyTimers.delete(hostId);
          for (const a of attachmentsOf(hostId).values()) {
            if (a.conn) send(a.conn.ws, { t: "host_back", hostId });
          }
        }
        lastSeen.set(hostId, Date.now());
        send(conn.ws, { t: "host_ready", hostId });
        // batch remote_joined — termasuk saat host reconnect (SPEC §4.1)
        for (const a of attachmentsOf(hostId).values()) {
          if (a.conn) a.conn.joinedHost = hostId;
          send(conn.ws, { t: "remote_joined", deviceId: a.deviceId, kind: a.kind, name: a.name, dhPub: a.dhPub });
        }
        return;
      }
      case "list_hosts": {
        const list = [...hosts.entries()]
          .filter(([, c]) => c.alive && c.account === conn.account)
          .map(([deviceId]) => {
            const d = devices.get(deviceId)!;
            return { deviceId, kind: d.kind, name: d.name, lastSeen: lastSeen.get(deviceId) ?? 0 };
          })
          .sort((a, b) => (a.deviceId < b.deviceId ? -1 : 1));
        return send(conn.ws, { t: "hosts", hosts: list });
      }
      case "join": {
        const hostId = String(msg.hostId ?? "");
        const host = hosts.get(hostId);
        const dev = devices.get(hostId);
        if (!host || !host.alive) return bye(conn, ByeCode.HOST_NOT_ONLINE, "host not online");
        if (!dev || dev.accountId !== conn.account) {
          return bye(conn, ByeCode.BAD_SIGNATURE, "host belongs to another account");
        }
        // SPEC §4.3 + CP-2: join.dhPub wajib string PEM PUBLIC KEY — invalid
        // → bye 4102 ("field wajib hilang/tidak valid"), sama dengan relay
        // produksi T1 (errata yang diusulkan).
        if (typeof msg.dhPub !== "string" || !msg.dhPub.includes("BEGIN PUBLIC KEY")) {
          return bye(conn, ByeCode.PAYLOAD_REQUIRED, "payload required");
        }
        // satu host per remote (v1): pindah host = lepas lampiran lama.
        if (conn.joinedHost && conn.joinedHost !== hostId) {
          attached.get(conn.joinedHost)?.delete(conn.deviceId!);
          const oh = hosts.get(conn.joinedHost);
          if (oh) send(oh.ws, { t: "remote_left", deviceId: conn.deviceId });
        }
        const me = devices.get(conn.deviceId!)!;
        const m = attachmentsOf(hostId);
        m.set(conn.deviceId!, { deviceId: conn.deviceId!, kind: me.kind, name: me.name, dhPub: me.dhPub, conn });
        conn.joinedHost = hostId;
        // remote_joined selalu dikirim ke host (join idempotent = refresh lampiran).
        send(host.ws, {
          t: "remote_joined", deviceId: conn.deviceId!, kind: me.kind, name: me.name, dhPub: me.dhPub,
        });
        return send(conn.ws, {
          t: "joined", hostId, hostName: dev.name, hostKind: dev.kind, hostDhPub: dev.dhPub,
        });
      }
      case "data": {
        const payload = msg.payload;
        if (typeof payload !== "string" || !payload) return bye(conn, ByeCode.PAYLOAD_REQUIRED, "payload required");
        if (conn.isHost) {
          const m = attachmentsOf(conn.deviceId!);
          if (m.size === 0) return bye(conn, ByeCode.NO_REMOTE, "no remote connected");
          const to = typeof msg.to === "string" ? msg.to : null;
          for (const rId of to ? [to] : [...m.keys()]) {
            const a = m.get(rId);
            if (a?.conn) send(a.conn.ws, { t: "data", from: conn.deviceId, payload });
          }
          return;
        }
        const hostId = conn.joinedHost;
        if (!hostId) return bye(conn, ByeCode.NOT_JOINED, "not joined to any host");
        const host = hosts.get(hostId);
        if (!host || !host.alive) return send(conn.ws, { t: "err", code: 4104, error: "host not online" });
        return send(host.ws, { t: "data", from: conn.deviceId, payload });
      }
      default:
        return; // ignore-unknown (SPEC §2) — forward-compat
    }
  }

  function hostDown(hostId: string): void {
    hosts.delete(hostId);
    const m = attached.get(hostId);
    if (!m || m.size === 0) return;
    for (const a of m.values()) {
      if (a.conn) send(a.conn.ws, { t: "host_offline", hostId, stickyMs });
    }
    const timer = setTimeout(() => {
      stickyTimers.delete(hostId);
      attached.delete(hostId); // lewat window: lampiran dilepas (SPEC §4.6)
    }, stickyMs);
    stickyTimers.set(hostId, timer);
  }

  async function close(): Promise<void> {
    for (const t of stickyTimers.values()) clearTimeout(t);
    stickyTimers.clear();
    for (const c of conns) c.ws.close();
    conns.clear();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  }

  return {
    port,
    url: () => `ws://127.0.0.1:${port()}`,
    devices,
    lastSeen,
    close,
    /** test helper: daftar host online (deviceId). */
    onlineHosts: () => [...hosts.keys()],
  };
}
