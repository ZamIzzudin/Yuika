// P1-MEM-2: learn nudge — aux call pasca-turn memutuskan 0/1 catatan.
// Provider palsu mengembalikan JSON; verifikasi: note → memory_append + event
// memory.noted; none → tak ada tulisan; JSON rusak → skip aman; YUI_LEARN=0 → off.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProviderAdapter, ProviderChunk, ChatRequest } from "../provider/adapter.js";
import { resetRegistryForTests, registry } from "../registry.js";
import { registerMemoryTools } from "../tools/memory-tools.js";
import { runLearnNudge, compactTranscript } from "../memory/nudge.js";
import { readMemory } from "../memory/manager.js";
import { SessionStore } from "../session/store.js";
import { ProjectStore } from "../project/store.js";

/** Provider palsu: selalu balas `reply` sebagai final text. */
function fakeProvider(reply: string): ProviderAdapter {
  return {
    id: "fake",
    chatStream: async (_req: ChatRequest, onChunk: (c: ProviderChunk) => void) => {
      onChunk({ type: "text_delta", delta: reply });
      return { type: "done", text: reply, finishReason: "stop", toolCalls: [] } as never;
    },
  };
}

const transcript = [
  { role: "user" as const, content: "Tolong pakai bahasa Indonesia yang ringkas saja ya" },
  { role: "assistant" as const, content: "Siap, dicatat." },
];

describe("learn nudge (P1-MEM-2)", () => {
  let ws: string;
  let sessions: SessionStore;
  const noted: unknown[] = [];
  const emit = (d: unknown) => noted.push(d);

  beforeEach(() => {
    resetRegistryForTests();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-nudge-"));
    ws = path.join(dir, "ws");
    sessions = new SessionStore(path.join(dir, "s.db"));
    const projects = new ProjectStore(path.join(dir, "p.db"));
    projects.createProject({ id: "p_a", name: "A", rootPath: "projects/p_a" });
    sessions.createSession("s_1", "yui-conductor", "SYS", [], "p_a");
    registerMemoryTools({ sessionStore: sessions, projects, workspacePath: ws });
    noted.length = 0;
    delete process.env.YUI_LEARN;
  });
  afterEach(() => delete process.env.YUI_LEARN);

  it("note valid → tertulis via memory_append + emit memory.noted", async () => {
    const res = await runLearnNudge({
      provider: fakeProvider('{"note":"user ingin jawaban ringkas bahasa Indonesia","scope":"user"}'),
      model: "m",
      personaId: "yui-conductor",
      personaName: "Yui Conductor",
      transcript,
      sessionId: "s_1",
      turnId: "t1",
      workspacePath: ws,
      emit: emit as never,
    });
    expect(res.note).toContain("ringkas");
    expect(readMemory(ws, "user")).toContain("ringkas");
    expect(noted.some((e) => (e as { type: string }).type === "memory.noted")).toBe(true);
  });

  it("none → tidak menulis apa pun", async () => {
    const res = await runLearnNudge({
      provider: fakeProvider('{"note":null,"scope":"user"}'),
      model: "m",
      personaId: "yui-conductor",
      personaName: "Yui",
      transcript,
      sessionId: "s_1",
      turnId: "t1",
      workspacePath: ws,
      emit: emit as never,
    });
    expect(res.skipped).toContain("none");
    expect(readMemory(ws, "user")).not.toContain("ringkas");
    expect(noted).toHaveLength(0);
  });

  it("JSON rusak / teks bebas → skip aman (tidak throw, tidak menulis)", async () => {
    const res = await runLearnNudge({
      provider: fakeProvider("Maaf, saya tidak yakin harus mencatat apa."),
      model: "m",
      personaId: "yui-conductor",
      personaName: "Yui",
      transcript,
      sessionId: "s_1",
      turnId: "t1",
      workspacePath: ws,
      emit: emit as never,
    });
    expect(res.skipped).toContain("JSON");
  });

  it("YUI_LEARN=0 → disabled tanpa memanggil provider", async () => {
    process.env.YUI_LEARN = "0";
    let called = 0;
    const res = await runLearnNudge({
      provider: { id: "f", chatStream: async () => { called++; return { type: "done" } as never; } },
      model: "m",
      personaId: "yui-conductor",
      personaName: "Yui",
      transcript,
      sessionId: "s_1",
      turnId: "t1",
      workspacePath: ws,
      emit: emit as never,
    });
    expect(res.skipped).toContain("YUI_LEARN");
    expect(called).toBe(0);
  });

  it("scope project pada sesi project → MEMORY.md project yang ditulis", async () => {
    const res = await runLearnNudge({
      provider: fakeProvider('```json\n{"note":"stack proyek: Next.js + SQLite","scope":"project"}\n```'),
      model: "m",
      personaId: "yui-conductor",
      personaName: "Yui Conductor",
      transcript,
      sessionId: "s_1",
      turnId: "t1",
      workspacePath: ws,
      emit: emit as never,
    });
    expect(res.scope).toBe("project");
    expect(readMemory(ws, "project", path.join(ws, "projects/p_a"), "A")).toContain("Next.js");
  });

  it("P1-INF-3: model aux dipakai bila YUI_AUX_MODEL diset (preferensi aux > alias lama > model utama)", async () => {
    process.env.YUI_AUX_MODEL = "m-aux-murah";
    const seen: string[] = [];
    const p: ProviderAdapter = {
      id: "fake",
      chatStream: async (req, onChunk) => {
        seen.push(req.model);
        onChunk({ type: "text_delta", delta: '{"note":null,"scope":"user"}' });
        return { type: "done", text: '{"note":null,"scope":"user"}', finishReason: "stop", toolCalls: [] } as never;
      },
    };
    const res = await runLearnNudge({ provider: p, model: "m", personaId: "yui-conductor", personaName: "Yui Conductor", transcript, sessionId: "s_1", turnId: "t1", workspacePath: ws, emit: emit as never });
    expect(seen).toEqual(["m-aux-murah"]);
    expect(res.skipped).toContain("none");
    delete process.env.YUI_AUX_MODEL;
  });

  it("P1-INF-3/CRED: panggilan aux ter-meter lewat recordUsage (token jujur di ledger)", async () => {
    const usages: { model: string; prompt: number; output: number }[] = [];
    const p: ProviderAdapter = {
      id: "fake",
      chatStream: async (_req, onChunk) => {
        onChunk({ type: "text_delta", delta: '{"note":null,"scope":"user"}' });
        return { type: "done", text: '{"note":null,"scope":"user"}', finishReason: "stop", toolCalls: [], usage: { inputTokens: 42, outputTokens: 7 } } as never;
      },
    };
    await runLearnNudge({
      provider: p, model: "m", personaId: "yui-conductor", personaName: "Yui Conductor", transcript,
      sessionId: "s_1", turnId: "t1", workspacePath: ws, emit: emit as never,
      recordUsage: (u) => usages.push({ model: u.model, prompt: u.promptTokens, output: u.outputTokens }),
    });
    expect(usages).toEqual([{ model: "m", prompt: 42, output: 7 }]);
  });

  it("compactTranscript memotong & menyertakan nama tool assistant", () => {
    const s = compactTranscript([
      { role: "assistant" as const, content: "kerjakan", toolCalls: [{ id: "c1", name: "write_file", args: {} } as never] },
      { role: "tool" as never, toolCallId: "c1", content: "ok" } as never,
    ]);
    expect(s).toContain("write_file");
    expect(s).toContain("tool(c1)");
  });
});
