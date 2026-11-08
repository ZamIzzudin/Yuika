// audit isolasi konteks anak, sesi anak FRESH: tidak membawa
// history parent (pesan user/model/tool parent), prompt anak hanya goal +
// system persona anak + memori global. Diverifikasi lewat messages &
// systemPrompt tersimpan, bukan sekadar asumsi "fresh session".
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetRegistryForTests } from "../registry.js";
import { SessionStore } from "../session/store.js";
import { EventBus } from "../bus.js";
import { runChildPersona } from "../delegation/runner.js";
import type { ProviderAdapter, ProviderChunk, ChatRequest, ProviderDone } from "../provider/adapter.js";
import type { EventDraft } from "@yuika/contracts";
import { resolveRepoRoot } from "../paths.js";

class OneShotProvider implements ProviderAdapter {
  id = "fake";
  called = 0;
  reqs: ChatRequest[] = [];
  async chatStream(req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
    this.reqs.push(req); // simpan SELURUH request yang diterima provider
    this.called++;
    onChunk({ type: "text_delta", delta: "ok" });
    return { type: "done", finishReason: "stop", text: "ok", toolCalls: [] };
  }
}

const REPO_ROOT = resolveRepoRoot(path.join(import.meta.dirname, "..", "..", "..", ".."));
let dir: string;
let store: SessionStore;
let ws: string;
const PARENT = "s_parent";

beforeEach(() => {
  resetRegistryForTests();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-del4-"));
  store = new SessionStore(path.join(dir, "t.db"));
  ws = path.join(dir, "ws");
  fs.mkdirSync(ws, { recursive: true });
  store.createSession(PARENT, "yui-conductor", "SYS PARENT", ["delegate_task"]);
});

afterEach(() => {
  store.close();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* lenient */
  }
});

describe("isolasi konteks anak ()", () => {
  it("anak tidak melihat history parent: messages & request provider bersih", async () => {
    // Parent history "kotor": rahasia & tool call yang TIDAK boleh bocor ke anak.
    store.appendMessage(PARENT, { role: "user", content: "RAHASIA-INTERNAL jangan bocor" });
    store.appendMessage(PARENT, {
      role: "assistant",
      content: "tool read_file .env hasil API_KEY=supersecretvalue123",
    } as never);

    const provider = new OneShotProvider();
    const handle = runChildPersona(
      {
        store,
        bus: EventBus,
        provider,
        model: "fake-model",
        personasDir: path.join(REPO_ROOT, "packages", "personas"),
        skillsDir: path.join(REPO_ROOT, "packages", "skills"),
        workspacePath: ws,
      },
      { sessionId: PARENT, turnId: "t1" },
      "yui-scribe",
      "Ringkas laporan menjadi 3 poin",
      null,
      ((_d: EventDraft) => {}) as never,
    );
    await handle.summary;

    // 1) Sesi anak baru & fresh, bukan lanjutan parent.
    const child = store.getSession(handle.childSessionId)!;
    expect(child.id).not.toBe(PARENT);
    expect(child.personaId).toBe("yui-scribe");
    expect(child.systemPrompt).not.toContain("RAHASIA-INTERNAL");

    // 2) Messages anak hanya berisi goal (user) + jawaban anak, tanpa history parent.
    const msgs = store.getMessages(handle.childSessionId);
    const bodies = msgs.map((m) => JSON.stringify(m.content));
    for (const b of bodies) {
      expect(b).not.toContain("RAHASIA-INTERNAL");
      expect(b).not.toContain("supersecretvalue123");
    }
    expect(bodies.join(" ")).toContain("Ringkas laporan");

    // 3) Apa yang dikirim provider = system prompt anak + messages anak saja.
    expect(provider.called).toBeGreaterThan(0);
    for (const req of provider.reqs) {
      const wire = JSON.stringify(req);
      expect(wire).not.toContain("RAHASIA-INTERNAL");
      expect(wire).not.toContain("supersecretvalue123");
    }
  });
});
