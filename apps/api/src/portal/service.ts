// @yuika/api, P1-PRT-3: portal host worker.
// Memegang koneksi relay sebagai HOST (proses apps/api, bukan browser):
// host online tanpa tab terbuka; Tauri nanti memakai kode yang sama.
//
// RemoteAction → runtime (re-use jalur yang dipakai route web, CONTRACTS §5):
//   send_prompt → rt.runTurn (sesi baru = rt.createSession, id asli
//                 dikabarkan balik via session.snapshot{rid})
//   steer/cancel → steerDelegation / cancelTurn
//   approve/reject → resolveApproval  · list_sessions → listRecentSessions
//   subscribe/unsubscribe {sinceSeq} → bus YuiEvent → envelope per-recipient
//   ping_host → pong_host
// YuiEvent → RemoteEvent (proyeksi + seq per sesi + ring buffer resume).
import type { YuiRuntime } from "@yuika/core";
import type { RemoteAction, RemoteEvent, YuiEvent } from "@yuika/contracts";
import {
  RelayClient,
  RelayHost,
  type RemoteInfo,
} from "@yuika/relay-client";
import { ByeCode } from "@yuika/relay-client";
import { nodeSocket } from "@yuika/relay-client/node";
import { clearHostDevice } from "./store.js";
import { getScreenState, listScreens, subscribeScreen } from "./screen-bridge.js";
import type { HostDeviceRecord } from "./store.js";

const RING_CAP = 500; // event terakhir per sesi, resume delta subscribe{sinceSeq}
const SNAPSHOT_MSGS = 50;

/** SCR-7: interval pump frame remote-watch (default 1000ms = 1fps;
 *  env YUI_REMOTE_SCREEN_MS, floor 250ms). */
function remoteScreenPumpMs(): number {
  return Math.max(250, Number(process.env.YUI_REMOTE_SCREEN_MS ?? 1_000) || 1_000);
}
/** Muat aman di bawah MAX_FRAME wire (262 144 B) setelah seal + JSON. */
const REMOTE_FRAME_MAX = 200_000;

/** Satu remote menonton satu screen (v0, ganti = unsubscribe lama otomatis). */
interface ScreenWatch {
  key: string;
  latest: { data: string; width: number; height: number; ts: number } | null;
  sent: string;
  timer: NodeJS.Timeout;
  unsubscribe: () => void;
}

export interface PortalStatus {
  linked: boolean;
  accountId: string | null;
  deviceId: string | null;
  relayUrl: string | null;
  relayState: "offline" | "connecting" | "authed" | "closed";
  remotes: Array<{ deviceId: string; kind: string; name: string }>;
  /** CP-5: alasan terakhir worker berhenti, "unlinked" = device dihapus
   *  dari portal (bye 4001), BUKAN error jaringan; UI mengarahkan pairing ulang. */
  note?: "unlinked";
}

interface RingEntry { seq: number; ev: RemoteEvent }

function riskOf(tool: string): "low" | "medium" | "high" {
  if (/^(run_command|exec|shell)/.test(tool)) return "high";
  if (/^(write_file|delete_file|web_fetch)/.test(tool)) return "medium";
  return "medium";
}

/** Proyeksi YuiEvent → RemoteEvent (null = tidak diteruskan ke remote v0). */
function project(e: YuiEvent, seq: number): RemoteEvent[] {
  switch (e.type) {
    case "message.delta":
      return [{ proto: 1, ev: "message.delta", sessionId: e.sessionId, seq, delta: e.delta }];
    case "message.done":
      return [{ proto: 1, ev: "message.done", sessionId: e.sessionId, seq, finish: "stop" }];
    case "turn.cancelled":
      return [{ proto: 1, ev: "message.done", sessionId: e.sessionId, seq, finish: "cancelled" }];
    case "session.error":
      return [
        { proto: 1, ev: "message.done", sessionId: e.sessionId, seq, finish: "error" },
        { proto: 1, ev: "error", code: "session_error", message: e.message },
      ];
    case "approval.requested":
      return [{
        proto: 1, ev: "approval.request", sessionId: e.sessionId, approvalId: e.requestId,
        title: e.tool, summary: `${e.reason}, ${JSON.stringify(e.args).slice(0, 140)}`,
        risk: riskOf(e.tool),
      }];
    case "approval.resolved":
      return [{ proto: 1, ev: "approval.resolved", approvalId: e.requestId, resolution: e.approved ? "approved" : "rejected" }];
    case "approval.expired":
      return [{ proto: 1, ev: "approval.resolved", approvalId: e.requestId, resolution: "timeout" }];
    case "delegation.started":
      return [{ proto: 1, ev: "delegation.update", sessionId: e.sessionId, jobId: e.childSessionId, state: "started", detail: e.goal.slice(0, 160) }];
    case "delegation.progress":
      return [{ proto: 1, ev: "delegation.update", sessionId: e.sessionId, jobId: e.childSessionId, state: "progress" }];
    case "delegation.done":
      return [{ proto: 1, ev: "delegation.update", sessionId: e.sessionId, jobId: e.childSessionId, state: "done" }];
    case "delegation.paused":
      return [{ proto: 1, ev: "delegation.update", sessionId: e.sessionId, jobId: e.childSessionId, state: "paused" }];
    case "delegation.resumed":
      return [{ proto: 1, ev: "delegation.update", sessionId: e.sessionId, jobId: e.childSessionId, state: "progress" }];
    default:
      return []; // reasoning.delta, tool.*, memory.noted, persona.state, …, v0 dilewati
  }
}

export class PortalHostService {
  private client: RelayClient | null = null;
  private host: RelayHost | null = null;
  private rt: YuiRuntime | null = null;
  private record: HostDeviceRecord | null = null;
  private seq = new Map<string, number>(); // sessionId → seq terakhir
  private ring = new Map<string, RingEntry[]>();
  private remoteSubs = new Map<string, Set<string>>(); // remoteDeviceId → sessionIds
  /** SCR-7: remoteDeviceId → screen watch aktif (1 per remote, v0). */
  private screenWatches = new Map<string, ScreenWatch>();
  private known = new Set<string>(); // session id yang pernah divalidasi/dibuat
  private unsubAll: (() => void) | null = null;
  private introSent = new Set<string>();
  /** CP-5: bye 4001 terakhir (untuk note status, jaring ≠ unlinked). */
  private unlinkedAt = 0;

  get running(): boolean {
    return !!this.host;
  }

  /** CP-5: bye 4001 (UNKNOWN_DEVICE) = device di-unlink dari portal →
   *  permanen: hentikan loop, hapus row host_device (pairing ulang),
   *  status menampilkan "unlinked", bukan error jaringan generik. */
  private onHostBye(code: number, error: string): void {
    if (code !== ByeCode.UNKNOWN_DEVICE) return;
    console.warn(`[portal-host] device di-unlink dari portal (bye 4001: ${error}), berhenti, pairing ulang diperlukan`);
    this.unlinkedAt = Date.now();
    void this.stop();
    clearHostDevice();
  }

  /** Mulai worker (idempotent). Pair route memanggil ini setelah save. */
  async start(rt: YuiRuntime, record: HostDeviceRecord): Promise<void> {
    if (this.host && this.record?.deviceId === record.deviceId) return;
    await this.stop();
    this.rt = rt;
    this.record = record;
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
        backoff: { minMs: 500, maxMs: 16_000 },
        log: (...a) => console.log("[portal-host]", ...a),
      },
      { onBye: (code, error) => this.onHostBye(code, error) },
    );
    const host = new RelayHost({
      client,
      deviceId: record.deviceId,
      dhPriv: record.dhPriv,
      onAction: (from, action) => void this.dispatch(from, action).catch((e) =>
        console.error("[portal-host] action gagal:", e)),
      onRemotes: (remotes) => {
        // remote pergi → berhenti kirim sesi langganannya + stop watch screen
        for (const id of [...this.remoteSubs.keys()]) {
          if (!remotes.has(id)) this.remoteSubs.delete(id);
        }
        for (const id of [...this.screenWatches.keys()]) {
          if (!remotes.has(id)) this.stopWatch(id);
        }
        // remote BARU menempel → kirim host.state (CONTRACTS §3: intro roster)
        for (const id of remotes.keys()) {
          if (!this.introSent.has(id)) {
            this.introSent.add(id);
            void host.sendEvent(id, {
              proto: 1, ev: "host.state",
              sessions: this.rt!.listRecentSessions(20),
              screens: listScreens().map((s) => ({
                key: s.key, personaId: s.personaId, url: s.url, title: s.title,
                status: s.status, viewers: s.viewers, watchers: s.watchers,
              })),
            }).catch(() => undefined);
          }
        }
      },
    });
    this.client = client;
    this.host = host;
    await client.connect();
    await host.register();
    // bus global (EventBus "*"): approval/delegation dari sesi APAPUN (termasuk
    // turn yang dimulai dari web UI) tetap sampai ke remote.
    this.unsubAll = rt.subscribeAll((e) => this.onYuiEvent(e.sessionId, e));
    console.log(`[portal-host] online sebagai ${record.deviceId} (akun ${record.accountId})`);
  }

  async stop(): Promise<void> {
    this.unsubAll?.();
    this.unsubAll = null;
    this.remoteSubs.clear();
    for (const id of [...this.screenWatches.keys()]) this.stopWatch(id);
    this.client?.close();
    this.client = null;
    this.host = null;
    this.record = null;
    this.rt = null;
  }

  status(): PortalStatus {
    const rec = this.record;
    const note: PortalStatus["note"] = Date.now() - this.unlinkedAt < 5 * 60_000 ? "unlinked" : undefined;
    if (!rec || !this.host) {
      return { linked: !!rec, accountId: rec?.accountId ?? null, deviceId: rec?.deviceId ?? null, relayUrl: rec?.relayUrl ?? null, relayState: "offline", remotes: [], ...(note ? { note } : {}) };
    }
    const s = this.client!.getState();
    return {
      linked: true,
      accountId: rec.accountId,
      deviceId: rec.deviceId,
      relayUrl: rec.relayUrl,
      relayState: (s === "idle" || s === "connecting" ? "connecting" : s === "authed" ? "authed" : "closed") as PortalStatus["relayState"],
      remotes: [...this.host.remotes.values()].map((r) => ({ deviceId: r.deviceId, kind: r.kind, name: r.name })),
      ...(note ? { note } : {}),
    };
  }

  // ── proyeksi bus → ring + broadcast ──────────────────────────────────────

  private onYuiEvent(sessionId: string, e: YuiEvent): void {
    const nextSeq = (this.seq.get(sessionId) ?? 0) + 1;
    this.seq.set(sessionId, nextSeq);
    for (const ev of project(e, nextSeq)) {
      if ("seq" in ev) {
        const r = this.ring.get(sessionId) ?? [];
        r.push({ seq: ev.seq, ev });
        if (r.length > RING_CAP) r.splice(0, r.length - RING_CAP);
        this.ring.set(sessionId, r);
      }
      // delta/done → hanya remote yang subscribe sesi ini; approval/delegation
      // → semua remote (keputusan user-level, mission-control style).
      void this.broadcast(ev, sessionId).catch(() => undefined);
    }
  }

  private async broadcast(ev: RemoteEvent, sessionId?: string): Promise<void> {
    if (!this.host) return;
    const sessionless = ev.ev === "approval.request" || ev.ev === "approval.resolved" || ev.ev === "delegation.update";
    const targets: string[] = [];
    for (const [rid, sessions] of this.remoteSubs) {
      if (sessionless || sessions.has(sessionId ?? "")) targets.push(rid);
    }
    for (const rid of targets) {
      await this.host.sendEvent(rid, ev);
    }
  }

  // ── dispatch RemoteAction → runtime (jalur sama dengan route web) ────────

  private async dispatch(from: RemoteInfo, action: RemoteAction): Promise<void> {
    const rt = this.rt!;
    const host = this.host!;
    const reply = (ev: RemoteEvent) => host.sendEvent(from.deviceId, ev);
    const err = (code: string, message: string, rid?: string) =>
      reply({ proto: 1, ev: "error", ...(rid ? { rid } : {}), code, message });

    switch (action.act) {
      case "ping_host":
        return void reply({ proto: 1, ev: "pong_host", rid: action.rid });
      case "list_sessions":
        return void reply({ proto: 1, ev: "session.list", rid: action.rid, sessions: rt.listRecentSessions(20) });
      case "send_prompt": {
        let sid = action.sessionId;
        if (!this.known.has(sid)) {
          // sesi tak dikenal: buat baru (id asli dikabarkan via snapshot).
          const personaId = action.personaId;
          if (!personaId) return void err("unknown_session", "session tidak dikenal dan personaId tidak diisi", action.rid);
          try {
            sid = rt.createSession(personaId).sessionId;
            this.known.add(sid);
          } catch (e) {
            return void err("bad_persona", e instanceof Error ? e.message : String(e), action.rid);
          }
        }
        this.track(from.deviceId, sid);
        // snapshot duluan (id asli + transcript), lalu turn jalan (fire-and-forget
        // seperti POST /api/sessions/:id/message).
        await this.sendSnapshot(from.deviceId, sid, action.rid);
        void rt.runTurn(sid, action.message).catch((e: unknown) =>
          rt.emitSessionError(sid, e instanceof Error ? e.message : String(e)));
        return;
      }
      case "steer": {
        const ok = rt.steerDelegation(action.sessionId, action.note);
        if (!ok) return void err("steer_unavailable", "tidak ada delegasi aktif untuk sesi itu", action.rid);
        return;
      }
      case "cancel":
        rt.cancelTurn(action.sessionId);
        return;
      case "approve":
      case "reject": {
        const ok = rt.resolveApproval(action.approvalId, action.act === "approve");
        if (!ok) return void err("unknown_approval", "approval tidak dikenal / sudah selesai", action.rid);
        return;
      }
      case "subscribe": {
        for (const sid of action.sessions) {
          this.known.add(sid);
          this.track(from.deviceId, sid);
          const since = action.sinceSeq?.[sid] ?? 0;
          await this.sendSnapshot(from.deviceId, sid, action.rid);
          for (const entry of this.ring.get(sid) ?? []) {
            if (entry.seq > since) await reply(entry.ev);
          }
        }
        return;
      }
      case "unsubscribe": {
        for (const sid of action.sessions) {
          this.remoteSubs.get(from.deviceId)?.delete(sid);
        }
        return;
      }
      case "watch_screen":
        return void this.startWatch(from, action.key, action.rid);
      case "unwatch_screen": {
        // key dari watch aktif (contract unwatch tak bawa key, v0 satu watch per remote)
        const key = this.screenWatches.get(from.deviceId)?.key ?? null;
        this.stopWatch(from.deviceId);
        // ack ber-rid (aturan CONTRACTS §1): state TERAKHIR screen yang ditinggalkan.
        const st = key ? getScreenState(key) : null;
        if (st) {
          return void reply({
            proto: 1, ev: "screen.state", rid: action.rid, key: st.key, url: st.url, title: st.title,
            status: st.status, viewers: st.viewers, watchers: st.watchers, leaseOwner: st.leaseOwner,
          });
        }
        return void reply({ proto: 1, ev: "error", rid: action.rid, code: "unknown_screen", message: "no active screen session" });
      }
    }
  }

  // ── SCR-7: remote watch live screen (read-only, ~1fps) ────────────────

  private startWatch(from: RemoteInfo, key: string, rid: string): void {
    const host = this.host!;
    const state = getScreenState(key);
    if (!state) {
      void host.sendEvent(from.deviceId, {
        proto: 1, ev: "error", rid,
        code: "unknown_screen", message: `no active screen session for ${key}`,
      });
      return;
    }
    this.stopWatch(from.deviceId); // satu watch per remote (v0)
    const remoteId = from.deviceId;
    const watch: ScreenWatch = {
      key,
      latest: null,
      sent: "",
      timer: null as unknown as NodeJS.Timeout,
      unsubscribe: () => undefined,
    };
    // subscriber frame = VIEWER sesi (semantik sama QA watcher): sesi tetap
    // hidup selama ada yang menonton dari jauh; frame hanya dipompa 1fps.
    const sub = subscribeScreen(
      key,
      (f) => { watch.latest = { data: f.data, width: f.width, height: f.height, ts: f.ts }; },
      (s) => {
        void host.sendEvent(remoteId, {
          proto: 1, ev: "screen.state", key: s.key, url: s.url, title: s.title,
          status: s.status, viewers: s.viewers, watchers: s.watchers, leaseOwner: s.leaseOwner,
        }).catch(() => undefined);
      },
    );
    if (!sub) {
      void host.sendEvent(from.deviceId, {
        proto: 1, ev: "error", rid, code: "unknown_screen", message: `no active screen session for ${key}`,
      });
      return;
    }
    watch.unsubscribe = sub.unsubscribe;
    const pump = () => {
      const f = watch.latest;
      if (!f || f.data === watch.sent || f.data.length > REMOTE_FRAME_MAX) return;
      watch.sent = f.data;
      void host.sendEvent(remoteId, {
        proto: 1, ev: "screen.frame", key,
        data: f.data, width: f.width, height: f.height, ts: f.ts,
      }).catch(() => undefined);
    };
    watch.timer = setInterval(pump, remoteScreenPumpMs());
    watch.timer.unref?.();
    this.screenWatches.set(remoteId, watch);
    // jawaban rid: state awal (frame pertama menyusul via pump ≤1 detik)
    void host.sendEvent(remoteId, {
      proto: 1, ev: "screen.state", rid,
      key: state.key, url: state.url, title: state.title,
      status: state.status, viewers: state.viewers, watchers: state.watchers, leaseOwner: state.leaseOwner,
    }).catch(() => undefined);
  }

  private stopWatch(remoteId: string): void {
    const w = this.screenWatches.get(remoteId);
    if (!w) return;
    clearInterval(w.timer);
    w.unsubscribe();
    this.screenWatches.delete(remoteId);
  }

  private track(remoteDeviceId: string, sessionId: string): void {
    let set = this.remoteSubs.get(remoteDeviceId);
    if (!set) {
      set = new Set();
      this.remoteSubs.set(remoteDeviceId, set);
    }
    set.add(sessionId);
  }

  private async sendSnapshot(toRemote: string, sessionId: string, rid?: string): Promise<void> {
    const rt = this.rt!;
    const msgs = rt.store.getMessages(sessionId).slice(-SNAPSHOT_MSGS).map((m) => ({
      role: (m.role === "user" || m.role === "assistant" ? m.role : "tool") as "user" | "assistant" | "tool",
      text: m.content,
      at: 0, // InternalMessage tak membawa timestamp (urutan array sudah kronologis)
    }));
    await this.host!.sendEvent(toRemote, {
      proto: 1, ev: "session.snapshot",
      ...(rid ? { rid } : {}),
      sessionId, messages: msgs,
      latestSeq: this.seq.get(sessionId) ?? 0,
    });
  }
}

// ── singleton proses api ────────────────────────────────────────────────────

const g = globalThis as unknown as { __yuiPortalHost?: PortalHostService };

export function getPortalHost(): PortalHostService {
  g.__yuiPortalHost ??= new PortalHostService();
  return g.__yuiPortalHost;
}

export function defaultPortalUrl(): string {
  return process.env.YUI_PORTAL_URL || "http://localhost:3100";
}
export function defaultRelayUrl(): string {
  return process.env.YUI_RELAY_URL || "ws://localhost:3101";
}
