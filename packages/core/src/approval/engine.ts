// @yui/core — approval engine: pause turn → approval.requested → tunggu keputusan user
// (pola server_requests Hermes; di SaaS nanti bisa via push notification — PLAN §4.11).
// P0-DATA-3: pending approval & "Setujui & ingat" PERSIST di SQLite — permintaan
// yang menggantung saat server restart ditandai expired (event approval.expired),
// bukan menghilang diam-diam; remembered tool dimuat ulang tiap engine baru.
import { randomUUID } from "node:crypto";
import type { Emit } from "../session/emit.js";
import type { SessionStore } from "../session/store.js";

/**
 * Registry pending lintas engine: satu engine per turn, tapi route handler
 * hanya tahu requestId. Live promise hanya hidup selama proses — statusnya
 * yang permanen ada di tabel `approvals` (P0-DATA-3).
 */
const pendingEngines = new Map<string, ApprovalEngine>();

export function resolvePendingApproval(requestId: string, approved: boolean, remember = false): boolean {
  const engine = pendingEngines.get(requestId);
  if (!engine) return false;
  return engine.resolve(requestId, approved, remember);
}

export interface ApprovalPersistOptions {
  sessionId: string;
  store: SessionStore;
}

export class ApprovalEngine {
  private pending = new Map<string, { tool: string; resolve: (approved: boolean) => void }>();
  /** Tool yang di-approve + "ingat" — skip approval sesi ini (mengurangi round-trip user).
   *  Persist di approval_memory → bertahan restart server (P0-DATA-3). */
  private remembered = new Set<string>();

  constructor(private emit: Emit, private persist?: ApprovalPersistOptions) {
    if (persist) {
      // muat "Setujui & ingat" dari proses/restart sebelumnya untuk sesi ini
      for (const t of persist.store.getRememberedTools(persist.sessionId)) this.remembered.add(t);
    }
  }

  request(tool: string, args: Record<string, unknown>, reason: string): Promise<boolean> {
    if (this.remembered.has(tool)) {
      this.emit({ type: "approval.resolved", requestId: `apr_remembered_${tool}`, tool, approved: true });
      return Promise.resolve(true);
    }
    const requestId = `apr_${randomUUID()}`;
    this.emit({ type: "approval.requested", requestId, tool, args, reason });
    this.persist?.store.insertApproval({ requestId, sessionId: this.persist.sessionId, tool, args, reason });
    pendingEngines.set(requestId, this);
    return new Promise<boolean>((resolve) => {
      this.pending.set(requestId, { tool, resolve });
      // DEMO-SHORTCUT: tanpa deadline. P0: timeout + auto-deny per policy.
    });
  }

  /** Dipanggil dari POST /api/approvals/:id — `remember` menandai tool bebas-approval
   *  untuk sisa sesi engine ini + persist (kartu "Setujui & ingat"). */
  resolve(requestId: string, approved: boolean, remember = false): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    this.pending.delete(requestId);
    pendingEngines.delete(requestId);
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
