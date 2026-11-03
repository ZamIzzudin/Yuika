import { describe, expect, it } from "vitest";
import { YuiEvent, type YuiEvent as YuiEventType } from "../index.js";

/** Behavior contract: setiap event yang dibuat core harus lolos parse union. */
const samples: YuiEventType[] = [
  { id: 1, ts: 1, sessionId: "s1", type: "turn.started", turnId: "t1" },
  { id: 2, ts: 2, sessionId: "s1", type: "message.delta", turnId: "t1", delta: "halo" },
  { id: 3, ts: 3, sessionId: "s1", type: "tool.call", turnId: "t1", callId: "c1", name: "web_fetch", args: { url: "https://x" } },
  { id: 4, ts: 4, sessionId: "s1", type: "tool.result", turnId: "t1", callId: "c1", result: { ok: true }, isError: false },
  { id: 5, ts: 5, sessionId: "s1", type: "delegation.started", turnId: "t1", childSessionId: "s2", personaId: "yui-scholar", goal: "riset" },
  { id: 6, ts: 6, sessionId: "s1", type: "delegation.progress", childSessionId: "s2", state: "working" },
  { id: 7, ts: 7, sessionId: "s1", type: "persona.state", personaId: "yui-scholar", state: "celebrating" },
  { id: 8, ts: 8, sessionId: "s1", type: "approval.requested", requestId: "r1", tool: "write_file", args: {}, reason: "di luar reports/" },
  { id: 9, ts: 9, sessionId: "s1", type: "session.error", message: "oops", recoverable: true },
  { id: 10, ts: 10, sessionId: "s1", type: "memory.noted", turnId: "t1", scope: "user", note: "ringkas saja" },
  { id: 11, ts: 11, sessionId: "s1", type: "skill.proposed", turnId: "t1", name: "deploy-check", description: "Sebelum deploy cek lint+test" },
];

describe("YuiEvent contract", () => {
  it("menerima semua event valid", () => {
    for (const s of samples) expect(YuiEvent.parse(s)).toBeTruthy();
  });

  it("menolak state persona tidak dikenal", () => {
    expect(() =>
      YuiEvent.parse({ id: 1, ts: 1, sessionId: "s1", type: "persona.state", personaId: "p", state: "sleeping" }),
    ).toThrow();
  });

  it("menolak event tanpa type", () => {
    expect(() => YuiEvent.parse({ id: 1, ts: 1, sessionId: "s1" })).toThrow();
  });

  it("memory.noted: scope harus user|project, note tidak kosong", () => {
    expect(() =>
      YuiEvent.parse({ id: 1, ts: 1, sessionId: "s1", type: "memory.noted", turnId: "t1", scope: "global", note: "x" }),
    ).toThrow();
    expect(() =>
      YuiEvent.parse({ id: 1, ts: 1, sessionId: "s1", type: "memory.noted", turnId: "t1", scope: "user", note: "" }),
    ).toThrow();
  });
});
