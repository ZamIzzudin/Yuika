// W1-A3 : loop vs fake provider, stream, final, append-only, error path.
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
import type { EventDraft, YuiEvent } from "@yuika/contracts";

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

  it("tool round dengan narasi antar tool: segmen teks baru dibuka dengan paragraf baru", async () => {
    // Fix 2026-11 (user): teks antar tool round menumpuk tanpa jeda;
    // delta "\n\n" wajib memisah segmen (round pertama TIDAK boleh
    // berawalan separator).
    resetRegistryForTests();
    registry.register({
      name: "echo_test",
      description: "test",
      parameters: z.object({ text: z.string() }),
      handler: async (args: { text: string }) => ({ result: { echoed: args.text } }),
    });
    const provider = new FakeProvider([
      {
        deltas: ["Saya cek dulu."],
        done: {
          type: "done",
          finishReason: "tool_calls",
          text: "Saya cek dulu.",
          toolCalls: [{ id: "c1", name: "echo_test", args: { text: "hai" } }],
        },
      },
      {
        deltas: ["Hasil OK, lanjut cari video."],
        done: {
          type: "done",
          finishReason: "stop",
          text: "Hasil OK, lanjut cari video.",
          toolCalls: [],
        },
      },
    ]);
    const { events, loop, sessionId, store } = makeHarness(provider);
    await loop.runTurn(sessionId, "tes separator");

    const deltas = events
      .filter((e): e is Extract<YuiEvent, { type: "message.delta" }> => e.type === "message.delta")
      .map((e) => e.delta);
    expect(deltas.join("")).toBe("Saya cek dulu.\n\nHasil OK, lanjut cari video.");
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

 // primary gagal (setelah retry internal) → fallback model SEKALI,
  // lalu iterasi berikutnya TETAP di fallback (jangan bolak-balik).
  it(": primary mati → fallback aktif otomatis + markUnhealthy dipanggil", async () => {
    resetRegistryForTests();
    class FlakyProvider implements ProviderAdapter {
      readonly id = "flaky";
      public calls: ChatRequest[] = [];
      constructor(private fallbackOk: string) {}
      async chatStream(req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
        this.calls.push(req);
        if (req.model !== this.fallbackOk) throw new Error(`model ${req.model} mati`);
        onChunk({ type: "text_delta", delta: "dari fallback" });
        const done = { type: "done" as const, finishReason: "stop" as const, text: "dari fallback", toolCalls: [] };
        onChunk(done);
        return done;
      }
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-fb-"));
    const store = new SessionStore(path.join(dir, "t.db"));
    const events: YuiEvent[] = [];
    const makeEmit = (sid: string) => (draft: EventDraft) => events.push(store.appendEvent(sid, draft));
    const sid = "s_fb";
    store.createSession(sid, "yui-coder", "SYS", []);
    const unhealthy: string[] = [];
    const provider = new FlakyProvider("glm/glm-5");
    const loop = new AgentLoop({
      store,
      provider,
      model: "glm/glm-5.1",
      routeModel: () => ({
        model: "glm/glm-5.1",
        fallback: "glm/glm-5",
        markUnhealthy: (m) => unhealthy.push(m),
      }),
      workspacePath: dir,
      approvals: new ApprovalEngine(makeEmit(sid)),
      emit: makeEmit(sid),
    });
    await loop.runTurn(sid, "kerjakan");
    // attempt 1 = primary (gagal), attempt 2 = fallback (sukses)
    expect(provider.calls.map((c) => c.model)).toEqual(["glm/glm-5.1", "glm/glm-5"]);
    expect(unhealthy).toEqual(["glm/glm-5.1"]);
    expect(events.some((e) => e.type === "session.error")).toBe(false);
    const msg = store.getMessages(sid).find((m) => m.role === "assistant");
    expect(msg?.content).toContain("dari fallback");
    store.close();
  });

 // loop memakai model dari routeModel(personaId), bukan deps.model.
  it(": routeModel per persona menentukan model sesi", async () => {
    resetRegistryForTests();
    const provider = new FakeProvider([
      { deltas: ["ok"], done: { type: "done", finishReason: "stop", text: "ok", toolCalls: [] } },
    ]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-pm-"));
    const store = new SessionStore(path.join(dir, "t.db"));
    const events: YuiEvent[] = [];
    const makeEmit = (sid: string) => (draft: EventDraft) => events.push(store.appendEvent(sid, draft));
    const sid = "s_pm";
    store.createSession(sid, "yui-scholar", "SYS", []);
    const loop = new AgentLoop({
      store,
      provider,
      model: "glm/glm-5.1",
      routeModel: () => ({ model: "glm/glm-5" }),
      workspacePath: dir,
      approvals: new ApprovalEngine(makeEmit(sid)),
      emit: makeEmit(sid),
    });
    await loop.runTurn(sid, "halo");
    expect(provider.calls[0]!.model).toBe("glm/glm-5");
    store.close();
  });
});

 // Stop ditekan saat provider streaming → abort → graceful cancel
  // (parsial tersimpan, turn.cancelled + persona.state idle, BUKAN error).
  it(": abort saat streaming → turn.cancelled graceful + parsial tersimpan", async () => {
    resetRegistryForTests();
    const ac = new AbortController();
    class HangingProvider implements ProviderAdapter {
      readonly id = "hang";
      async chatStream(req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
        onChunk({ type: "text_delta", delta: "sebagian " });
        await new Promise((_res, rej) => {
          req.signal?.addEventListener("abort", () => rej(new Error("aborted")));
          setTimeout(rej, 5_000, new Error("timeout tes"));
        });
        throw new Error("unreachable");
      }
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-ab-"));
    const store = new SessionStore(path.join(dir, "t.db"));
    const events: YuiEvent[] = [];
    const makeEmit = (sid: string) => (draft: EventDraft) => events.push(store.appendEvent(sid, draft));
    const sid = "s_abort";
    store.createSession(sid, "yui-coder", "SYS", []);
    const loop = new AgentLoop({
      store,
      provider: new HangingProvider(),
      model: "m",
      workspacePath: dir,
      approvals: new ApprovalEngine(makeEmit(sid)),
      emit: makeEmit(sid),
    });
    const p = loop.runTurn(sid, "kerjakan", { signal: ac.signal });
    setTimeout(() => ac.abort(), 50);
    await p;
    expect(events.some((e) => e.type === "turn.cancelled")).toBe(true);
    expect(events.some((e) => e.type === "session.error")).toBe(false);
    const last = [...store.getMessages(sid)].reverse().find((m) => m.role === "assistant");
    expect(last?.content).toContain("sebagian");
    expect(last?.content).toContain("dibatalkan");
    const states = events.filter((e) => e.type === "persona.state").map((e) => e.state);
    expect(states[states.length - 1]).toBe("idle");
    store.close();
  });

describe(" aux routing: kompresi pakai model murah", () => {
  it("summary call pergi ke auxModel (bukan model utama) + checkpoint merekam model aux", async () => {
    resetRegistryForTests();
    // ~50 pesan × 10k chars ≈ 125k token, melampaui ambang default 70%×128k.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-aux-"));
    const store = new SessionStore(path.join(dir, "t.db"));
    const sid = "s_aux1";
    store.createSession(sid, "yui-conductor", "SYS", []);
    for (let i = 0; i < 50; i++) {
      store.appendMessage(sid, { role: i % 2 === 0 ? "user" : "assistant", content: "x".repeat(10_000) });
    }
    const events: YuiEvent[] = [];
    const emit = (draft: EventDraft) => {
      events.push(store.appendEvent(sid, draft));
    };
    const provider = new FakeProvider([
      { done: { type: "done", finishReason: "stop", text: "RINGKASAN SESI", toolCalls: [] } }, // aux summary
      { done: { type: "done", finishReason: "stop", text: "lanjut bekerja", toolCalls: [] } }, // jawaban utama
    ]);
    const loop = new AgentLoop({
      store,
      provider,
      model: "fake-model",
      auxModel: () => "aux-cheap",
      workspacePath: dir,
      approvals: new ApprovalEngine(emit),
      emit,
    });
    await loop.runTurn(sid, "lanjutkan");
    // panggilan PERTAMA = ringkasan kompresi → wajib model aux murah
    expect(provider.calls[0]!.model).toBe("aux-cheap");
    expect(provider.calls[1]!.model).toBe("fake-model");
    // checkpoint audit: model yang dipakai tercatat
    const cp = store.latestContextCheckpoint(sid);
    expect(cp?.model).toBe("aux-cheap");
    expect(cp?.summary).toBe("RINGKASAN SESI");
    store.close();
  });

  it("tanpa auxModel → summary jatuh ke model utama sesi (aman default)", async () => {
    resetRegistryForTests();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-aux2-"));
    const store = new SessionStore(path.join(dir, "t.db"));
    const sid = "s_aux2";
    store.createSession(sid, "yui-conductor", "SYS", []);
    for (let i = 0; i < 50; i++) {
      store.appendMessage(sid, { role: i % 2 === 0 ? "user" : "assistant", content: "y".repeat(10_000) });
    }
    const provider = new FakeProvider([
      { done: { type: "done", finishReason: "stop", text: "R", toolCalls: [] } },
      { done: { type: "done", finishReason: "stop", text: "ok", toolCalls: [] } },
    ]);
    const loop = new AgentLoop({
      store,
      provider,
      model: "fake-model",
      workspacePath: dir,
      approvals: new ApprovalEngine(() => {}),
      emit: () => {},
    });
    await loop.runTurn(sid, "lanjutkan");
    expect(provider.calls[0]!.model).toBe("fake-model");
    store.close();
  });
});
