// P1-PRT-6 — INTEGRASI PORTAL NYATA (docs/INTEGRATION.md §5, 10 skenario)
// SDK/crypto Yuika vs PORTAL PRODUKSI yuika-portal: web HTTP nyata
// (register/pairing/claim/unlink + cookie sesi) dan relay WS nyata
// (ws://localhost:3101) — bukan SpecRelay double, bukan seed lib internal.
//
// Prasyarat (INTEGRATION.md §3 — web DULU, relay menunggu db):
//   cd d:/projects/yuika-portal
//   npm run dev  -w @yuika-portal/web     # :3100
//   npm run start -w @yuika-portal/relay  # :3101
//
// Jalankan: npx tsx scripts/portal-integration.mts
//
// Catatan rate limit claim (10/mnt/IP): skenario 10 sengaja membakar kuota
// sampai 429 — setelah selesai, tunggu Retry-After sebelum menjalankan lagi.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import { generateDeviceKeys, seal, open, signChallenge } from "@yuika/crypto";
import { RemoteAction, RemoteEvent } from "@yuika/contracts";

const WEB = process.env.PORTAL_WEB ?? "http://localhost:3100";
const RELAY = process.env.PORTAL_RELAY ?? "ws://localhost:3101";
const TS = Date.now();

// ── HTTP kecil + cookie jar ────────────────────────────────────────────────
class Http {
  cookie = "";
  async call(method: string, p: string, body?: unknown): Promise<{ status: number; text: string; headers: Headers }> {
    const res = await fetch(`${WEB}${p}`, {
      method,
      headers: { "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.getSetCookie?.() ?? [];
    if (sc.length) this.cookie = sc.map((c) => c.split(";")[0]).join("; ");
    return { status: res.status, text: await res.text(), headers: res.headers };
  }
}

const j = (r: { text: string }) => JSON.parse(r.text) as any;

// ── koneksi WS mentah (kontrol penuh atas frame) ───────────────────────────
type Frame = Record<string, any>;
class Conn {
  ws!: WebSocket;
  frames: Frame[] = [];
  waiters: { pred: (f: Frame) => boolean; resolve: (f: Frame) => void }[] = [];
  closedBye: Frame | null = null;
  nonce = "";
  constructor(
    public label: string,
    public dev: { deviceId: string; signPriv: string; dhPriv: string; dhPub: string },
  ) {}
  get open_() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
  connect(): Promise<"auth_ok" | Frame> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(RELAY);
      this.ws.on("message", (raw) => {
        const f = JSON.parse(raw.toString()) as Frame;
        if (f.t === "hello") this.nonce = String(f.nonce);
        if (f.t === "bye") this.closedBye = f;
        const w = this.waiters.find((x) => x.pred(f));
        if (w) this.waiters.splice(this.waiters.indexOf(w), 1), w.resolve(f);
        else this.frames.push(f);
      });
      this.ws.on("error", reject);
      this.ws.on("open", () => {
        this.wait((f) => f.t === "hello", 5000).then(async (h) => {
          const sig = signChallenge(this.dev.signPriv, this.dev.deviceId, h.nonce);
          this.send({ t: "auth", deviceId: this.dev.deviceId, sig });
          const r = await this.wait((f) => f.t === "auth_ok" || f.t === "bye", 5000);
          resolve(r.t === "auth_ok" ? "auth_ok" : r);
        }, reject);
      });
    });
  }
  /** auth dengan kunci SALAH (uji bad signature). */
  connectBadSig(badPriv: string): Promise<Frame> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(RELAY);
      this.ws.on("message", (raw) => {
        const f = JSON.parse(raw.toString()) as Frame;
        const w = this.waiters.find((x) => x.pred(f));
        if (w) this.waiters.splice(this.waiters.indexOf(w), 1), w.resolve(f);
      });
      this.ws.on("error", reject);
      this.ws.on("open", () => {
        this.wait((f) => f.t === "hello", 5000).then((h) => {
          const sig = signChallenge(badPriv, this.dev.deviceId, h.nonce);
          this.send({ t: "auth", deviceId: this.dev.deviceId, sig });
          this.wait((f) => f.t === "bye", 5000).then(resolve, reject);
        }, reject);
      });
    });
  }
  send(o: Frame | string) {
    this.ws.send(typeof o === "string" ? o : JSON.stringify(o));
  }
  wait(pred: (f: Frame) => boolean, ms: number): Promise<Frame> {
    const i = this.frames.findIndex(pred);
    if (i >= 0) return Promise.resolve(this.frames.splice(i, 1)[0]!);
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => {
        const w = this.waiters.find((x) => x.pred === pred); // noop — waiters unik per pred closure
        reject(new Error(`[${this.label}] wait timeout ${ms}ms (frames: ${this.frames.map((f) => f.t).join(",")})`));
        void w;
      }, ms);
      this.waiters.push({
        pred,
        resolve: (f) => {
          clearTimeout(to);
          resolve(f);
        },
      });
    });
  }
  close() {
    try {
      this.ws.close();
    } catch {
      /* sudah tertutup */
    }
  }
}

// ── runner ─────────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const conns: Conn[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  [PASS] ${name}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${name} ${detail}`);
  }
}

async function main() {
  console.log(`[int] portal nyata: web=${WEB} relay=${RELAY}\n`);

  // ══ setup: akun + device via HTTP portal ══════════════════════════════
  const A = new Http();
  const B = new Http();
  const rA = await A.call("POST", "/api/account/register", { email: `int-${TS}-a@yuika.test`, password: "int-pass-123456" });
  const rB = await B.call("POST", "/api/account/register", { email: `int-${TS}-b@yuika.test`, password: "int-pass-123456" });
  if (rA.status !== 201 || rB.status !== 201) throw new Error(`register gagal A=${rA.status} B=${rB.status}`);
  const accA = j(rA).account.id;
  const accB = j(rB).account.id;

  async function claim(h: Http, kind: string, name: string, key: { signPub: string; dhPub: string }) {
    const { token } = j(await h.call("POST", "/api/devices/pairing", { kind }));
    const r = j(await h.call("POST", "/api/devices/claim", { token, kind, name, signPub: key.signPub, dhPub: key.dhPub }));
    if (!r.deviceId) throw new Error(`claim gagal ${name}: ${JSON.stringify(r)}`);
    return { deviceId: r.deviceId as string, token };
  }
  function conn(label: string, deviceId: string, key: { signPriv: string; dhPriv: string; dhPub: string }) {
    const c = new Conn(label, { deviceId, signPriv: key.signPriv, dhPriv: key.dhPriv, dhPub: key.dhPub });
    conns.push(c);
    return c;
  }
  // 5 device: A desktop/web/mobile + B desktop/web
  const kA1 = generateDeviceKeys(), kA2 = generateDeviceKeys(), kA3 = generateDeviceKeys();
  const kB1 = generateDeviceKeys(), kB2 = generateDeviceKeys();
  const ids: Record<string, string> = {};
  ({ deviceId: ids.A1 } = await claim(A, "desktop", "Int Host", kA1));
  ({ deviceId: ids.A2 } = await claim(A, "web", "Int Remote Web", kA2));
  ({ deviceId: ids.A3 } = await claim(A, "mobile", "Int Remote Mobile", kA3));
  ({ deviceId: ids.B1 } = await claim(B, "desktop", "Int B Desktop", kB1));
  ({ deviceId: ids.B2 } = await claim(B, "web", "Int B Web", kB2));
  // token kadaluarsa utk S10 diterbitkan LOKAL di S10 (lihat catatan di sana)
  console.log(`[setup] akun A=${accA} B=${accB}; device ${JSON.stringify(ids)}\n`);

  // ══ S9: golden vectors identik dua repo ═══════════════════════════════
  {
    console.log("[S9] golden vectors");
    const h1 = crypto.createHash("sha256").update(fs.readFileSync(path.resolve("docs/portal/vectors/proto1.json"))).digest("hex");
    const h2 = crypto.createHash("sha256").update(fs.readFileSync(path.resolve("D:/projects/yuika-portal/docs/vectors/proto1.json"))).digest("hex");
    check("proto1.json identik dua repo", h1 === h2, `${h1} vs ${h2}`);
  }

  // ══ S1: auth valid / bad sig 4003 / unlinked 4001 ═════════════════════
  {
    console.log("[S1] auth");
    const c1 = conn("A1", ids.A1, kA1);
    const ok = await c1.connect();
    check("auth valid → auth_ok", ok === "auth_ok");
    c1.close(); // jangan bocorkan koneksi — S8 menghitung cap per akun
    const bad = conn("A1-badsig", ids.A1, kA1);
    const badPriv = generateDeviceKeys().signPriv;
    const bye = await bad.connectBadSig(badPriv);
    check("sig salah → bye 4003 'bad signature'", bye.code === 4003 && String(bye.error ?? bye.reason).includes("bad signature"), JSON.stringify(bye));
    const b2 = conn("B2", ids.B2, kB2);
    check("B2 linked → auth_ok", (await b2.connect()) === "auth_ok");
    b2.close();
    const del = await B.call("DELETE", `/api/devices/${ids.B2}`);
    check("unlink B2 via web", del.status === 200, del.text);
    const b2b = conn("B2-unlinked", ids.B2, kB2);
    const bye1 = await b2b.connect();
    check("device unlinked → bye 4001", typeof bye1 === "object" && (bye1 as any).code === 4001, JSON.stringify(bye1));
  }

  // ══ S2: join lintas akun → 4003 (CP-1) ════════════════════════════════
  const host1 = conn("A1-host", ids.A1, kA1);
  {
    console.log("[S2] cross-account join");
    check("host1 auth_ok", (await host1.connect()) === "auth_ok");
    host1.send({ t: "register_host" });
    const hr = await host1.wait((f) => f.t === "host_ready", 5000);
    const hostId0 = hr.hostId as string;
    check("host_ready.hostId terisi", !!hostId0);
    const cB = conn("B1-cross", ids.B1, kB1);
    const r = await cB.connect();
    check("B auth_ok sebelum join", r === "auth_ok");
    cB.send({ t: "join", hostId: hostId0, dhPub: kB1.dhPub });
    const bye = await cB.wait((f) => f.t === "bye", 5000);
    check("join lintas akun → bye 4003 (CP-1)", bye.code === 4003 && String(bye.error ?? bye.reason).includes("host belongs to another account"), JSON.stringify(bye));
    (host1 as any)._hostId = hostId0;
  }
  const hostId = (host1 as any)._hostId as string;

  // ══ S3: join valid + dhPub dua arah ═══════════════════════════════════
  const r1 = conn("A2-remote", ids.A2, kA2);
  {
    console.log("[S3] join valid");
    check("A2 auth_ok", (await r1.connect()) === "auth_ok");
    r1.send({ t: "join", hostId, dhPub: kA2.dhPub });
    const jn = await r1.wait((f) => f.t === "joined", 5000);
    check("joined.hostDhPub = dhPub host", jn.hostDhPub === kA1.dhPub);
    const rj = await host1.wait((f) => f.t === "remote_joined", 5000);
    check("host ← remote_joined.dhPub = dhPub remote", rj.dhPub === kA2.dhPub);
  }

  // ══ S4: action E2E send_prompt → message.delta ════════════════════════
  {
    console.log("[S4] action E2E");
    const action = RemoteAction.parse({ proto: 1, act: "send_prompt", rid: `rid-${TS}`, sessionId: "s1", personaId: "yui-coder", message: "halo dari integrasi" });
    r1.send({ t: "data", payload: seal({ deviceId: ids.A2, dhPriv: kA2.dhPriv }, { deviceId: ids.A1, dhPub: kA1.dhPub }, JSON.stringify(action)) });
    const d = await host1.wait((f) => f.t === "data", 5000);
    const opened = open({ deviceId: ids.A1, dhPriv: kA1.dhPriv }, { deviceId: ids.A2, dhPub: kA2.dhPub }, d.payload);
    check("host membuka send_prompt", RemoteAction.parse(JSON.parse(opened)).act === "send_prompt");
    const ev = RemoteEvent.parse({ proto: 1, ev: "message.delta", sessionId: "s1", seq: 1, delta: "jalan " });
    host1.send({ t: "data", to: ids.A2, payload: seal({ deviceId: ids.A1, dhPriv: kA1.dhPriv }, { deviceId: ids.A2, dhPub: kA2.dhPub }, JSON.stringify(ev)) });
    const d2 = await r1.wait((f) => f.t === "data", 5000);
    const opened2 = open({ deviceId: ids.A2, dhPriv: kA2.dhPriv }, { deviceId: ids.A1, dhPub: kA1.dhPub }, d2.payload);
    check("remote membuka message.delta", RemoteEvent.parse(JSON.parse(opened2)).ev === "message.delta");
  }

  // ══ S5: broadcast 2 remote, box per-pemilik ═══════════════════════════
  const r2 = conn("A3-remote", ids.A3, kA3);
  {
    console.log("[S5] broadcast");
    check("A3 auth_ok", (await r2.connect()) === "auth_ok");
    r2.send({ t: "join", hostId, dhPub: kA3.dhPub });
    check("A3 joined", (await r2.wait((f) => f.t === "joined", 5000)).hostDhPub === kA1.dhPub);
    await host1.wait((f) => f.t === "remote_joined" && f.dhPub === kA3.dhPub, 5000);
    const boxes = {
      boxes: [
        { to: ids.A2, box: seal({ deviceId: ids.A1, dhPriv: kA1.dhPriv }, { deviceId: ids.A2, dhPub: kA2.dhPub }, "untuk A2") },
        { to: ids.A3, box: seal({ deviceId: ids.A1, dhPriv: kA1.dhPriv }, { deviceId: ids.A3, dhPub: kA3.dhPub }, "untuk A3") },
      ],
    };
    host1.send({ t: "data", payload: JSON.stringify(boxes) }); // tanpa `to` = broadcast
    const [b1, b2] = await Promise.all([r1.wait((f) => f.t === "data", 5000), r2.wait((f) => f.t === "data", 5000)]);
    const ownA2 = JSON.parse(b1.payload).boxes.find((x: any) => x.to === ids.A2).box;
    const ownA3 = JSON.parse(b2.payload).boxes.find((x: any) => x.to === ids.A3).box;
    check("broadcast sampai kedua remote", !!b1 && !!b2);
    check("A2 membuka box miliknya", String(open({ deviceId: ids.A2, dhPriv: kA2.dhPriv }, { deviceId: ids.A1, dhPub: kA1.dhPub }, ownA2)) === "untuk A2");
    check("A3 membuka box miliknya", String(open({ deviceId: ids.A3, dhPriv: kA3.dhPriv }, { deviceId: ids.A1, dhPub: kA1.dhPub }, JSON.parse(b2.payload).boxes.find((x: any) => x.to === ids.A3).box)) === "untuk A3");
    let threw = false;
    try {
      open({ deviceId: ids.A2, dhPriv: kA2.dhPriv }, { deviceId: ids.A1, dhPub: kA1.dhPub }, ownA3);
    } catch {
      threw = true;
    }
    check("box A3 TIDAK terbuka oleh A2", threw);
  }

  // ══ S6: list_hosts — dua host akun sama ═══════════════════════════════
  {
    console.log("[S6] list_hosts");
    r2.close();
    const host2 = conn("A3-host2", ids.A3, kA3);
    check("A3 register_host", (await host2.connect()) === "auth_ok");
    host2.send({ t: "register_host" });
    await host2.wait((f) => f.t === "host_ready", 5000);
    r1.send({ t: "list_hosts" });
    const hs = await r1.wait((f) => f.t === "hosts", 5000);
    const idsSorted = [ids.A1, ids.A3].sort();
    check("hosts = 2 device akun A urut deviceId", JSON.stringify(hs.hosts.map((h: any) => h.deviceId)) === JSON.stringify(idsSorted), JSON.stringify(hs.hosts.map((h: any) => h.deviceId)));
    check("lastSeen terisi semua", hs.hosts.every((h: any) => Number(h.lastSeen) > 0));
  }

  // ══ S7: sticky host_offline → err 4104 → host_back ════════════════════
  {
    console.log("[S7] sticky");
    host1.close();
    const off = await r1.wait((f) => f.t === "host_offline", 5000);
    check("host_offline {stickyMs}", Number(off.stickyMs) > 0, JSON.stringify(off));
    r1.send({ t: "data", payload: seal({ deviceId: ids.A2, dhPriv: kA2.dhPriv }, { deviceId: ids.A1, dhPub: kA1.dhPub }, "saat offline") });
    const err = await r1.wait((f) => f.t === "err", 5000);
    check("data saat offline → err 4104 (soft)", err.code === 4104, JSON.stringify(err));
    const host1b = conn("A1-host-back", ids.A1, kA1);
    check("host reconnect auth_ok", (await host1b.connect()) === "auth_ok");
    host1b.send({ t: "register_host" });
    await host1b.wait((f) => f.t === "host_ready", 5000);
    const back = await r1.wait((f) => f.t === "host_back", 5000);
    check("remote menerima host_back", back.t === "host_back");
    const rj = await host1b.wait((f) => f.t === "remote_joined", 5000);
    check("host_back → batch remote_joined (A2 nyempel)", rj.dhPub === kA2.dhPub);
  }

  // ══ S8: limit frame 4105 + cap koneksi 4201 ═══════════════════════════
  {
    console.log("[S8] limit");
    // host2 (A3) kirim frame > 256 KB → bye 4105
    const big = conn("A3-big", ids.A3, kA3);
    await big.connect();
    big.send(JSON.stringify({ t: "data", payload: "A".repeat(300_000) }));
    const byeBig = await big.wait((f) => f.t === "bye", 5000);
    check("frame > 262.144 B → bye 4105", byeBig.code === 4105, JSON.stringify(byeBig));
    // cap 8 koneksi/akun: aktif = host1-back + A2(remote) + host2 = 3 →
    // 5 dummy → total 8; connect ke-9 (dummy ke-6) me-resolve frame bye 4201.
    const dummies: Conn[] = [];
    const results: ("auth_ok" | Frame)[] = [];
    for (let i = 0; i < 6; i++) {
      const d = conn(`A-dummy-${i}`, ids.A3, kA3);
      dummies.push(d);
      const r = (await d.connect()) as "auth_ok" | Frame;
      results.push(r);
      if (i < 5) check(`dummy ${i + 1} auth_ok (koneksi ${4 + i}/8)`, r === "auth_ok");
    }
    const ninth = results[5]!;
    check("koneksi ke-9 per akun → bye 4201", typeof ninth === "object" && (ninth as Frame).code === 4201, JSON.stringify(ninth));
    for (const d of dummies) if (d.open_) d.close();
  }

  // ══ audit device_events (INTEGRATION §4.4) ════════════════════════════
  {
    console.log("[audit] device events");
    const ev = j(await A.call("GET", "/api/devices/events"));
    const kinds = new Set((ev.events ?? []).map((e: any) => e.event));
    for (const want of ["auth_ok", "host_online", "remote_joined", "host_offline"]) {
      check(`event '${want}' tercatat`, kinds.has(want), kinds.size ? [...kinds].join(",") : "kosong");
    }
  }

  // ══ S10: matriks claim API ════════════════════════════════════════════
  {
    console.log("[S10] claim API (rate limit akan terbakar — jangan ulang <1 mnt)");
    // slot clash: semua kind A terisi → token baru kind web → 409 already linked
    const tokWeb = j(await A.call("POST", "/api/devices/pairing", { kind: "web" })).token;
    const clash = await A.call("POST", "/api/devices/claim", { token: tokWeb, kind: "web", name: "Clash", signPub: kA2.signPub, dhPub: kA2.dhPub });
    check("slot clash → 409 already linked", clash.status === 409 && j(clash).error.includes("already linked"), `${clash.status} ${clash.text}`);
    // 201 lalu reuse 409: kosongkan slot mobile (peran A3 selesai)
    await A.call("DELETE", `/api/devices/${ids.A3}`);
    const kNew = generateDeviceKeys();
    const tokMobile = j(await A.call("POST", "/api/devices/pairing", { kind: "mobile" }));
    const fresh = await A.call("POST", "/api/devices/claim", { token: tokMobile.token, kind: "mobile", name: "Fresh", signPub: kNew.signPub, dhPub: kNew.dhPub });
    check("claim baru → 201 + deviceId", fresh.status === 201 && !!j(fresh).deviceId, `${fresh.status} ${fresh.text}`);
    const reuse = await A.call("POST", "/api/devices/claim", { token: tokMobile.token, kind: "mobile", name: "Reuse", signPub: kNew.signPub, dhPub: kNew.dhPub });
    check("reuse token → 409 already used", reuse.status === 409 && j(reuse).error.includes("already used"), `${reuse.status} ${reuse.text}`);
    // expired 410 — issue BARU setelah semua pairing lain (issue baru per
    // account+kind MENGHAPUS token lama → token setup sudah pasti 404), lalu
    // biarkan >120 dtk TANPA issue lain → claim → 410.
    const expTok = j(await A.call("POST", "/api/devices/pairing", { kind: "web" }));
    const wait = Math.max(0, expTok.expiresAt + 1_000 - Date.now());
    console.log(`  … menunggu token expired ${Math.ceil(wait / 1000)}dtk`);
    await new Promise((r) => setTimeout(r, wait));
    const exp = await A.call("POST", "/api/devices/claim", { token: expTok.token, kind: "web", name: "Exp", signPub: kA2.signPub, dhPub: kA2.dhPub });
    check("token expired → 410", exp.status === 410 && j(exp).error.includes("expired"), `${exp.status} ${exp.text}`);
    // 429: fixed-window 10/mnt/IP — 3 claim di atas + burn hingga 12 → trip
    let got429 = false;
    let retryAfter = "";
    for (let i = 0; i < 12 && !got429; i++) {
      const t = j(await A.call("POST", "/api/devices/pairing", { kind: "web" })).token;
      const r = await A.call("POST", "/api/devices/claim", { token: t, kind: "web", name: `Burn${i}`, signPub: kA2.signPub, dhPub: kA2.dhPub });
      if (r.status === 429) {
        got429 = true;
        retryAfter = r.headers.get("retry-after") ?? "";
      }
    }
    check("rate limit → 429 + Retry-After", got429 && Number(retryAfter) > 0, `retry-after=${retryAfter}`);
  }

  for (const c of conns) if (c.open_) c.close();
  console.log(`\n[int] hasil: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("[int] FATAL", e);
  for (const c of conns) if (c.open_) c.close();
  process.exit(1);
});
