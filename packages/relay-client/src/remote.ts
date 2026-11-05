// @yuika/relay-client — RelayRemote: peran remote (list_hosts, join, kirim
// action, terima event, antrian saat host offline / reconnect).
import { RemoteEvent, type RemoteAction } from "@yuika/contracts";
import type { RelayClient, RelayHandlers } from "./core.js";
import { ByeCode, type HostEntry, type JoinedMsg } from "./wire.js";

export type RemoteHostState = "idle" | "joining" | "joined" | "host-offline" | "host-gone";

export interface RelayRemoteOpts {
  client: RelayClient;
  deviceId: string;
  dhPriv: string;
  dhPub: string;
  /** Event dari host (payload sudah dibuka & diparse). */
  onEvent: (ev: RemoteEvent, fromHostId: string) => void;
  onHostState?: (state: RemoteHostState, hostId: string | null) => void;
  log?: (...args: unknown[]) => void;
}

/**
 * Peran remote di atas satu RelayClient:
 * - `listHosts()` → daftar host online akun yang sama (UI pilih host).
 * - `join(hostId)` → kirim dhPub; `joined` menyimpan hostDhPub (kunci seal).
 *   Sticky (SPEC §4.6): host putus → `host_offline` (tahan `stickyMs`);
 *   action masuk antrian; `host_back` → flush antrian.
 *   Remote reconnect saat host offline → join ditolak 4104 → retry backoff
 *   hingga `joinRetryMaxMs` (default 30 s) lalu state 'host-gone'.
 * - `sendAction(action)` seal ke host (antrian bila belum joined/offline).
 */
export class RelayRemote {
  private hostId: string | null = null;
  private hostDhPub = "";
  private hostState: RemoteHostState = "idle";
  private queue: RemoteAction[] = [];
  private joinWaiter: ((res: JoinedMsg | { error: string; code?: number }) => void) | null = null;
  private readonly log: (...args: unknown[]) => void;

  constructor(readonly opts: RelayRemoteOpts) {
    this.log = opts.log ?? (() => {});
    const prev = opts.client.handlers;
    opts.client.handlers = this.wrap(prev);
  }

  get joinedHostId(): string | null {
    return this.hostId;
  }
  get state(): RemoteHostState {
    return this.hostState;
  }

  listHosts(): Promise<HostEntry[]> {
    this.opts.client.send({ t: "list_hosts" });
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve([]), 8_000);
      this.hostsWaiters.push((hosts) => {
        clearTimeout(t);
        resolve(hosts);
      });
    });
  }

  private hostsWaiters: Array<(hosts: HostEntry[]) => void> = [];

  async join(hostId: string, retryMaxMs = 30_000): Promise<JoinedMsg> {
    if (this.hostState === "joined" && this.hostId === hostId && this.hostDhPub) {
      // idempotent — SPEC §4.3 (join ulang host sama = joined lagi tanpa duplikat)
      this.opts.client.send({ t: "join", hostId, dhPub: this.opts.dhPub });
      return { t: "joined", hostId, hostName: "", hostKind: "web", hostDhPub: this.hostDhPub };
    }
    const deadline = Date.now() + retryMaxMs;
    for (;;) {
      this.setState("joining");
      this.opts.client.send({ t: "join", hostId, dhPub: this.opts.dhPub });
      const res = await this.waitJoined();
      if ("t" in res && res.t === "joined") {
        this.hostId = res.hostId;
        this.hostDhPub = res.hostDhPub;
        this.setState("joined");
        this.flush();
        return res;
      }
      // 4104 host-not-online → bye menutup koneksi; RelayClient reconnect +
      // flush outbox saat auth_ok — tunggu, lalu coba join ulang (backoff).
      // Bye join LAIN (4003 lintas akun, 4102 field invalid, 4200…) permanen:
      // retry tidak mengubah hasil — terminal segera (SPEC §10, CP-1/CP-2).
      if ("code" in res && res.code !== undefined && res.code !== ByeCode.HOST_NOT_ONLINE) {
        this.setState("host-gone");
        throw new Error(res.error);
      }
      if (Date.now() > deadline) {
        this.setState("host-gone");
        throw new Error("error" in res ? res.error : "join failed");
      }
      await sleep(Math.min(1_000, Math.max(250, deadline - Date.now())));
    }
  }

  private waitJoined(): Promise<JoinedMsg | { error: string; code?: number }> {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve({ error: "join timeout" }), 8_000);
      this.joinWaiter = (res) => {
        clearTimeout(t);
        resolve(res);
      };
    });
  }

  private setState(s: RemoteHostState): void {
    if (this.hostState === s) return;
    this.hostState = s;
    this.opts.onHostState?.(s, this.hostId);
  }

  private wrap(prev: RelayHandlers): RelayHandlers {
    return {
      ...prev,
      onAuthOk: (accountId) => {
        prev.onAuthOk?.(accountId);
        // reconnect: join ulang idempotent (host online) — SPEC §10.
        if (this.hostId) {
          this.opts.client.send({ t: "join", hostId: this.hostId, dhPub: this.opts.dhPub });
          this.setState("joining");
        }
      },
      onBye: (code, error) => {
        prev.onBye?.(code, error);
        // join gagal fatal (mis. 4003 lintas akun / 4102 dhPub invalid) →
        // penuhi waiter DENGAN code — layer join memutuskan retry vs terminal.
        const w = this.joinWaiter;
        this.joinWaiter = null;
        w?.({ error: `bye ${code}: ${error}`, code });
      },
      onServerMsg: (msg) => {
        prev.onServerMsg?.(msg);
        switch (msg.t) {
          case "hosts": {
            for (const w of this.hostsWaiters.splice(0)) w(msg.hosts);
            break;
          }
          case "joined": {
            const w = this.joinWaiter;
            this.joinWaiter = null;
            w?.(msg);
            break;
          }
          case "host_offline":
            // sticky window: tetap menempel; action ditahan di antrian.
            this.setState("host-offline");
            break;
          case "host_back":
            this.setState("joined");
            this.flush();
            break;
          default:
            break;
        }
      },
      onData: async (from, payload) => {
        if (from !== this.hostId) return;
        try {
          const pt = await this.opts.client.opts.crypto.open(
            { deviceId: this.opts.deviceId, dhPriv: this.opts.dhPriv },
            { deviceId: from, dhPub: this.hostDhPub },
            payload,
          );
          const parsed = RemoteEvent.safeParse(JSON.parse(pt));
          if (parsed.success) this.opts.onEvent(parsed.data, from);
          else this.log("event tak sesuai kontrak — diabaikan");
        } catch (e) {
          this.log("gagal buka envelope dari host", e);
        }
      },
    };
  }

  /** Kirim action ke host (seal E2E). Antrian bila host offline/belum join. */
  async sendAction(action: RemoteAction): Promise<void> {
    if (this.hostState !== "joined" || !this.hostId) {
      this.queue.push(action);
      return;
    }
    const box = await this.opts.client.opts.crypto.seal(
      { deviceId: this.opts.deviceId, dhPriv: this.opts.dhPriv },
      { deviceId: this.hostId, dhPub: this.hostDhPub },
      JSON.stringify(action),
    );
    this.opts.client.send({ t: "data", payload: box });
  }

  private flush(): void {
    const q = this.queue.splice(0);
    for (const a of q) void this.sendAction(a);
  }

  close(): void {
    this.queue.length = 0;
    this.opts.client.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
