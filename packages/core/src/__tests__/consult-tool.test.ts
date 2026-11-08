// P2-PM-2 (D22): consult, brainstorm multi-persona terstruktur untuk Planner.
// Verifikasi: 2 persona konsultasi PARALEL → 2 jawaban berlabel + prompt anak
// berformat tetap (PENDAPAT/RISIKO/SARAN/ASUMSI) berisi pertanyaan; duplikat
// persona didedupe; persona asing → isError rapi (bukan crash).
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetRegistryForTests, registry } from "../registry.js";
import { registerConsultTool } from "../tools/consult-tool.js";
import { SessionStore } from "../session/store.js";
import { EventBus } from "../bus.js";
import type { ProviderAdapter, ProviderChunk, ChatRequest, ProviderDone } from "../provider/adapter.js";
import type { EventDraft } from "@yuika/contracts";
import { resolveRepoRoot } from "../paths.js";

class FakeProvider implements ProviderAdapter {
  id = "fake";
  constructor(private script: { deltas?: string[]; done: ProviderDone }[]) {}
  async chatStream(_req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
    const step = this.script.shift();
    if (!step) throw new Error("script habis");
    for (const d of step.deltas ?? []) onChunk({ type: "text_delta", delta: d });
    return step.done;
  }
}

const REPO_ROOT = resolveRepoRoot(path.join(import.meta.dirname, "..", "..", "..", ".."));
let store: SessionStore;
let ws: string;
let dir: string;
const parentSession = "s_planner";

beforeEach(() => {
  resetRegistryForTests();
  registerConsultTool({
    store: (store = new SessionStore(path.join((dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-consult-"))), "t.db"))),
    bus: EventBus,
    provider: new FakeProvider([]), // di-set ulang per test via register ulang
    model: "fake-model",
    personasDir: path.join(REPO_ROOT, "packages", "personas"),
    skillsDir: path.join(REPO_ROOT, "packages", "skills"),
    workspacePath: (ws = path.join(dir, "ws")),
  } as never);
  fs.mkdirSync(ws, { recursive: true });
  store.createSession(parentSession, "yui-planner", "SYS PLANNER", ["consult"]);
});

afterEach(() => {
  store.close();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* lenient (EPERM Windows WAL) */
  }
});

function ctx() {
  return {
    sessionId: parentSession,
    turnId: "t1",
    workspacePath: ws,
    requestApproval: async () => true,
    emit: ((_d: EventDraft) => {}) as never,
  };
}

describe("consult tool (P2-PM-2)", () => {
  it("2 persona konsultasi paralel → 2 jawaban berlabel; prompt anak berformat tetap + pertanyaan", async () => {
    resetRegistryForTests();
    const provider = new FakeProvider([
      { deltas: ["PENDAPAT: pakai npm"], done: { type: "done", finishReason: "stop", text: "PENDAPAT: pakai npm RISIKO: lockfile SARAN: mulai migrasi ASUMSI: offline", toolCalls: [] } },
      { done: { type: "done", finishReason: "stop", text: "PENDAPAT: data di xlsx RISIKO: format campur SARAN: sampling ASUMSI: satu sheet", toolCalls: [] } },
    ]);
    registerConsultTool({
      store,
      bus: EventBus,
      provider,
      model: "fake-model",
      personasDir: path.join(REPO_ROOT, "packages", "personas"),
      skillsDir: path.join(REPO_ROOT, "packages", "skills"),
      workspacePath: ws,
    } as never);

    const res = await registry.dispatch("consult", { personas: ["yui-scholar", "yui-analyst"], question: "Stack build untuk 100+ modul?" }, ctx());
    expect(res.isError).toBeFalsy();
    const r = res.result as { answers: { persona: string; answer: string }[]; guidance: string };
    expect(r.answers.map((a) => a.persona).sort()).toEqual(["yui-analyst", "yui-scholar"]);
    expect(r.answers.every((a) => a.answer.includes("PENDAPAT:"))).toBe(true);
    expect(r.guidance).toContain("Sintesis");

    // prompt anak: sesi anak tersimpan dengan prompt berformat tetap + pertanyaan
    expect(r.answers).toHaveLength(2);
    for (const a of r.answers as unknown as { persona: string; childSessionId: string; answer: string }[]) {
      const msgs = store.getMessages(a.childSessionId);
      const userMsg = msgs.find((m) => m.role === "user");
      expect(userMsg?.content).toContain("Stack build untuk 100+ modul?");
      expect(userMsg?.content).toContain("PENDAPAT:");
      expect(userMsg?.content).toContain("ASUMSI:");
      expect(store.getSession(a.childSessionId)?.personaId).toBe(a.persona);
    }
  });

  it("duplikat persona didedupe (1 panggilan saja)", async () => {
    resetRegistryForTests();
    const provider = new FakeProvider([
      { done: { type: "done", finishReason: "stop", text: "PENDAPAT: satu", toolCalls: [] } },
    ]);
    registerConsultTool({ store, bus: EventBus, provider, model: "fake-model", personasDir: path.join(REPO_ROOT, "packages", "personas"), skillsDir: path.join(REPO_ROOT, "packages", "skills"), workspacePath: ws } as never);

    const res = await registry.dispatch("consult", { personas: ["yui-scribe", "yui-scribe"], question: "Format laporan?" }, ctx());
    const r = res.result as { answers: { persona: string; childSessionId: string }[] };
    expect(r.answers).toHaveLength(1);
    expect(store.getSession(r.answers[0]!.childSessionId)?.personaId).toBe("yui-scribe");
  });

  it("persona asing → isError rapi (bukan crash) dari dispatch", async () => {
    const res = await registry.dispatch("consult", { personas: ["persona-ngaco"], question: "x?" }, ctx());
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.result)).toContain("tidak ditemukan");
  });
});
