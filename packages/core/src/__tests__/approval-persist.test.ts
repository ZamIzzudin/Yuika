// approval persist, pending survive restart (→ expired + event),
// "Setujui & ingat" bertahan lintas restart via approval_memory.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "../session/store.js";
import { ApprovalEngine, resolvePendingApproval } from "../approval/engine.js";
import type { Emit } from "../session/emit.js";

let dir: string;
let dbPath: string;
const emit: Emit = () => undefined;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-apr-"));
  dbPath = path.join(dir, "test.db");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function newStore() {
  return new SessionStore(dbPath);
}

describe("approval persist ()", () => {
  it("request → baris pending; resolve(approve, remember) → approved + memory", async () => {
    const store = newStore();
    const eng = new ApprovalEngine(emit, { sessionId: "s1", store });
    const p = eng.request("run_command", { command: "node x.js" }, "jalankan node");
    const pend = store.listPendingApprovals();
    expect(pend).toHaveLength(1);
    expect(pend[0]!.tool).toBe("run_command");
    expect(resolvePendingApproval(pend[0]!.requestId, true, true)).toBe(true);
    await expect(p).resolves.toBe(true);
    expect(store.listPendingApprovals()).toHaveLength(0);
    expect(store.getRememberedTools("s1")).toContain("run_command");
    store.close();
  });

  it("restart → engine BARU sesi sama mengingat approval (tanpa kartu baru)", async () => {
    const store = newStore();
    const e1 = new ApprovalEngine(emit, { sessionId: "s1", store });
    const p1 = e1.request("run_command", { command: "node a.js" }, "a");
    resolvePendingApproval(store.listPendingApprovals()[0]!.requestId, true, true);
    await p1;
    store.close();

    // "restart": store baru + engine baru
    const store2 = newStore();
    const e2 = new ApprovalEngine(emit, { sessionId: "s1", store: store2 });
    const emitted: string[] = [];
    const e2b = new ApprovalEngine((ev) => emitted.push(ev.type), { sessionId: "s1", store: store2 });
    await expect(e2b.request("run_command", { command: "node b.js" }, "b")).resolves.toBe(true);
    expect(emitted).not.toContain("approval.requested"); // langsung diingat
    expect(store2.listPendingApprovals()).toHaveLength(0);
    store2.close();
  });

  it("pending saat restart → sweep expired + event approval.expired di sesi", async () => {
    const store = newStore();
    const eng = new ApprovalEngine(emit, { sessionId: "s9", store });
    void eng.request("run_command", { command: "node c.js" }, "c"); // dibiarkan pending
    store.close();

    // restart: runtime init → expirePendingApprovals
    const store2 = newStore();
    expect(store2.expirePendingApprovals()).toBe(1);
    expect(store2.expirePendingApprovals()).toBe(0); // idempotent
    expect(store2.listPendingApprovals()).toHaveLength(0);
    const evs = store2.getEvents("s9").filter((e) => e.type === "approval.expired");
    expect(evs).toHaveLength(1);
    expect((evs[0] as { requestId?: string }).requestId).toMatch(/^apr_/);
    // resolve terlambat → false (kartu sudah kedaluwarsa, bukan 404 misterius)
    expect(resolvePendingApproval("apr_tidak_ada", true)).toBe(false);
    store2.close();
  });
});
