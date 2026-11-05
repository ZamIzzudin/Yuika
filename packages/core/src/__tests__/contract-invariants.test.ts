// P0-CORE-5: CONTRACT INVARIANT TESTS — dua jaminan fondasi yang TIDAK BOLEH
// pernah regresi, dijaga sebagai test eksplisit (bukan asumsi):
//   (a) HISTORY APPEND-ONLY — messages hanya INSERT: seq monotonic, konten
//       pesan lama tidak pernah berubah/dihapus walau kompresi aktif.
//   (b) SYSTEM PROMPT & TOOLSET FROZEN PER SESI — snapshot saat createSession
//       dipakai SELURUH turn; sumber berubah setelahnya tidak memengaruhi
//       sesi berjalan (prompt-cache discipline).
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { resetRegistryForTests, registry } from "../registry.js";
import { SessionStore } from "../session/store.js";
import { AgentLoop } from "../loop.js";
import { EventBus } from "../bus.js";
import { buildContextMessages, DEFAULT_COMPRESS } from "../session/compress.js";
import type { ProviderAdapter, ProviderChunk, ChatRequest, ProviderDone } from "../provider/adapter.js";

let dir: string;
let store: SessionStore;
let ws: string;

class ScriptedProvider implements ProviderAdapter {
  id = "fake";
  reqs: ChatRequest[] = [];
  constructor(private replies: string[] = []) {}
  async chatStream(req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
    this.reqs.push(req); // rekam SELURUH wire request
    const text = this.replies.shift() ?? "ok";
    onChunk({ type: "text_delta", delta: text });
    return { type: "done", finishReason: "stop", text, toolCalls: [] };
  }
}

beforeEach(() => {
  resetRegistryForTests();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-inv-"));
  store = new SessionStore(path.join(dir, "t.db"));
  ws = path.join(dir, "ws");
  fs.mkdirSync(ws, { recursive: true });
});
afterEach(() => {
  store.close();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* lenient */
  }
});

function snapshot(): string {
  return JSON.stringify(store.getMessages("s1"));
}
/** Prefix array: a adalah prefix persis dari b (elemen demi elemen). */
function isPrefix(a: string, b: string): boolean {
  const la = JSON.parse(a) as unknown[];
  const lb = JSON.parse(b) as unknown[];
  if (la.length > lb.length) return false;
  return la.every((v, i) => JSON.stringify(v) === JSON.stringify(lb[i]));
}

describe("(a) history append-only", () => {
  it("pesan lama identik & seq monotonic lintas banyak turn + kompresi aktif", async () => {
    store.createSession("s1", "yui-scribe", "SYS-ORI", []);
    const provider = new ScriptedProvider(["j1", "j2", "j3"]);
    const loop = new AgentLoop({ store, provider, model: "m", workspacePath: ws, approvals: { request: async () => true } as never, emit: () => {} });
    const s0 = snapshot();
    await loop.runTurn("s1", "tanya-1");
    const s1 = snapshot();
    await loop.runTurn("s1", "tanya-2");
    const s2 = snapshot();
    await loop.runTurn("s1", "tanya-3");

    // Prefix history TIDAK PERNAH berubah: s0 ⊂ s1 ⊂ s2 ⊂ final (elemen demi elemen)
    expect(isPrefix(s0, s1)).toBe(true);
    expect(isPrefix(s1, s2)).toBe(true);
    expect(isPrefix(s2, snapshot())).toBe(true);

    // …walau kompresi checkpoint dibuat (view berubah, TABEL tidak)
    await buildContextMessages(store, provider, "m", "s1", { ...DEFAULT_COMPRESS, contextTokens: 300, threshold: 0.5, keepRecent: 2, minMessages: 4 });
    expect(isPrefix(s2, snapshot())).toBe(true);

    // seq Strictly-increasing, tidak ada duplikat/gap
    const msgs = store.getMessagesWithSeq("s1");
    for (let i = 1; i < msgs.length; i++) expect(msgs[i]!.seq).toBeGreaterThan(msgs[i - 1]!.seq);
  });
});

describe("(b) system prompt & toolset frozen per sesi", () => {
  it("sumber berubah pasca-create → sesi tetap pakai snapshot (store & wire)", async () => {
    registry.register({ name: "t_stable", description: "d", parameters: z.object({}), handler: async () => ({ result: "ok" }) });
    store.createSession("s1", "yui-scribe", "SYS-ORI", ["t_stable"]); // toolset = snapshot nama tool
    const provider = new ScriptedProvider(["ok"]);
    const loop = new AgentLoop({ store, provider, model: "m", workspacePath: ws, approvals: { request: async () => true } as never, emit: () => {} });
    await loop.runTurn("s1", "halo");

    // Sumber "berubah": registry bertambah tool baru — snapshot sesi tetap.
    const session = store.getSession("s1")!;
    expect(session.systemPrompt).toBe("SYS-ORI");
    expect(session.toolsets).toEqual(["t_stable"]);
    registry.register({ name: "t_added_late", description: "d", parameters: z.object({}), handler: async () => ({ result: "ok" }) });

    await loop.runTurn("s1", "lagi");
    // Wire: system prompt & toolset sesi tetap snapshot awal di SEMUA request.
    for (const req of provider.reqs) {
      expect(req.messages[0]).toEqual({ role: "system", content: "SYS-ORI" });
      const names = (req.tools ?? []).map((t) => t.name);
      expect(names).toContain("t_stable");
      // tool TERLAMBAT didaftarkan TIDAK pernah bocor ke sesi — toolset frozen.
      expect(names).not.toContain("t_added_late");
    }
    // toolset sesi di store tidak berubah pasca-turn.
    expect(store.getSession("s1")!.toolsets).toEqual(["t_stable"]);
  });
});
