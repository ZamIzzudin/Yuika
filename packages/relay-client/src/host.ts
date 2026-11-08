// @yuika/relay-client, RelayHost: peran host (register_host, kelola remote,
// seal event per-recipient). Dipakai apps/api (host worker) & Tauri nanti.
import { RemoteAction, type RemoteEvent } from "@yuika/contracts";
import type { RelayClient, RelayHandlers } from "./core.js";
import type { HostEntry, RemoteJoinedMsg } from "./wire.js";

export interface RemoteInfo {
  deviceId: string;
  kind: HostEntry["kind"];
  name: string;
  dhPub: string;
}

type HostReadyWaiter = (hostId: string | null, err?: string) => void;

export interface RelayHostOpts {
  client: RelayClient;
  dhPriv: string;
  deviceId: string;
  /** Dipanggil tiap action dari remote (payload SUDAH dibuka & diparse). */
  onAction: (from: RemoteInfo, action: RemoteAction) => void;
  /** Perubahan daftar remote (badge "N remote connected"). */
  onRemotes?: (remotes: Map<string, RemoteInfo>) => void;
  log?: (...args: unknown[]) => void;
}

/**
 * Peran host di atas satu RelayClient:
 * - tiap auth_ok → `register_host` (reconnect = replace + batch remote_joined,
 *   SPEC §4.1) → host_ready.
 * - `remote_joined`/`remote_left` menjaga map remote (kunci seal).
 * - `sendEvent(to|'all', ev)` → envelope E2E per-recipient (box tak bisa
 *   dibuka remote lain, broadcast = N box, SPEC §5.4).
 * - action masuk dibuka + parse zod; unknown act → error unknown_action.
 */
export class RelayHost {
  readonly remotes = new Map<string, RemoteInfo>();
  private ready = false;
  private readonly log: (...args: unknown[]) => void;

  constructor(readonly opts: RelayHostOpts) {
    this.log = opts.log ?? (() => {});
    const prev = opts.client.handlers;
    opts.client.handlers = this.wrap(prev);
  }

  /** Pasang setelah konstruktor (handlers dirantai). resolve saat host_ready. */
  async register(): Promise<string> {
    this.opts.client.send({ t: "register_host" });
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("host_ready timeout")), 10_000);
      this.readyWaiters.push((hostId, err) => {
        clearTimeout(t);
        if (err) reject(new Error(err));
        else resolve(hostId!);
      });
    });
  }

  private readyWaiters: HostReadyWaiter[] = [];

  private wrap(prev: RelayHandlers): RelayHandlers {
    return {
      ...prev,
      onAuthOk: (accountId) => {
        prev.onAuthOk?.(accountId);
        // reconnect/re-auth: register ulang (replace otomatis, SPEC §4.1).
        this.ready = false;
        this.opts.client.send({ t: "register_host" });
      },
      onServerMsg: (msg) => {
        prev.onServerMsg?.(msg);
        switch (msg.t) {
          case "host_ready":
            this.ready = true;
            for (const w of this.readyWaiters.splice(0)) w(msg.hostId);
            break;
          case "remote_joined": {
            const rj = msg as RemoteJoinedMsg;
            this.remotes.set(rj.deviceId, { deviceId: rj.deviceId, kind: rj.kind, name: rj.name, dhPub: rj.dhPub });
            this.log("remote_joined", rj.deviceId, `(${this.remotes.size} total)`);
            this.opts.onRemotes?.(this.remotes);
            break;
          }
          case "remote_left":
            this.remotes.delete(msg.deviceId);
            this.log("remote_left", msg.deviceId, `(${this.remotes.size} total)`);
            this.opts.onRemotes?.(this.remotes);
            break;
          default:
            break;
        }
      },
      onData: async (from, payload) => {
        const remote = this.remotes.get(from);
        if (!remote) {
          this.log("data dari device tak terdaftar", from);
          return;
        }
        try {
          const plaintext = await this.opts.client.opts.crypto.open(
            { deviceId: this.opts.deviceId, dhPriv: this.opts.dhPriv },
            { deviceId: from, dhPub: remote.dhPub },
            payload,
          );
          const parsed = RemoteAction.safeParse(JSON.parse(plaintext));
          if (parsed.success) this.opts.onAction(remote, parsed.data);
          else {
            // CONTRACTS §6: unknown act → error unknown_action (korelasi rid bila ada).
            const raw = JSON.parse(plaintext) as { rid?: string };
            await this.sendEvent(from, {
              proto: 1, ev: "error", ...(raw.rid ? { rid: raw.rid } : {}),
              code: "unknown_action", message: "action tidak dikenal kontrak v1",
            });
          }
        } catch (e) {
          this.log("gagal buka envelope dari", from, e);
        }
      },
    };
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** Kirim RemoteEvent ke satu remote ('to') atau SEMUA remote yang menempel. */
  async sendEvent(to: string | "all", ev: RemoteEvent): Promise<void> {
    const targets = to === "all" ? [...this.remotes.keys()] : [to];
    for (const deviceId of targets) {
      const remote = this.remotes.get(deviceId);
      if (!remote) continue;
      const box = await this.opts.client.opts.crypto.seal(
        { deviceId: this.opts.deviceId, dhPriv: this.opts.dhPriv },
        { deviceId, dhPub: remote.dhPub },
        JSON.stringify(ev),
      );
      this.opts.client.send({ t: "data", payload: box, to: deviceId });
    }
  }
}
