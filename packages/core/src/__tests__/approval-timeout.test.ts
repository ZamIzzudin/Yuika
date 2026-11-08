// P0-SEC-4: approval timeout + auto-deny, approval yang diabaikan tidak
// menggantung selamanya; setelah deadline turn dilanjutkan FAIL-CLOSED
// (denied), baris DB di-settle "expired", event approval.expired ke UI.
// Resolve tepat waktu → timer mati, tidak ada expiry ganda.
import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApprovalEngine } from "../approval/engine.js";
import { SessionStore } from "../session/store.js";
import type { EventDraft } from "@yuika/contracts";

let dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-apprx-"));
let store: SessionStore;
const events: EventDraft[] = [];

function engine(sessionId = "s_x"): ApprovalEngine {
  store ??= new SessionStore(path.join(dir, "t.db"));
  store.createSession(sessionId, "yui-coder", "SYS", ["run_command"]);
  const emit = (d: EventDraft) => events.push(d);
  return new ApprovalEngine(emit, { sessionId, store });
}

afterEach(() => {
  process.env.YUI_APPROVAL_TIMEOUT_MS = "";
  store?.close();
  store = undefined as unknown as SessionStore;
  events.length = 0;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-apprx-"));
  } catch {
    /* lenient (EPERM Windows WAL) */
  }
});

describe("approval timeout (P0-SEC-4)", () => {
  it("diabaikan melewati deadline → auto-deny fail-closed + expired di DB + event", async () => {
    process.env.YUI_APPROVAL_TIMEOUT_MS = "30";
    const e = engine();
    const decision = e.request("run_command", { command: "node" }, "uji");
    await new Promise((r) => setTimeout(r, 90));
    await expect(decision).resolves.toBe(false); // fail-closed
    expect(events.some((d) => d.type === "approval.expired")).toBe(true);
    expect(store.listPendingApprovals()).toHaveLength(0); // di-settle, bukan menggantung
  });

  it("user menjawab SEBELUM deadline → approved normal, expiry tidak dobel", async () => {
    process.env.YUI_APPROVAL_TIMEOUT_MS = "40";
    const e = engine();
    const decision = e.request("run_command", { command: "node" }, "uji");
    const reqId = (events.find((d) => d.type === "approval.requested") as { requestId: string }).requestId;
    e.resolve(reqId, true);
    await expect(decision).resolves.toBe(true);
    await new Promise((r) => setTimeout(r, 80));
    expect(events.filter((d) => d.type === "approval.expired")).toHaveLength(0); // timer dimatikan
  });

  it("0 = nonaktif (test/dev): tidak pernah auto-expire", async () => {
    process.env.YUI_APPROVAL_TIMEOUT_MS = "0";
    const e = engine();
    const decision = e.request("run_command", { command: "node" }, "uji");
    await new Promise((r) => setTimeout(r, 50));
    expect(e.hasPending()).toBe(true);
    const reqId = (events.find((d) => d.type === "approval.requested") as { requestId: string }).requestId;
    e.resolve(reqId, false);
    await expect(decision).resolves.toBe(false);
  });
});
