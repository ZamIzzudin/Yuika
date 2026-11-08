// @yuika/api, web presence worker.
// A lightweight relay connection using the WEB device identity (from SSO
// auto-link) without RelayHost (no incoming actions): its purpose is
// presence (shown ONLINE on the portal Devices page) plus the bye 4001 channel.
//
// bye 4001 (UNKNOWN_DEVICE) = the device was unlinked from the portal:
//   1. hentikan presence (SDK sudah stopped, tidak reconnect),
//   2. drop the web_device row (the next login auto-links again
//      via deviceToken),
//   3. sign out every web session of that portal account (portal-side
//      access was revoked, so the studio side follows).
import { RelayClient } from "@yuika/relay-client";
import { ByeCode } from "@yuika/relay-client";
import { nodeSocket } from "@yuika/relay-client/node";
import { clearWebDevice, type HostDeviceRecord } from "./store.js";
import { signOutPortalAccount } from "../auth/store.js";

export interface WebPresenceStatus {
  deviceId: string | null;
  state: "offline" | "connecting" | "authed";
}

export class WebPresenceService {
  private client: RelayClient | null = null;
  private record: HostDeviceRecord | null = null;
  /** Guard: bye 4001 means unlink ONLY if the connection was authed before
   *  (the device was known, then deleted). 4001 on the FIRST auth = the relay
   *  never knew the device (env mismatch / another relay): stop quietly, do
   *  NOT revoke sessions; retry on the next boot/login. */
  private everAuthed = false;

  get running(): boolean {
    return !!this.client;
  }

  /** Mulai presence (idempotent per deviceId). Tidak melempar, kegagalan
   *  koneksi ditangani SDK (retry backoff); caller boleh fire-and-forget. */
  async start(record: HostDeviceRecord): Promise<void> {
    if (this.client && this.record?.deviceId === record.deviceId) return;
    await this.stop();
    this.record = record;
    this.everAuthed = false;
    const client = new RelayClient(
      {
        url: record.relayUrl,
        deviceId: record.deviceId,
        signPriv: record.signPriv,
        crypto: {
          signChallenge: async (p, d, n) => (await import("@yuika/crypto")).signChallenge(p, d, n),
          seal: async (f, t, pt) => (await import("@yuika/crypto")).seal(f, t, pt),
          open: async (t, f, b) => (await import("@yuika/crypto")).open(t, f, b).toString("utf8"),
        },
        socketFactory: nodeSocket,
        backoff: { minMs: 1_000, maxMs: 30_000 },
        log: (...a) => console.log("[web-presence]", ...a),
      },
      { onAuthOk: () => { this.everAuthed = true; }, onBye: (code, error) => this.onBye(code, error) },
    );
    this.client = client;
    try {
      await client.connect();
      console.log(`[web-presence] online sebagai ${record.deviceId} (akun ${record.accountId})`);
    } catch {
      // permanen (connect() melempar hanya utk bye fatal), bersihkan state.
      this.client = null;
      this.record = null;
    }
  }

  private onBye(code: number, error: string): void {
    if (code !== ByeCode.UNKNOWN_DEVICE) return;
    const accountId = this.record?.accountId;
    this.client?.close();
    this.client = null;
    this.record = null;
    if (!this.everAuthed) {
      // Relay ini tak pernah mengenal device (relay lain / db kosong), bukan
      // unlink: cukup berhenti, sesi & row tetap utuh.
      console.warn(`[web-presence] relay tidak mengenal device (bye 4001: ${error}), presence dimatikan tanpa mencabut sesi`);
      return;
    }
    console.warn(`[web-presence] device web di-unlink dari portal (bye 4001: ${error}), sesi dicabut, login ulang akan auto-link`);
    clearWebDevice();
    if (accountId) signOutPortalAccount(accountId);
  }

  async stop(): Promise<void> {
    this.client?.close();
    this.client = null;
    this.record = null;
    this.everAuthed = false;
  }

  status(): WebPresenceStatus {
    if (!this.client || !this.record) return { deviceId: null, state: "offline" };
    const s = this.client.getState();
    return {
      deviceId: this.record.deviceId,
      state: s === "authed" ? "authed" : "connecting",
    };
  }
}

// ── singleton proses api ────────────────────────────────────────────────────

const g = globalThis as unknown as { __yuiWebPresence?: WebPresenceService };

export function getWebPresence(): WebPresenceService {
  g.__yuiWebPresence ??= new WebPresenceService();
  return g.__yuiWebPresence;
}
