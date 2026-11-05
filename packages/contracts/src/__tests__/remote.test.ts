// P1-PRT-2 — verifikasi kontrak remote: contoh wire CONTRACTS §4 valid,
// act/ev tak dikenal ditolak (host membalas error unknown_action), field
// opsional (rid session.snapshot, sinceSeq subscribe, reason reject).
import { describe, expect, it } from "vitest";
import { RemoteAction, RemoteEvent } from "../remote.js";

describe("RemoteAction (CONTRACTS-REMOTE v1)", () => {
  it("contoh wire §4: send_prompt valid", () => {
    const a = RemoteAction.parse({
      proto: 1, act: "send_prompt", rid: "r-1", sessionId: "s-demo",
      personaId: "yui-coder", message: "Research popular JS frameworks",
    });
    expect(a).toMatchObject({ act: "send_prompt", rid: "r-1" });
  });

  it("act tak dikenal → parse error (host balas unknown_action)", () => {
    expect(() => RemoteAction.parse({ proto: 1, act: "explode", rid: "r" })).toThrow();
  });

  it("subscribe + sinceSeq (resume) valid; tanpa sinceSeq juga valid", () => {
    expect(RemoteAction.safeParse({ proto: 1, act: "subscribe", rid: "r", sessions: ["s1"], sinceSeq: { s1: 7 } }).success).toBe(true);
    expect(RemoteAction.safeParse({ proto: 1, act: "subscribe", rid: "r", sessions: [] }).success).toBe(true);
  });

  it("proto ≠ 1 ditolak", () => {
    expect(RemoteAction.safeParse({ proto: 2, act: "ping_host", rid: "r" }).success).toBe(false);
  });
});

describe("RemoteEvent (CONTRACTS-REMOTE v1)", () => {
  it("contoh wire §4: message.delta & approval.request valid", () => {
    expect(RemoteEvent.parse({ proto: 1, ev: "message.delta", sessionId: "s-demo", seq: 1, delta: "According to 2026 data" })).toBeTruthy();
    expect(RemoteEvent.parse({ proto: 1, ev: "approval.request", approvalId: "ap-1", title: "run_command", summary: "npm install", risk: "medium" })).toBeTruthy();
  });

  it("risk di luar enum ditolak", () => {
    expect(RemoteEvent.safeParse({ proto: 1, ev: "approval.request", approvalId: "a", title: "t", summary: "s", risk: "extreme" }).success).toBe(false);
  });

  it("rid session.snapshot opsional (broadcast resume vs response)", () => {
    expect(RemoteEvent.safeParse({ proto: 1, ev: "session.snapshot", sessionId: "s", messages: [], latestSeq: 3 }).success).toBe(true);
    expect(RemoteEvent.safeParse({ proto: 1, ev: "session.snapshot", rid: "r", sessionId: "s", messages: [], latestSeq: 3 }).success).toBe(true);
  });

  it("barrel index mengekspor kontrak remote", async () => {
    const mod = await import("../index.js");
    expect(mod.RemoteAction).toBe(RemoteAction);
    expect(mod.RemoteEvent).toBe(RemoteEvent);
  });
});
