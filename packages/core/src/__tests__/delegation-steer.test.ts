// P0-DEL-2: cancel/steer anak delegasi dari parent, arahan mid-turn di-drain
// loop anak tiap awal iterasi; abort menutup job sebagai interrupted (bukan error)
// dan kartu delegasi parent ditutup dengan penanda pembatalan.
import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProviderAdapter, ChatRequest, ProviderChunk, ProviderDone } from "../provider/adapter.js";
import { SessionStore } from "../session/store.js";
import { ProjectStore } from "../project/store.js";
import { runChildPersona, type DelegationDeps } from "../delegation/runner.js";
import { registerTodoTools } from "../tools/todo-tools.js";
import { registry, resetRegistryForTests } from "../registry.js";
import { resolveRepoRoot } from "../paths.js";
import type { EventDraft, YuiEvent } from "@yuika/contracts";

const REPO_ROOT = resolveRepoRoot(path.join(import.meta.dirname, "..", "..", "..", ".."));

let store: SessionStore;
let parentEvents: YuiEvent[];
let ws: string;
const parentSession = "s_parent2";

beforeEach(() => {
  resetRegistryForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-steer-"));
  store = new SessionStore(path.join(dir, "test.db"));
  registerTodoTools({ sessionStore: store, projects: new ProjectStore(path.join(dir, "p.db")) });
  ws = path.join(dir, "workspace");
  fs.mkdirSync(ws, { recursive: true });
  parentEvents = [];
  store.createSession(parentSession, "yui-conductor", "SYS", ["delegate_task"]);
});

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

/** Provider script: merekam messages per panggilan (untuk assert steer terlihat). */
class ScriptedProvider implements ProviderAdapter {
  readonly id = "scripted";
  calls: ChatRequest[] = [];
  constructor(private script: Array<(req: ChatRequest) => ProviderDone>) {}
  async chatStream(req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
    this.calls.push(req);
    const step = this.script.shift();
    if (!step) throw new Error("script habis");
    for (const d of ["…"]) onChunk({ type: "text_delta", delta: d });
    return step(req);
  }
}

/** Provider yang menggantung sampai signal abort (simulasi panggilan panjang). */
class HangingProvider implements ProviderAdapter {
  readonly id = "hanging";
  calls = 0;
  async chatStream(req: ChatRequest): Promise<ProviderDone> {
    this.calls++;
    return new Promise((_resolve, reject) => {
      const onAbort = () => reject(new Error("aborted"));
      if (req.signal?.aborted) return onAbort();
      req.signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}

function controlsFixture() {
  const map = new Map<
    string,
    { abort: AbortController; steer: (t: string) => void; pause: () => void; resume: () => void }
  >();
  const deps = {
    register: (
      id: string,
      _parent: string,
      ctl: { abort: AbortController; steer: (t: string) => void; pause: () => void; resume: () => void },
    ) => map.set(id, ctl),
    unregister: (id: string) => map.delete(id),
  };
  return { map, deps };
}

function makeDeps(provider: ProviderAdapter, controls?: DelegationDeps["controls"]): DelegationDeps {
  return {
    store,
    bus: { publish: () => {} } as unknown as DelegationDeps["bus"],
    provider,
    model: "fake-model",
    personasDir: path.join(REPO_ROOT, "packages", "personas"),
    skillsDir: path.join(REPO_ROOT, "packages", "skills"),
    workspacePath: ws,
    controls,
  };
}

describe("P0-DEL-2 steer anak", () => {
  it("arahan mid-turn di-drain di iterasi berikutnya, terlihat provider & sesi anak", async () => {
    const provider = new ScriptedProvider([
      () => ({ type: "done", finishReason: "tool_calls", text: "", toolCalls: [{ id: "c1", name: "todo_list", args: {} }] }),
      () => ({ type: "done", finishReason: "stop", text: "oke, fokus ke ringkasan eksekutif", toolCalls: [] }),
    ]);
    const { map, deps: ctl } = controlsFixture();
    const handle = runChildPersona(makeDeps(provider, ctl), { sessionId: parentSession, turnId: "t1" }, "yui-scribe", "susun laporan", null, makeEmit());

    // anak mulai → kontrol terdaftar; kirim arahan SEBELUM iterasi 2 drain.
    await waitFor(() => map.size === 1);
    map.get(handle.childSessionId)!.steer("fokus ke ringkasan eksekutif, buang detail");
    // delegation.steered event ke parent (audit trail)
    expect(parentEvents.some((e) => e.type === "delegation.steered" && e.text.includes("ringkasan"))).toBe(true);

    const summary = await handle.summary;
    expect(summary).toContain("ringkasan");
    // iterasi 2 provider menerima pesan arahan berlabel
    const iter2 = provider.calls[1]!;
    expect(JSON.stringify(iter2.messages)).toContain("[arahan user, mid-turn] fokus ke ringkasan eksekutif");
    // arahan tercatat di history sesi anak (bukan hilang di prompt saja)
    const childMsgs = store.getMessages(handle.childSessionId);
    expect(JSON.stringify(childMsgs)).toContain("[arahan user, mid-turn]");
    // kontrol dilepas setelah selesai
    expect(map.size).toBe(0);
  });

  it("steer tanpa kontrol terdaftar = tidak melempar (opsional)", async () => {
    const provider = new ScriptedProvider([
      () => ({ type: "done", finishReason: "stop", text: "selesai", toolCalls: [] }),
    ]);
    const handle = runChildPersona(makeDeps(provider), { sessionId: parentSession, turnId: "t2" }, "yui-scribe", "tugas singkat", null, makeEmit());
    await handle.summary;
    expect(parentEvents.at(-1)?.type).toBe("delegation.done");
  });
});

describe("P0-DEL-2 cancel anak", () => {
  it("abort → job interrupted (bukan error) + kartu delegasi ditutup penanda pembatalan", async () => {
    const provider = new HangingProvider();
    const { map, deps: ctl } = controlsFixture();
    const handle = runChildPersona(makeDeps(provider, ctl), { sessionId: parentSession, turnId: "t3" }, "yui-scribe", "riset panjang", null, makeEmit());
    await waitFor(() => map.size === 1);

    map.get(handle.childSessionId)!.abort.abort();
    const summary = await handle.summary;

    expect(summary).toContain("dibatalkan");
    const done = parentEvents.find((e) => e.type === "delegation.done");
    expect(done && done.type === "delegation.done" && done.summary.includes("dibatalkan")).toBe(true);
    // job row jujur: interrupted, bukan error
    const jobs = store.listDelegationJobs(); // sesi tanpa project → semua job
    const job = jobs.find((j) => j.childSessionId === handle.childSessionId);
    expect(job?.status).toBe("interrupted");
    expect(map.size).toBe(0); // unregister
  });
});
