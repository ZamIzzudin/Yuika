// trace view, event store + ledger digabung jadi timeline per turn.
// Catatan: store menstempel ts/id sendiri → test memakai ts dari appendEvent.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "../session/store.js";
import { UsageLedger } from "../usage/ledger.js";
import { buildTrace } from "../session/trace.js";
import type { EventDraft } from "@yuika/contracts";

let dir: string;
let store: SessionStore;
let ledger: UsageLedger;
const sid = "s-trace";

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-trace-"));
  store = new SessionStore(path.join(dir, "t.db"));
  ledger = new UsageLedger(path.join(dir, "t.db"));
});
afterEach(() => {
  store.close();
  ledger.close();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows lock */ }
});

const push = (draft: EventDraft) => store.appendEvent(sid, draft);

describe("buildTrace", () => {
  it("grup per turn: langkah tool (nama via callId), status, token join window waktu", () => {
    const t0 = push({ type: "turn.started", turnId: "t1" } as EventDraft);
    push({ type: "tool.call", turnId: "t1", callId: "c1", name: "write_file", args: { path: "a.txt", mode: "w" } } as EventDraft);
    push({ type: "tool.result", turnId: "t1", callId: "c1", result: "ok", isError: false } as EventDraft);
    ledger.record({ sessionId: sid, projectId: null, personaId: "yui-coder", model: "glm/glm-5.1", promptTokens: 100, outputTokens: 40, latencyMs: 2300, at: t0.ts });
    const tEnd = push({ type: "persona.state", personaId: "yui-coder", state: "done" } as EventDraft);

    const tr = buildTrace(store, ledger, sid);
    expect(tr.turns).toHaveLength(1);
    const t = tr.turns[0]!;
    expect(t.status).toBe("done");
    expect(t.endedAt).toBe(tEnd.ts);
    expect(t.tokens).toEqual({ input: 100, output: 40, calls: 1 });
    const labels = t.steps.map((s) => s.label);
    expect(labels.some((l) => l.includes('write_file(path: "a.txt", +1)'))).toBe(true);
    expect(labels.some((l) => l.includes("write_file ok"))).toBe(true);
    const model = t.steps.find((s) => s.kind === "model")!;
    expect(model.durationMs).toBe(2300);
    expect(model.label).toContain("glm/glm-5.1");
  });

  it("turn kedua error, panggilan model turn pertama TIDAK ikut", () => {
    const t0 = push({ type: "turn.started", turnId: "t1" } as EventDraft);
    ledger.record({ sessionId: sid, projectId: null, personaId: "p", model: "m", promptTokens: 10, outputTokens: 5, latencyMs: 100, at: t0.ts });
    push({ type: "persona.state", personaId: "p", state: "done" } as EventDraft);
    push({ type: "turn.started", turnId: "t2" } as EventDraft);
    push({ type: "session.error", message: "oops", recoverable: true } as EventDraft);

    const tr = buildTrace(store, ledger, sid);
    expect(tr.turns).toHaveLength(2);
    expect(tr.turns[0]!.status).toBe("done");
    expect(tr.turns[0]!.tokens.calls).toBe(1);
    expect(tr.turns[1]!.status).toBe("error");
    expect(tr.turns[1]!.tokens.calls).toBe(0); // ledger call milik window turn 1
    expect(tr.turns[1]!.steps.some((s) => s.kind === "error" && s.label.includes("oops"))).toBe(true);
  });

  it("sesi kosong → tanpa turn", () => {
    expect(buildTrace(store, ledger, "s-kosong").turns).toHaveLength(0);
  });
});
