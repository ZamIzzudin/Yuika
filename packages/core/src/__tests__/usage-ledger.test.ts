// P1-CRED-1: metering ledger — rollup per persona/model, filter, dan integrasi
// AgentLoop (usage dari provider → event; TANPA usage → tidak tercatat; multi-
// iterasi tool round → event per panggilan model).
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProviderAdapter, ChatRequest, ProviderChunk, ProviderDone } from "../provider/adapter.js";
import { AgentLoop } from "../loop.js";
import { SessionStore } from "../session/store.js";
import { ApprovalEngine } from "../approval/engine.js";
import { registry, resetRegistryForTests } from "../registry.js";
import { UsageLedger } from "../usage/ledger.js";
import { UsageEvent, type YuiEvent, type EventDraft } from "@yuika/contracts";
import { z } from "zod";

let dir: string;
beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-usage-"))));
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function makeLedger(): UsageLedger {
  return new UsageLedger(path.join(dir, "test.db"));
}

const ev = (over: Partial<UsageEvent>): UsageEvent =>
  UsageEvent.parse({ sessionId: "s1", projectId: null, personaId: "yui-scholar", model: "m-a", promptTokens: 100, outputTokens: 20, latencyMs: 500, at: 1_000, ...over });

describe("UsageLedger (P1-CRED-1)", () => {
  it("summary: rollup per persona & model + total", () => {
    const l = makeLedger();
    l.record(ev({}));
    l.record(ev({ promptTokens: 50, outputTokens: 10, at: 2_000 }));
    l.record(ev({ personaId: "yui-coder", model: "m-b", promptTokens: 7, outputTokens: 3, at: 3_000 }));
    const s = l.summary();
    expect(s.calls).toBe(3);
    expect(s.promptTokens).toBe(157);
    expect(s.outputTokens).toBe(33);
    expect(s.byPersona.find((x) => x.key === "yui-scholar")).toMatchObject({ calls: 2, promptTokens: 150 });
    expect(s.byModel.find((x) => x.key === "m-b")).toMatchObject({ calls: 1, promptTokens: 7 });
    expect(s.windowStart).toBe(1_000);
    l.close();
  });

  it("filter: projectId / since; recent terbaru-dulu", () => {
    const l = makeLedger();
    l.record(ev({ projectId: "p1", at: 1_000 }));
    l.record(ev({ projectId: "p2", at: 2_000 }));
    l.record(ev({ projectId: "p1", at: 5_000 }));
    expect(l.summary({ projectId: "p1" }).calls).toBe(2);
    expect(l.summary({ since: 1_500 }).calls).toBe(2);
    expect(l.summary({ projectId: "p1", since: 2_000 }).calls).toBe(1);
    const r = l.recent(10, { projectId: "p1" });
    expect(r).toHaveLength(2);
    expect(r[0]!.at).toBeGreaterThanOrEqual(r[1]!.at); // terbaru-dulu
    expect(r[0]!.projectId).toBe("p1");
    l.close();
  });

  it("kosong → calls 0, windowStart null", () => {
    const l = makeLedger();
    const s = l.summary();
    expect(s.calls).toBe(0);
    expect(s.windowStart).toBeNull();
    expect(s.byPersona).toEqual([]);
    l.close();
  });
});

/** Provider skrip (mirror loop.test.ts) — done chunk bisa membawa usage. */
class FakeProvider implements ProviderAdapter {
  readonly id = "fake";
  constructor(private script: { deltas?: string[]; done: ProviderDone }[]) {}
  async chatStream(_req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
    const step = this.script.shift();
    if (!step) throw new Error("script habis");
    for (const d of step.deltas ?? []) onChunk({ type: "text_delta", delta: d });
    onChunk(step.done);
    return step.done;
  }
}

function makeHarness(provider: ProviderAdapter, recordUsage: (u: UsageEvent) => void, projectId: string | null = null) {
  const store = new SessionStore(path.join(dir, "test.db"));
  const events: YuiEvent[] = [];
  const makeEmit = (sessionId: string) => (draft: EventDraft) => events.push(store.appendEvent(sessionId, draft));
  const sessionId = "s_meter";
  store.createSession(sessionId, "yui-scholar", "SYS", ["echo_test"], projectId);
  const loop = new AgentLoop({
    store,
    provider,
    model: "fake-model",
    workspacePath: dir,
    approvals: new ApprovalEngine(makeEmit(sessionId)),
    emit: makeEmit(sessionId),
    recordUsage,
  });
  return { store, loop, sessionId };
}

describe("metering di AgentLoop", () => {
  it("provider melaporkan usage → 1 event per panggilan model (persona & model benar)", async () => {
    resetRegistryForTests();
    const l = makeLedger();
    const { store, loop, sessionId } = makeHarness(
      new FakeProvider([
        { done: { type: "done", finishReason: "stop", text: "ok", toolCalls: [], usage: { inputTokens: 120, outputTokens: 45 } } },
      ]),
      (u) => l.record(u),
      "p_meter"
    );
    await loop.runTurn(sessionId, "tes");
    const rows = l.recent(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ personaId: "yui-scholar", model: "fake-model", projectId: "p_meter", promptTokens: 120, outputTokens: 45 });
    expect(rows[0]!.latencyMs).toBeGreaterThanOrEqual(0);
    store.close();
    l.close();
  });

  it("provider TANPA usage → tidak ada estimasi (ledger tetap kosong)", async () => {
    resetRegistryForTests();
    const l = makeLedger();
    const { store, loop, sessionId } = makeHarness(
      new FakeProvider([{ done: { type: "done", finishReason: "stop", text: "ok", toolCalls: [] } }]),
      (u) => l.record(u)
    );
    await loop.runTurn(sessionId, "tes");
    expect(l.summary().calls).toBe(0);
    store.close();
    l.close();
  });

  it("multi-iterasi (tool round) → event per iterasi dijumlah benar", async () => {
    resetRegistryForTests();
    registry.register({
      name: "echo_test",
      description: "tes",
      parameters: z.object({ q: z.string().optional() }),
      handler: async () => ({ result: "pong" }),
    });
    const l = makeLedger();
    const { store, loop, sessionId } = makeHarness(
      new FakeProvider([
        { done: { type: "done", finishReason: "tool_calls", text: "", toolCalls: [{ id: "c1", name: "echo_test", args: {} }], usage: { inputTokens: 10, outputTokens: 5 } } },
        { done: { type: "done", finishReason: "stop", text: "selesai", toolCalls: [], usage: { inputTokens: 30, outputTokens: 8 } } },
      ]),
      (u) => l.record(u)
    );
    await loop.runTurn(sessionId, "tes");
    const s = l.summary();
    expect(s.calls).toBe(2);
    expect(s.promptTokens).toBe(40);
    expect(s.outputTokens).toBe(13);
    store.close();
    l.close();
  });
});
