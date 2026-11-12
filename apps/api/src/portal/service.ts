// @yuika/api, : portal host worker.
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
import {
  ensureTerminalSession,
  listTerminalSessions,
  subscribeTerminal,
  writeTerminalInput,
} from "@yuika/core";
import { UpdateBudgetRequest, type RemoteAction, type RemoteEvent, type YuiEvent } from "@yuika/contracts";
import { MAX_UPLOAD, sanitizeUploadName } from "../upload-util.js";
import { UploadAssembler } from "./upload-acc.js";
import {
  RelayClient,
  RelayHost,
  type RemoteInfo,
} from "@yuika/relay-client";
import { ByeCode } from "@yuika/relay-client";
import { nodeSocket } from "@yuika/relay-client/node";
import { clearHostDevice, clearWebDevice } from "./store.js";
import { getScreenState, listScreens, subscribeScreen } from "./screen-bridge.js";
import { makeHostResetter, resetAlreadyPending } from "../reset-run.js";
import type { HostDeviceRecord } from "./store.js";
import { signOutPortalAccount } from "../auth/store.js";
import { listPendingApprovals } from "@yuika/core";
import { pushApprovalAtPortal } from "./push.js";

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

/** v1.2: satu remote melanggan satu sesi terminal SHARED (close remote ≠
 *  kill terminal — sesi terminal milik host, dipakai web/agent juga). */
interface TerminalWatch {
  id: string;
  unsubscribe: () => void;
}

const TERMINAL_REPLAY_MAX = 16_000;
const FILE_PREVIEW_MAX = 64_000;

interface TaskStats { todo: number; doing: number; done: number; review: number }

function taskStatsOf(rt: YuiRuntime, projectId: string): TaskStats {
  const s: TaskStats = { todo: 0, doing: 0, done: 0, review: 0 };
  for (const t of rt.listProjectTasks(projectId)) {
    if (t.status === "doing") s.doing++;
    else if (t.status === "review") s.review++;
    else if (t.status === "done") s.done++;
    else s.todo++;
  }
  return s;
}

function projectSessionsLite(
  rt: YuiRuntime,
  projectId: string,
): Array<{ sessionId: string; personaId: string; title: string; updatedAt: number }> {
  const titles = new Map(rt.listRecentSessions(80).map((s) => [s.sessionId, s]));
  return rt.store
    .listProjectSessions(projectId)
    .map((s) => ({
      sessionId: s.id,
      personaId: s.personaId,
      title: titles.get(s.id)?.title ?? "(no message)",
      updatedAt: s.lastEventAt || s.createdAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface PortalStatus {
  linked: boolean;
  accountId: string | null;
  deviceId: string | null;
  relayUrl: string | null;
  relayState: "offline" | "connecting" | "authed" | "closed";
  remotes: Array<{ deviceId: string; kind: string; name: string }>;
  /** Last stop reason; "unlinked" = the device was deleted from the
   *  portal (bye 4001), NOT a network error; the UI points to re-pairing. */
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
  /** v1.3: assembler upload fragmen base64 per perangkat remote. */
  private uploads = new UploadAssembler();
  /** v1.2: remoteDeviceId → terminal watch aktif (1 per remote). */
  private terminalWatches = new Map<string, TerminalWatch>();
  private known = new Set<string>(); // session id yang pernah divalidasi/dibuat
  private unsubAll: (() => void) | null = null;
  private introSent = new Set<string>();
  /** Timestamp of the last bye 4001 (drives the status note). */
  private unlinkedAt = 0;
  /** Guard: bye 4001 = unlink HANYA bila koneksi pernah authed (device
   *  dikenal lalu dihapus). 4001 pada auth PERTAMA = relay tak pernah
   *  mengenal device (relay lain / db kosong): berhenti diam, jangan
   *  mencabut apa pun; retry berikutnya saat boot/login. */
  private everAuthed = false;

  get running(): boolean {
    return !!this.host;
  }

  /** bye 4001 (UNKNOWN_DEVICE) = the device was unlinked from the portal:
   *  permanent. Record SSO (kind web) → drop row + revoke every web session
   *  of that account (portal-side access was revoked). Record pairing manual
   *  (kind desktop/mobile) → drop row host saja; status note "unlinked". */
  private onHostBye(code: number, error: string): void {
    if (code !== ByeCode.UNKNOWN_DEVICE) return;
    const accountId = this.record?.accountId;
    const isWeb = this.record?.kind === "web";
    if (!this.everAuthed) {
      console.warn(`[portal-host] relay tidak mengenal device (bye 4001: ${error}), berhenti tanpa mencabut apa pun`);
      void this.stop();
      return;
    }
    console.warn(`[portal-host] device di-unlink dari portal (bye 4001: ${error}), berhenti`);
    this.unlinkedAt = Date.now();
    void this.stop();
    if (isWeb) {
      clearWebDevice();
      if (accountId) signOutPortalAccount(accountId);
    } else {
      clearHostDevice();
    }
  }

  /** Mulai worker (idempotent). Pair route memanggil ini setelah save. */
  async start(rt: YuiRuntime, record: HostDeviceRecord): Promise<void> {
    if (this.host && this.record?.deviceId === record.deviceId) return;
    await this.stop();
    this.rt = rt;
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
        backoff: { minMs: 500, maxMs: 16_000 },
        log: (...a) => console.log("[portal-host]", ...a),
      },
      {
        onAuthOk: () => { this.everAuthed = true; },
        onBye: (code, error) => this.onHostBye(code, error),
      },
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
        for (const id of [...this.terminalWatches.keys()]) {
          if (!remotes.has(id)) this.stopTerminalWatch(id);
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
    for (const id of [...this.terminalWatches.keys()]) this.stopTerminalWatch(id);
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
      // D76 push (MOB-3): approval baru → best-effort notifikasi portal
      // (FCM ke device lain akun; tap → buka app → approve < 10 dtk).
      if (ev.ev === "approval.request" && this.record) {
        void pushApprovalAtPortal(this.record, {
          title: `Approval: ${ev.title}`,
          body: ev.summary.slice(0, 200),
          data: { hostId: this.record.deviceId, kind: "approval", approvalId: ev.approvalId },
        });
      }
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
            sid = rt.createSession(personaId, action.projectId ?? null).sessionId;
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
      // ── v1.2: mission-control project-oriented (mobile remote) ────────
      case "list_projects": {
        const projects = rt.listProjects().map((p) => ({
          project: p,
          taskStats: taskStatsOf(rt, p.id),
          activeDelegations: rt.delegationJobs(p.id).filter((j) => j.status === "running").length,
          sessions: projectSessionsLite(rt, p.id),
        }));
        return void reply({ proto: 1, ev: "projects.list", rid: action.rid, projects });
      }
      case "project.detail": {
        const p = rt.getProject(action.projectId);
        if (!p) return void err("unknown_project", `project tidak ditemukan: ${action.projectId}`, action.rid);
        return void reply({
          proto: 1, ev: "project.detail", rid: action.rid, project: p,
          taskStats: taskStatsOf(rt, p.id),
          activeDelegations: rt.delegationJobs(p.id).filter((j) => j.status === "running").length,
        });
      }
      case "project.tasks":
        return void reply({ proto: 1, ev: "project.tasks", rid: action.rid, projectId: action.projectId, tree: rt.getTaskTree(action.projectId) });
      case "project.files":
        return void reply({ proto: 1, ev: "project.files", rid: action.rid, projectId: action.projectId, tree: rt.listProjectFiles(action.projectId) });
      case "project.file.read": {
        const r = rt.readProjectFile(action.projectId, action.relPath);
        return void reply({
          proto: 1, ev: "project.file", rid: action.rid, projectId: action.projectId, relPath: action.relPath,
          content: r.content.slice(0, FILE_PREVIEW_MAX),
          truncated: r.truncated || r.content.length > FILE_PREVIEW_MAX,
        });
      }
      case "project.team":
        return void reply({
          proto: 1, ev: "project.team", rid: action.rid, projectId: action.projectId,
          roster: rt.getProjectRoster(action.projectId), delegations: rt.delegationJobs(action.projectId),
        });
      case "project.activity":
        return void reply({
          proto: 1, ev: "project.activity", rid: action.rid, projectId: action.projectId,
          entries: rt.getProjectActivity(action.projectId, action.limit ?? 60).slice().reverse(),
        });
      case "project.sessions":
        return void reply({
          proto: 1, ev: "project.sessions", rid: action.rid, projectId: action.projectId,
          sessions: projectSessionsLite(rt, action.projectId),
        });
      case "personas.list": {
        const routes = rt.getModelRoutes();
        return void reply({
          proto: 1, ev: "personas.list", rid: action.rid,
          personas: routes.personas.map((p) => ({ id: p.id, name: p.name, model: routes.overrides[p.id]?.model ?? null })),
        });
      }
      case "session.create": {
        let sid: string;
        try {
          sid = rt.createSession(action.personaId, action.projectId ?? null).sessionId;
        } catch (e) {
          return void err("bad_persona", e instanceof Error ? e.message : String(e), action.rid);
        }
        this.known.add(sid);
        this.track(from.deviceId, sid);
        await this.sendSnapshot(from.deviceId, sid, action.rid);
        if (action.message) {
          void rt.runTurn(sid, action.message).catch((e: unknown) =>
            rt.emitSessionError(sid, e instanceof Error ? e.message : String(e)));
        }
        return;
      }
      case "settings.get":
        return void reply(this.settingsState(rt, action.rid));
      case "settings.usage":
        return void reply({
          proto: 1, ev: "settings.usage", rid: action.rid,
          summary: rt.getUsageSummary({}), matrix: rt.getUsageMatrix({}).slice(0, 60),
        });
      case "settings.mcp":
        return void reply({ proto: 1, ev: "settings.mcp", rid: action.rid, servers: rt.mcpServerStatuses() });
      case "settings.update": {
        if (action.approvalMode) rt.setApprovalMode(action.approvalMode);
        if (action.budget) {
          const parsed = UpdateBudgetRequest.safeParse(action.budget);
          if (!parsed.success) return void err("bad_budget", "payload budget tidak valid", action.rid);
          rt.updateBudget(parsed.data);
        }
        return void reply(this.settingsState(rt, action.rid));
      }
      case "provider.update": {
        try {
          rt.updateProviderSettings({
            ...(action.kind ? { kind: action.kind } : {}),
            ...(action.baseUrl ? { baseUrl: action.baseUrl } : {}),
            ...(action.apiKey ? { apiKey: action.apiKey } : {}),
            ...(action.model ? { model: action.model } : {}),
            ...(action.fallbackModel !== undefined ? { fallbackModel: action.fallbackModel } : {}),
            ...(action.auxModel !== undefined ? { auxModel: action.auxModel } : {}),
          });
        } catch (e) {
          return void err("provider_update_failed", e instanceof Error ? e.message : String(e), action.rid);
        }
        return void reply(this.settingsState(rt, action.rid));
      }
      case "model.route.update": {
        rt.updateModelRoute(action.personaId, { model: action.model, fallback: action.fallback });
        return void reply(this.settingsState(rt, action.rid));
      }
      case "mcp.retry": {
        await rt.mcpRetryConnect(action.name);
        return void reply({ proto: 1, ev: "settings.mcp", rid: action.rid, servers: rt.mcpServerStatuses() });
      }
      case "mcp.trust": {
        await rt.setMcpTrust({ server: action.server, trusted: action.trusted, denyTools: action.denyTools ?? [] });
        return void reply({ proto: 1, ev: "settings.mcp", rid: action.rid, servers: rt.mcpServerStatuses() });
      }
      case "reset.run": {
        // ack DULU (relay bye normal terjadi saat resetter memanggil stop()).
        await reply({ proto: 1, ev: "reset.acked", rid: action.rid, scope: action.scope });
        const scope = action.scope;
        const rtRef = rt;
        setTimeout(() => {
          void makeHostResetter(() => rtRef)(scope).catch(() => process.exit(87));
        }, 250);
        return;
      }
      case "terminal.list":
        return void reply({ proto: 1, ev: "terminal.list", rid: action.rid, sessions: listTerminalSessions() });
      case "terminal.open": {
        const workspacePath = action.projectId
          ? rt.projectWorkspacePath(action.projectId)
          : rt.paths.workspacePath;
        const info = await ensureTerminalSession(workspacePath);
        const sub = subscribeTerminal(info.id, (chunk) => {
          void this.host?.sendEvent(from.deviceId, { proto: 1, ev: "terminal.output", id: info.id, data: chunk }).catch(() => undefined);
        }, () => {
          void this.host?.sendEvent(from.deviceId, {
            proto: 1, ev: "terminal.state", rid: "", id: info.id,
            info: { id: info.id, backend: info.backend, workspacePath: info.workspacePath, createdAt: info.createdAt, lastActivity: Date.now(), exited: true },
            replay: "",
          }).catch(() => undefined);
        });
        this.startTerminalWatch(from.deviceId, info.id, sub?.unsubscribe ?? (() => undefined));
        const replay = (sub?.replay ?? "").slice(-TERMINAL_REPLAY_MAX);
        return void reply({
          proto: 1, ev: "terminal.state", rid: action.rid, id: info.id,
          info: { ...info, lastActivity: Date.now() },
          replay,
        });
      }
      case "terminal.input": {
        writeTerminalInput(action.id, action.data);
        return;
      }
      case "terminal.close": {
        const w = this.terminalWatches.get(from.deviceId);
        if (w && w.id === action.id) this.stopTerminalWatch(from.deviceId);
        return;
      }
      // v1.3: lampiran chat via relay — fragmen base64 (MAX_FRAME 256KB),
      // host menyusun lalu menyimpan via writeUpload (scope sesi).
      case "session.upload": {
        let asm: ReturnType<UploadAssembler["add"]>;
        try {
          asm = this.uploads.add(from.deviceId, action.sessionId, action.name, action.part, action.parts, action.chunk);
        } catch (e) {
          return void err("upload_rejected", e instanceof Error ? e.message : String(e), action.rid);
        }
        if (!asm.done) {
          return void reply({ proto: 1, ev: "session.upload.progress", rid: action.rid, received: action.part + 1 });
        }
        try {
          const buf = Buffer.from(asm.dataB64, "base64");
          const name = sanitizeUploadName(action.name);
          if ("error" in name) return void err("upload_rejected", name.error, action.rid);
          if (buf.length === 0) return void err("upload_rejected", "empty file", action.rid);
          if (buf.length > MAX_UPLOAD) return void err("upload_rejected", "max 10 MB", action.rid);
          const r = await rt.writeUpload({ sessionId: action.sessionId }, name.name, buf);
          return void reply({ proto: 1, ev: "session.uploaded", rid: action.rid, path: r.path, bytes: r.bytes });
        } catch (e) {
          return void err("upload_failed", e instanceof Error ? e.message : String(e), action.rid);
        }
      }
      case "list_screens": {
        const screens = listScreens().map((s) => ({
          key: s.key, personaId: s.personaId, url: s.url, title: s.title,
          status: s.status, viewers: s.viewers, watchers: s.watchers,
        }));
        return void reply({ proto: 1, ev: "screens.list", rid: action.rid, screens });
      }
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

  // ── v1.2: terminal + settings helpers ──────────────────────────────

  private startTerminalWatch(remoteId: string, id: string, unsubscribe: () => void): void {
    this.stopTerminalWatch(remoteId); // satu watch per remote (ganti = lepas lama)
    this.terminalWatches.set(remoteId, { id, unsubscribe });
  }

  private stopTerminalWatch(remoteId: string): void {
    const w = this.terminalWatches.get(remoteId);
    if (!w) return;
    w.unsubscribe();
    this.terminalWatches.delete(remoteId);
  }

  private settingsState(rt: YuiRuntime, rid: string): Extract<RemoteEvent, { ev: "settings.state" }> {
    const routes = rt.getModelRoutes();
    return {
      proto: 1, ev: "settings.state", rid,
      approvalMode: rt.approvalMode(),
      budget: rt.getBudgetStatus(),
      provider: rt.getProviderSettings(),
      modelRoutes: {
        defaultModel: routes.defaultModel,
        defaultFallback: routes.defaultFallback,
        overrides: Object.fromEntries(
          Object.entries(routes.overrides).map(([k, v]) => [k, { model: v.model ?? "", fallback: v.fallback ?? "" }]),
        ),
        personas: routes.personas,
      },
      resetPending: resetAlreadyPending(),
    };
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
