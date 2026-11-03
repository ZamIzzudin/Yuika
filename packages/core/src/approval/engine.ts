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

export function resolvePendingApproval(requestId: string, approved: boolean): boolean {
  const engine = pendingEngines.get(requestId);
  if (!engine) return false;
  return engine.resolve(requestId, approved);
}

export class ApprovalEngine {
  private pending = new Map<string, (approved: boolean) => void>();

  constructor(private emit: Emit) {}

  request(tool: string, args: Record<string, unknown>, reason: string): Promise<boolean> {
    const requestId = `apr_${randomUUID()}`;
    this.emit({ type: "approval.requested", requestId, tool, args, reason });
    pendingEngines.set(requestId, this);
    return new Promise<boolean>((resolve) => {
      this.pending.set(requestId, resolve);
      // DEMO-SHORTCUT: tanpa deadline. P0: timeout + auto-deny per policy.
    });
  }

  /** Dipanggil dari POST /api/approvals/:id */
  resolve(requestId: string, approved: boolean): boolean {
    const resolve = this.pending.get(requestId);
    if (!resolve) return false;
    this.pending.delete(requestId);
    pendingEngines.delete(requestId);
    this.emit({ type: "approval.resolved", requestId, approved });
    resolve(approved);
    return true;
  }

  hasPending(): boolean {
    return this.pending.size > 0;
  }
}
