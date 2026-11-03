// W1-A3 (TASKS.md): loop vs fake provider — stream, final, append-only, error path.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { ProviderAdapter, ChatRequest, ProviderChunk, ProviderDone } from "../provider/adapter.js";
import { AgentLoop } from "../loop.js";
import { SessionStore } from "../session/store.js";
import { ApprovalEngine } from "../approval/engine.js";
import { registry, resetRegistryForTests } from "../registry.js";
import type { EventDraft, YuiEvent } from "@yui/contracts";

/** Provider skrip: tiap chatStream mengonsumsi satu langkah (deltas → done). */
class FakeProvider implements ProviderAdapter {
  readonly id = "fake";
  public calls: ChatRequest[] = [];
  constructor(private script: { deltas?: string[]; done: ProviderDone }[]) {}
  async chatStream(req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
    this.calls.push(req);
    const step = this.script.shift();
    if (!step) throw new Error("script habis");
    for (const d of step.deltas ?? []) onChunk({ type: "text_delta", delta: d });
    onChunk(step.done);
    return step.done;
  }
}

class FailingProvider implements ProviderAdapter {
  readonly id = "fail";
  async chatStream(): Promise<ProviderDone> {
    throw new Error("provider mati");
  }
}

function makeHarness(provider: ProviderAdapter) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-loop-"));
  const store = new SessionStore(path.join(dir, "test.db"));
  const events: YuiEvent[] = [];
  const makeEmit = (sessionId: string) => (draft: EventDraft) => {
    events.push(store.appendEvent(sessionId, draft));
  };
  const sessionId = "s_test1";
  store.createSession(sessionId, "yui-conductor", "SYS PROMPT", ["echo_test"]);
  const loop = new AgentLoop({
    store,
    provider,
    model: "fake-model",
    workspacePath: dir,
    approvals: new ApprovalEngine(makeEmit(sessionId)),
    emit: makeEmit(sessionId),
  });
  return { store, events, loop, sessionId, dir };
}

describe("AgentLoop (fake provider)", () => {
  it("happy path: stream delta → message.done → assistant persist + persona.state", async () => {
    resetRegistryForTests();
    const provider = new FakeProvider([
      { deltas: ["hal", "o", " dunia"], done: { type: "done", finishReason: "stop", text: "halo dunia", toolCalls: [] } },
    ]);
    const { store, events, loop, sessionId } = makeHarness(provider);
    await loop.runTurn(sessionId, "tes");

    const types = events.map((e) => e.type);
    expect(types).toContain("turn.started");
    expect(types).toContain("message.done");
    expect(events.filter((e) => e.type === "message.delta")).toHaveLength(3);
    // persona.state: thinking → done
    const states = events.filter((e) => e.type === "persona.state").map((e) => e.state);
    expect(states).toEqual(["thinking", "done"]);

    const msgs = store.getMessages(sessionId);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[1]!.content).toBe("halo dunia");
    store.close();
  });

  it("tool round: tool_calls → result → iterasi → final (append-only sequence)", async () => {
    resetRegistryForTests();
    registry.register({
      name: "echo_test",
      description: "test",
      parameters: z.object({ text: z.string() }),
      handler: async (args: { text: string }) => ({ result: { echoed: args.text } }),
    });
    const provider = new FakeProvider([
      {
        deltas: [],
        done: {
          type: "done",
          finishReason: "tool_calls",
          text: "",
          toolCalls: [{ id: "c1", name: "echo_test", args: { text: "hai" } }],
        },
      },
      {
        deltas: [],
        done: {
          type: "done",
          finishReason: "tool_calls",
          text: "",
          toolCalls: [{ id: "c2", name: "echo_test", args: { text: "lagi" } }],
        },
      },
      { deltas: ["selesai"], done: { type: "done", finishReason: "stop", text: "selesai", toolCalls: [] } },
    ]);
    const { store, events, loop, sessionId } = makeHarness(provider);
    await loop.runTurn(sessionId, "panggil tool");

    const toolCalls = events.filter((e) => e.type === "tool.call");
    const toolResults = events.filter((e) => e.type === "tool.result");
    // 2 ROUND tool call berantai (W2-A4): call → result → iterasi → call → result → final
    expect(toolCalls).toHaveLength(2);
    expect(toolResults).toHaveLength(2);
    if (toolResults[1]!.type === "tool.result") expect(toolResults[1]!.isError).toBe(false);

    // INVARIANT append-only: urutan role persis user → assistant(toolCalls) → tool → assistant(toolCalls) → tool → assistant
    const roles = store.getMessages(sessionId).map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "tool", "assistant", "tool", "assistant"]);
    // persona.state: thinking → working → thinking → working → thinking → done
    const states = events.filter((e) => e.type === "persona.state").map((e) => e.state);
    expect(states).toEqual(["thinking", "working", "thinking", "working", "thinking", "done"]);
    // system prompt frozen tetap dikirim, tool schema dikirim
    expect(provider.calls[0]!.messages[0]!.content).toBe("SYS PROMPT");
    expect(provider.calls[0]!.tools.map((t) => t.name)).toContain("echo_test");
    store.close();
  });

  it("provider error → session.error (recoverable=false) + persona.state error, tanpa crash", async () => {
    resetRegistryForTests();
    const { store, events, loop, sessionId } = makeHarness(new FailingProvider());
    await expect(loop.runTurn(sessionId, "apa kabar")).resolves.toBeUndefined();
    const err = events.find((e) => e.type === "session.error");
    expect(err).toBeDefined();
    if (err?.type === "session.error") expect(err.recoverable).toBe(false);
    const states = events.filter((e) => e.type === "persona.state").map((e) => e.state);
    expect(states).toEqual(["thinking", "error"]);
    store.close();
  });
});
