// @yui/core — approval engine: pause turn → approval.requested → tunggu keputusan user
// (pola server_requests Hermes; di SaaS nanti bisa via push notification — PLAN §4.11).
import { randomUUID } from "node:crypto";
import type { Emit } from "../session/emit.js";

/**
 * Registry pending lintas engine: satu engine per turn, tapi route handler
 * hanya tahu requestId. DEMO-SHORTCUT: Map in-process; P0 pindah ke store/queue
 * supaya approval survive restart.
 */
const pendingEngines = new Map<string, ApprovalEngine>();

export function resolvePendingApproval(requestId: string, approved: boolean, remember = false): boolean {
  const engine = pendingEngines.get(requestId);
  if (!engine) return false;
  return engine.resolve(requestId, approved, remember);
}

export class ApprovalEngine {
  private pending = new Map<string, { tool: string; resolve: (approved: boolean) => void }>();
  /** Tool yang di-approve + "ingat" — skip approval sesi ini (mengurangi round-trip user). */
  private remembered = new Set<string>();

  constructor(private emit: Emit) {}

  request(tool: string, args: Record<string, unknown>, reason: string): Promise<boolean> {
    if (this.remembered.has(tool)) {
      this.emit({ type: "approval.resolved", requestId: `apr_remembered_${tool}`, tool, approved: true });
      return Promise.resolve(true);
    }
    const requestId = `apr_${randomUUID()}`;
    this.emit({ type: "approval.requested", requestId, tool, args, reason });
    pendingEngines.set(requestId, this);
    return new Promise<boolean>((resolve) => {
      this.pending.set(requestId, { tool, resolve });
      // DEMO-SHORTCUT: tanpa deadline. P0: timeout + auto-deny per policy.
    });
  }

  /** Dipanggil dari POST /api/approvals/:id — `remember` menandai tool bebas-approval
   *  untuk sisa sesi engine ini (kartu "Setujui & ingat"). */
  resolve(requestId: string, approved: boolean, remember = false): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    this.pending.delete(requestId);
    pendingEngines.delete(requestId);
    if (approved && remember) this.remembered.add(entry.tool);
    this.emit({ type: "approval.resolved", requestId, tool: entry.tool, approved });
    entry.resolve(approved);
    return true;
  }

  hasPending(): boolean {
    return this.pending.size > 0;
  }
}
