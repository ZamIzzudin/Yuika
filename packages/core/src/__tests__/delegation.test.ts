// W4-A1/A2 + W3 (TASKS.md): delegation — child persona, events ke parent,
// approval anak diteruskan ke parent stream (blocker skenario demo §2 langkah 6).
import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProviderAdapter, ChatRequest, ProviderChunk, ProviderDone } from "../provider/adapter.js";
import { SessionStore } from "../session/store.js";
import { EventBus } from "../bus.js";
import { registry, resetRegistryForTests } from "../registry.js";
import { registerFileTools } from "../tools/file-tools.js";
import { runChildPersona, type DelegationDeps } from "../delegation/runner.js";
import { resolvePendingApproval } from "../approval/engine.js";
import { resolveRepoRoot } from "../paths.js";
import type { EventDraft, YuiEvent } from "@yui/contracts";

class FakeProvider implements ProviderAdapter {
  readonly id = "fake";
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
let parentEvents: YuiEvent[];
let ws: string;
const parentSession = "s_parent";

beforeEach(() => {
  resetRegistryForTests();
  registerFileTools();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-deleg-"));
  store = new SessionStore(path.join(dir, "test.db"));
  ws = path.join(dir, "workspace");
  fs.mkdirSync(ws, { recursive: true });
  parentEvents = [];
  store.createSession(parentSession, "yui-conductor", "SYS PARENT", ["delegate_task"]);
});

function makeDeps(provider: ProviderAdapter): DelegationDeps {
  return {
    store,
    bus: EventBus,
    provider,
    model: "fake-model",
    personasDir: path.join(REPO_ROOT, "packages", "personas"),
    skillsDir: path.join(REPO_ROOT, "packages", "skills"),
    workspacePath: ws,
  };
}

function makeEmit() {
  return (draft: EventDraft) => {
    parentEvents.push(store.appendEvent(parentSession, draft));
  };
}

async function waitFor(cond: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("delegation runner", () => {
  it("child persona jalan → delegation.started/progress/done ke parent; sesi anak tersimpan", async () => {
    const child = new FakeProvider([
      { deltas: ["ring", "kasan"], done: { type: "done", finishReason: "stop", text: "ringkasan anak", toolCalls: [] } },
    ]);
    const handle = runChildPersona(
      makeDeps(child),
      { sessionId: parentSession, turnId: "t1" },
      "yui-scribe",
      "tulis laporan",
      null,
      makeEmit(),
    );
    const summary = await handle.summary;
    expect(summary).toBe("ringkasan anak");

    const types = parentEvents.map((e) => e.type);
    expect(types).toContain("delegation.started");
    expect(types).toContain("delegation.progress");
    expect(types).toContain("delegation.done");

    const started = parentEvents.find((e) => e.type === "delegation.started");
    if (started?.type === "delegation.started") {
      expect(started.personaId).toBe("yui-scribe");
      expect(started.childSessionId).toBe(handle.childSessionId);
    }
    const done = parentEvents.find((e) => e.type === "delegation.done");
    if (done?.type === "delegation.done") expect(done.summary).toBe("ringkasan anak");

    // sesi anak tersimpan: persona anak + toolset MINUS delegate_task
    const childSession = store.getSession(handle.childSessionId)!;
    expect(childSession.personaId).toBe("yui-scribe");
    expect(childSession.toolsets).not.toContain("delegate_task");
    store.close();
  });

  it("approval yang diminta ANAK muncul di parent (forwarded) dan bisa di-resolve", async () => {
    // Anak menulis file di luar reports/ → butuh approval → harus terlihat di parent.
    const child = new FakeProvider([
      {
        deltas: [],
        done: {
          type: "done",
          finishReason: "tool_calls",
          text: "",
          toolCalls: [{ id: "c1", name: "write_file", args: { path: "notes/luar-reports.txt", content: "x" } }],
        },
      },
      { deltas: ["oke"], done: { type: "done", finishReason: "stop", text: "selesai menulis", toolCalls: [] } },
    ]);
    const handle = runChildPersona(
      makeDeps(child),
      { sessionId: parentSession, turnId: "t2" },
      "yui-scribe",
      "tulis catatan",
      null,
      makeEmit(),
    );

    await waitFor(() => parentEvents.some((e) => e.type === "approval.requested"));
    const req = parentEvents.find((e) => e.type === "approval.requested");
    if (req?.type !== "approval.requested") throw new Error("approval.requested tidak ada");

    expect(resolvePendingApproval(req.requestId, true)).toBe(true);
    const summary = await handle.summary;
    expect(summary).toBe("selesai menulis");
    // file benar-benar tertulis setelah approve
    expect(fs.existsSync(path.join(ws, "notes", "luar-reports.txt"))).toBe(true);
    expect(parentEvents.some((e) => e.type === "approval.resolved")).toBe(true);
    store.close();
  });

  it("deny dihormati: file tidak tertulis, tool result isError", async () => {
    const child = new FakeProvider([
      {
        deltas: [],
        done: {
          type: "done",
          finishReason: "tool_calls",
          text: "",
          toolCalls: [{ id: "c1", name: "write_file", args: { path: "notes/ditolak.txt", content: "x" } }],
        },
      },
      { deltas: ["ya"], done: { type: "done", finishReason: "stop", text: "tidak jadi", toolCalls: [] } },
    ]);
    const handle = runChildPersona(
      makeDeps(child),
      { sessionId: parentSession, turnId: "t3" },
      "yui-scribe",
      "tulis",
      null,
      makeEmit(),
    );
    await waitFor(() => parentEvents.some((e) => e.type === "approval.requested"));
    const req = parentEvents.find((e) => e.type === "approval.requested");
    if (req?.type !== "approval.requested") throw new Error("approval.requested tidak ada");
    resolvePendingApproval(req.requestId, false);
    await handle.summary;
    expect(fs.existsSync(path.join(ws, "notes", "ditolak.txt"))).toBe(false);
    // pesan tool berisi error — cek messages sesi anak
    const childMsgs = store.getMessages(handle.childSessionId);
    const toolMsg = childMsgs.find((m) => m.role === "tool");
    expect(toolMsg?.content).toContain("denied by user");
    store.close();
  });

  it("persona asing / tidak spawnable → error", () => {
    const child = new FakeProvider([]);
    expect(() =>
      runChildPersona(makeDeps(child), { sessionId: parentSession, turnId: "t4" }, "persona-ngaco", "g", null, makeEmit()),
    ).toThrow(/tidak ditemukan/);
    store.close();
  });

  it("P1-CRED-3: cap delegasi paralel dinamis (maxChildren) — spawn di atas cap ditolak", async () => {
    const slow = new FakeProvider([]); // tak beres dalam test — anak 1 tetap "aktif"
    const deps = { ...makeDeps(slow), maxChildren: () => 1 };
    const h1 = runChildPersona(deps, { sessionId: parentSession, turnId: "t5" }, "yui-scribe", "ringkas", null, makeEmit());
    expect(() =>
      runChildPersona(deps, { sessionId: parentSession, turnId: "t5" }, "yui-analyst", "analisis", null, makeEmit()),
    ).toThrow(/batas delegation paralel \(1\) tercapai/);
    void h1.summary.catch(() => undefined);
    await new Promise((r) => setTimeout(r, 50));
    store.close();
  });
});
