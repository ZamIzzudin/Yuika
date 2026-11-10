// @yuika/core, approval engine: pause turn → approval.requested → tunggu keputusan user
// (pola server_requests Hermes; di SaaS nanti bisa via push notification, ).
// pending approval & "Setujui & ingat" PERSIST di SQLite, permintaan
// yang menggantung saat server restart ditandai expired (event approval.expired),
// bukan menghilang diam-diam; remembered tool dimuat ulang tiap engine baru.
// deadline + auto-deny, approval yang diabaikan user TIDAK menggantung
// selamanya; setelah `YUI_APPROVAL_TIMEOUT_MS` (default 5 menit; 0 = nonaktif utk
// test) turn dilanjutkan FAIL-CLOSED (denied), event approval.expired ke UI.
import { randomUUID } from "node:crypto";
import type { Emit } from "../session/emit.js";
import type { ISessionStore } from "../session/store.js";

/**
 * Registry pending lintas engine: satu engine per turn, tapi route handler
 * hanya tahu requestId. Live promise hanya hidup selama proses, statusnya
 * yang permanen ada di tabel `approvals` .
 *
 * QUIRK dev (dipelajari dev-10, fix bug user "approval 404 saat disetujui"):
 * Next.js dev membundel @yuika/core TERPISAH per route, route approvals mendapat
 * copy modul sendiri. Map module-local → map KOSONG di copy route → resolve 404
 * "sudah selesai" padahal approval hidup. Sama seperti bus emitter: map WAJIB
 * di-cache di globalThis agar semua module-instance berbagi.
 */
const approvalGlobal = globalThis as unknown as {
  __yuiPendingApprovalEngines?: Map<string, ApprovalEngine>;
  __yuiApprovalMode?: ApprovalMode;
};
const pendingEngines = (approvalGlobal.__yuiPendingApprovalEngines ??= new Map<string, ApprovalEngine>());

/** Mode cepat (fix dev-10 user: approval kedaluwarsa → proses terasa stuck):
 *  "auto" = tulis file & jalankan kode disetujui otomatis; tool lain (MCP,
 *  dst.) tetap minta persetujuan. Global lintas sesi & lintas delegasi,
 *  di-cache di globalThis (tahan HMR) + dipersist runtime. */
export type ApprovalMode = "ask" | "auto";
const AUTO_APPROVE_TOOLS = new Set(["write_file", "run_command"]);

export function getApprovalMode(): ApprovalMode {
  return approvalGlobal.__yuiApprovalMode ?? "ask";
}

export function setApprovalMode(mode: ApprovalMode): void {
  approvalGlobal.__yuiApprovalMode = mode;
}

/** Deadline approval per policy . Env tervalidasi terpusat di
 * env.ts tapi tetap dibaca ulang tiap pemanggilan agar test &
 *  hot-reload bisa mengatur tanpa restart (parse di sini tetap fail-soft:
 *  nilai rusak → default). Default 5 menit. */
export function APPROVAL_TIMEOUT_MS(): number {
  const v = Number(process.env.YUI_APPROVAL_TIMEOUT_MS ?? 300_000);
  return Number.isFinite(v) && v >= 0 ? v : 300_000;
}

export function resolvePendingApproval(requestId: string, approved: boolean, remember = false): boolean {
  const engine = pendingEngines.get(requestId);
  if (!engine) return false;
  return engine.resolve(requestId, approved, remember);
}

export interface PendingApprovalInfo {
  requestId: string;
  tool: string;
  reason: string;
  sessionId: string;
}

/** D76: daftar approval PENDING lintas sesi (untuk replay ke remote yang
 *  baru connect — push notification tap flow; mobile yang terlambat join
 *  tetap melihat approval hidup, bukan hanya broadcast live). */
export function listPendingApprovals(): PendingApprovalInfo[] {
  const out: PendingApprovalInfo[] = [];
  for (const [requestId, engine] of pendingEngines) {
    const info = engine.pendingInfo(requestId);
    if (info) out.push({ requestId, tool: info.tool, reason: info.reason, sessionId: engine.sessionId() });
  }
  return out;
}

export interface ApprovalPersistOptions {
  sessionId: string;
  store: ISessionStore;
}

export class ApprovalEngine {
  private pending = new Map<string, { tool: string; reason: string; resolve: (approved: boolean) => void; clearTimeout: () => void }>();
  /** Tool yang di-approve + "ingat", skip approval sesi ini (mengurangi round-trip user).
 * Persist di approval_memory → bertahan restart server . */
  private remembered = new Set<string>();

  constructor(private emit: Emit, private persist?: ApprovalPersistOptions) {
    if (persist) {
      // muat "Setujui & ingat" dari proses/restart sebelumnya untuk sesi ini
      for (const t of persist.store.getRememberedTools(persist.sessionId)) this.remembered.add(t);
    }
  }

  request(tool: string, args: Record<string, unknown>, reason: string): Promise<boolean> {
    // Mode cepat: tulis file & jalankan kode disetujui otomatis (fix dev-10,
    // tanpa kartu approval; event resolved tetap muncul supaya jujur/traceable).
    if (getApprovalMode() === "auto" && AUTO_APPROVE_TOOLS.has(tool)) {
      this.emit({ type: "approval.resolved", requestId: `apr_auto_${tool}`, tool, approved: true });
      return Promise.resolve(true);
    }
    if (this.remembered.has(tool)) {
      this.emit({ type: "approval.resolved", requestId: `apr_remembered_${tool}`, tool, approved: true });
      return Promise.resolve(true);
    }
    const requestId = `apr_${randomUUID()}`;
    this.emit({ type: "approval.requested", requestId, tool, args, reason });
    this.persist?.store.insertApproval({ requestId, sessionId: this.persist.sessionId, tool, args, reason });
    pendingEngines.set(requestId, this);
    return new Promise<boolean>((resolve) => {
 // deadline auto-deny, fail-closed, turn tidak menggantung tanpa batas.
      const timeoutMs = APPROVAL_TIMEOUT_MS();
      const timer = timeoutMs > 0 ? setTimeout(() => this.expire(requestId), timeoutMs) : null;
      timer?.unref?.(); // jangan tahan proses hidup hanya karena timer approval
      this.pending.set(requestId, {
        tool,
        reason,
        resolve,
        clearTimeout: () => timer && clearTimeout(timer),
      });
    });
  }

  /** D76: info pending (untuk listPendingApprovals global). */
  pendingInfo(requestId: string): { tool: string; reason: string } | null {
    const e = this.pending.get(requestId);
    return e ? { tool: e.tool, reason: e.reason } : null;
  }

  /** D76: sesi pemilik engine ini (persist.sessionId; null tanpa persist). */
  sessionId(): string {
    return this.persist?.sessionId ?? "";
  }

 /** lewat deadline → tolak (fail-closed) + tandai expired di DB + event
   *  `approval.expired` (bentuk sama dengan boot-heal restart) → kartu UI mati rapi. */
  private expire(requestId: string): void {
    const entry = this.pending.get(requestId);
    if (!entry) return; // sudah diselesaikan user tepat waktu
    this.pending.delete(requestId);
    pendingEngines.delete(requestId);
    this.persist?.store.settleApproval(requestId, "expired");
    this.emit({ type: "approval.expired", requestId, tool: entry.tool });
    entry.resolve(false);
  }

  /** Dipanggil dari POST /api/approvals/:id, `remember` menandai tool bebas-approval
   *  untuk sisa sesi engine ini + persist (kartu "Setujui & ingat"). */
  resolve(requestId: string, approved: boolean, remember = false): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    this.pending.delete(requestId);
    pendingEngines.delete(requestId);
    entry.clearTimeout(); // : user menjawab sebelum deadline, matikan timer
    if (approved && remember) {
      this.remembered.add(entry.tool);
      this.persist?.store.rememberApproval(this.persist.sessionId, entry.tool);
    }
    this.persist?.store.settleApproval(requestId, approved ? "approved" : "denied", approved && remember);
    this.emit({ type: "approval.resolved", requestId, tool: entry.tool, approved });
    entry.resolve(approved);
    return true;
  }

  hasPending(): boolean {
    return this.pending.size > 0;
  }
}
