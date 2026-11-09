// @yuika/relay-client, core transport & crypto-agnostic (browser-safe).
// Siklus: connect → hello{nonce} → auth{sig} → auth_ok → (role layer).
// Reconnect otomatis exponential backoff 250ms→16s + jitter (SPEC §10) lalu
// handshake penuh ulang; outbox menahan pesan selama putus.
import {
  ByeCode,
  MAX_FRAME,
  PROTO,
  type ByeMsg,
  type ClientMsg,
  type ServerMsg,
} from "./wire.js";

/** Adapter crypto, backend node (@yuika/crypto) atau web (@yuika/crypto/web). */
export interface CryptoAdapter {
  signChallenge(signPrivPem: string, deviceId: string, nonce: string): Promise<string>;
  seal(from: { deviceId: string; dhPriv: string }, to: { deviceId: string; dhPub: string }, plaintext: string): Promise<string>;
  open(to: { deviceId: string; dhPriv: string }, from: { deviceId: string; dhPub: string }, boxB64: string): Promise<string>;
}

/** Socket minimal, node `ws` & browser WebSocket sama-sama memenuhi. */
export interface WsLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  /** Node `ws`: pengiriman ping control-frame. Browser tidak punya —
   * watchdog keepalive hanya aktif untuk socket yang mendukungnya. */
  ping?(): void;
  /** Node `ws`: putus TCP seketika (zombie tidak merespon close()). */
  terminate?(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
  onerror: ((err: unknown) => void) | null;
  /** dipanggil adapter saat pong control-frame diterima (Node). */
  onpong?: (() => void) | null;
}

export type RelayState = "idle" | "connecting" | "authed" | "closed";

export interface RelayClientOpts {
  url: string;
  deviceId: string;
  signPriv: string;
  crypto: CryptoAdapter;
  socketFactory: (url: string) => WsLike;
  /** backoff reconnect (default 250ms→16s; test bisa memperkecil). */
  backoff?: { minMs?: number; maxMs?: number };
  /** Keepalive watchdog: ping tiap N detik; socket dianggap zombie bila
   * TIDAK ada frame/ping/pong apa pun selama 3×N detik → reconnect paksa.
   * Default 25 (aman terhadap ping server tiap 30 dtk). 0 = nonaktif.
   * Hanya berlaku untuk socket dengan ping() (Node); browser skip. */
  keepaliveSec?: number;
  /** debug log (default off). */
  log?: (...args: unknown[]) => void;
}

export interface RelayHandlers {
  onAuthOk?: (accountId: string) => void;
  onBye?: (code: number, error: string) => void;
  onErr?: (code: number, error: string) => void;
  onData?: (from: string, payload: string) => void;
  /** pesan server lain (hosts / joined / remote_joined / remote_left /
   *  host_offline / host_back), role layer berlangganan. */
  onServerMsg?: (msg: ServerMsg) => void;
  onStateChange?: (state: RelayState) => void;
}

/**
 * Satu koneksi websocket terautentikasi ke relay. Bisa dipakai polos, tapi
 * umumnya dibungkus RelayHost / RelayRemote (host.ts / remote.ts).
 *
 * - `connect()` resolve setelah auth_ok PERTAMA.
 * - Putus tak disengaja → reconnect backoff + handshake ulang; `handlers.
 *   onAuthOk` dipanggil ulang (host harus register_host lagi, remote join lagi).
 * - bye 4200/4000/4201/4001 → TIDAK reconnect (permanen).
 * - Pesan saat belum authed ditampung outbox → flush saat auth_ok.
 */
export class RelayClient {
  private ws: WsLike | null = null;
  private state: RelayState = "idle";
  private account: string | null = null;
  private stopped = false;
  private attempt = 0;
  private outbox: ClientMsg[] = [];
  private nonce = "";
  private authWaiters: Array<(accountId: string | ByeMsg) => void> = [];
  private readonly minMs: number;
  private readonly maxMs: number;
  private readonly log: (...args: unknown[]) => void;
  /** Watchdog anti half-open (zombie): terakhir kali ada frame hidup. */
  private lastFrameAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly opts: RelayClientOpts,
    public handlers: RelayHandlers = {},
  ) {
    this.minMs = opts.backoff?.minMs ?? 250;
    this.maxMs = opts.backoff?.maxMs ?? 16_000;
    this.log = opts.log ?? (() => {});
  }

  get deviceId(): string {
    return this.opts.deviceId;
  }
  get accountId(): string | null {
    return this.account;
  }
  get connected(): boolean {
    return this.state === "authed";
  }
  getState(): RelayState {
    return this.state;
  }

  connect(): Promise<string> {
    if (this.state === "authed" && this.account) return Promise.resolve(this.account);
    return new Promise((resolve, reject) => {
      this.authWaiters.push((v) => {
        if (typeof v === "string") resolve(v);
        else reject(new Error(`bye ${v.code}: ${v.error}`));
      });
      this.open(false);
    });
  }

  private setState(s: RelayState): void {
    if (this.state === s) return;
    this.state = s;
    this.handlers.onStateChange?.(s);
  }

  private open(isReconnect: boolean): void {
    if (this.stopped) return;
    this.setState("connecting");
    const ws = this.opts.socketFactory(this.opts.url);
    this.ws = ws;

    ws.onopen = () => {
      // hello dikirim server saat connect, tunggu di onmessage.
      this.log("ws open", { isReconnect });
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return; // socket lama (sudah diganti watchdog)
      this.markAlive();
      if (typeof ev.data !== "string") return;
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data) as ServerMsg;
      } catch {
        this.log("bad frame, ignore");
        return;
      }
      void this.handle(msg);
    };
    ws.onpong = () => {
      if (this.ws !== ws) return;
      this.markAlive();
    };
    ws.onerror = (e) => this.log("ws error", e);
    ws.onclose = (ev) => {
      if (this.ws !== ws) return; // zombie yang sudah diputus watchdog
      const wasAuthed = this.state === "authed";
      this.ws = null;
      this.setState("closed");
      if (this.stopped) return;
      // bye fatal permanen → tidak reconnect (penanganan di handle() bye).
      this.scheduleReconnect(wasAuthed);
    };
    this.startWatchdog();
  }

  private markAlive(): void {
    this.lastFrameAt = Date.now();
  }

  /** Half-open detection: relay ping tiap ~30 dtk → pong menjaga
   * lastFrameAt. Path putus diam-diam (redeploy proxy, NAT hangus) tidak
   * pernah mengirim close ke kita — klien socket Node bisa PING sendiri:
   * bila 3 interval tanpa jawaban apa pun, putus paksa + reconnect. */
  private startWatchdog(): void {
    if (this.watchdog) return;
    const sec = this.opts.keepaliveSec ?? 25;
    if (!sec || typeof this.ws?.ping !== "function") return;
    this.markAlive();
    this.watchdog = setInterval(() => {
      if (this.state !== "authed" || this.stopped) return;
      this.ws?.ping?.();
      if (Date.now() - this.lastFrameAt < sec * 3 * 1000) return;
      this.log("watchdog: relay diam (half-open?), putus paksa + reconnect");
      const old = this.ws;
      this.ws = null;
      this.setState("closed");
      try {
        old?.close(4008, "watchdog dead link");
      } catch {
        /* zombie bisa juga menolak close */
      }
      old?.terminate?.();
      this.scheduleReconnect(true);
    }, sec * 1000);
  }

  private scheduleReconnect(wasAuthed: boolean): void {
    this.attempt++;
    const base = Math.min(this.maxMs, this.minMs * 2 ** Math.min(this.attempt - 1, 6));
    const delay = Math.round(base * (0.5 + Math.random())); // jitter 50–150%
    this.log(`reconnect in ${delay}ms (attempt ${this.attempt}, wasAuthed=${wasAuthed})`);
    setTimeout(() => this.open(true), delay);
  }

  private async handle(msg: ServerMsg): Promise<void> {
    switch (msg.t) {
      case "hello": {
        if (msg.proto > PROTO) {
          // SPEC §3: klien tak mendukung versi relay → bye 4200 + close.
          this.stopped = true; // permanen, jangan reconnect ke server yang sama
          this.sendRaw({ t: "bye", code: ByeCode.PROTO_UNSUPPORTED, error: "proto version unsupported" } as unknown as ClientMsg);
          this.ws?.close();
          this.failAuthWaiters({ t: "bye", code: ByeCode.PROTO_UNSUPPORTED, error: "proto version unsupported" });
          this.handlers.onBye?.(ByeCode.PROTO_UNSUPPORTED, "proto version unsupported");
          return;
        }
        this.nonce = msg.nonce;
        const sig = await this.opts.crypto.signChallenge(this.opts.signPriv, this.opts.deviceId, msg.nonce);
        this.sendRaw({ t: "auth", deviceId: this.opts.deviceId, sig });
        return;
      }
      case "auth_ok": {
        this.attempt = 0;
        this.account = msg.accountId;
        this.setState("authed");
        // flush outbox dulu (urutan pengirim), lalu kabari waiter/handler.
        const box = this.outbox.splice(0);
        for (const m of box) this.sendRaw(m);
        this.handlers.onAuthOk?.(msg.accountId);
        for (const w of this.authWaiters.splice(0)) w(msg.accountId);
        return;
      }
      case "bye": {
        this.log("bye", msg.code, msg.error);
        this.handlers.onBye?.(msg.code, msg.error);
        // 4000 replaced / 4200 proto / 4201 account-limit = permanen (retry
        // tak mengubah apa pun, hanya menambah beban relay); 4001
        // unknown-device is permanent once the device is unlinked from the portal:
        // row device hilang, retry tidak akan pernah berhasil.
        // Lainnya transien → reconnect backoff + handshake ulang (SPEC §10),
        // role layer register/join ulang.
        if (
          msg.code === ByeCode.REPLACED ||
          msg.code === ByeCode.PROTO_UNSUPPORTED ||
          msg.code === ByeCode.ACCOUNT_LIMIT ||
          msg.code === ByeCode.UNKNOWN_DEVICE
        ) {
          this.stopped = true;
          this.failAuthWaiters(msg);
        }
        this.ws?.close();
        return;
      }
      case "err":
        this.handlers.onErr?.(msg.code, msg.error);
        return;
      case "data":
        this.handlers.onData?.(msg.from, msg.payload);
        return;
      default:
        this.handlers.onServerMsg?.(msg);
    }
  }

  private failAuthWaiters(msg: ByeMsg): void {
    for (const w of this.authWaiters.splice(0)) w(msg);
  }

  /** Kirim pesan C→S (pasca-auth; sebelum auth → masuk outbox). */
  send(msg: ClientMsg): void {
    const raw = JSON.stringify(msg);
    if (raw.length > MAX_FRAME) throw new Error(`frame too large: ${raw.length} > ${MAX_FRAME}`);
    if (this.state === "authed") this.sendRaw(msg);
    else this.outbox.push(msg);
  }

  private sendRaw(msg: ClientMsg): void {
    this.ws?.send(JSON.stringify(msg));
  }

  /** Tutup disengaja, tanpa reconnect. */
  close(): void {
    this.stopped = true;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    this.ws?.close(1000, "client close");
    this.ws = null;
    this.setState("closed");
  }
}

/** rid pendek untuk korelasi action↔event (CONTRACTS §1). */
export function newRid(): string {
  return `r_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
