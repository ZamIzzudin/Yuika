// pause/resume anak delegasi, anak berhenti di BATAS ITERASI (tanpa
// memanggil provider) sampai resume; abort saat pause tetap graceful
// (job interrupted, bukan error); arahan steer yang datang saat pause
// ter-delain begitu resume (antrean tak hilang).
import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProviderAdapter, ChatRequest, ProviderChunk, ProviderDone } from "../provider/adapter.js";
import { SessionStore } from "../session/store.js";
import { ProjectStore } from "../project/store.js";
import { runChildPersona, type DelegationDeps } from "../delegation/runner.js";
import { registerTodoTools } from "../tools/todo-tools.js";
import { resetRegistryForTests } from "../registry.js";
import { resolveRepoRoot } from "../paths.js";
import type { EventDraft, YuiEvent } from "@yuika/contracts";

const REPO_ROOT = resolveRepoRoot(path.join(import.meta.dirname, "..", "..", "..", ".."));

let store: SessionStore;
let parentEvents: YuiEvent[];
let ws: string;
const parentSession = "s_parent_pause";

beforeEach(() => {
  resetRegistryForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-pause-"));
  store = new SessionStore(path.join(dir, "t.db"));
  registerTodoTools({ sessionStore: store, projects: new ProjectStore(path.join(dir, "p.db")) });
  ws = path.join(dir, "ws");
  fs.mkdirSync(ws, { recursive: true });
  parentEvents = [];
  store.createSession(parentSession, "yui-conductor", "SYS", ["delegate_task"]);
});

const makeEmit = () => (draft: EventDraft) => {
  parentEvents.push(store.appendEvent(parentSession, draft));
};

async function waitFor(cond: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Provider terprogram: langkah 1 minta tool (buka iterasi 2), lalu final. */
class ScriptedProvider implements ProviderAdapter {
  readonly id = "scripted";
  calls = 0;
  constructor(private script: Array<() => ProviderDone>) {}
  async chatStream(req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
    this.calls++;
    void req;
    const step = this.script.shift();
    if (!step) throw new Error("script habis");
    onChunk({ type: "text_delta", delta: "…" });
    return step();
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

describe(" pause/resume anak", () => {
  it("pause menahan iterasi (provider tak dipanggil) → resume menyelesaikan + event parent", async () => {
    const provider = new ScriptedProvider([
      () => ({ type: "done", finishReason: "tool_calls", text: "", toolCalls: [{ id: "c1", name: "todo_list", args: {} }] }),
      () => ({ type: "done", finishReason: "stop", text: "selesai setelah resume", toolCalls: [] }),
    ]);
    const { map, deps: ctl } = controlsFixture();
    const handle = runChildPersona(makeDeps(provider, ctl), { sessionId: parentSession, turnId: "t1" }, "yui-scribe", "susun laporan", null, makeEmit());

    await waitFor(() => map.size === 1);
    const c = map.get(handle.childSessionId)!;
    // iterasi 1 (tool round) berjalan → pause SEBELUM iterasi 2 mulai.
    c.pause();
    await waitFor(() => parentEvents.some((e) => e.type === "delegation.paused"));
    await new Promise((r) => setTimeout(r, 120)); // beri waktu, iterasi 2 TIDAK boleh jalan
    expect(provider.calls).toBe(1);
    expect(map.size).toBe(1); // masih aktif (ter-pause ≠ selesai)

    c.resume();
    const summary = await handle.summary;
    expect(summary).toContain("selesai setelah resume");
    // iter 1 (pra-pause) + iter 2 (pasca-resume); call ke-3 = learn nudge
 // pasca-turn (fire-and-forget, ), boleh ikut tercatat.
    expect(provider.calls).toBeGreaterThanOrEqual(2);
    // event audit parent: paused → resumed → done (urut)
    const types = parentEvents.map((e) => e.type);
    expect(types.indexOf("delegation.paused")).toBeLessThan(types.indexOf("delegation.resumed"));
    expect(types.at(-1)).toBe("delegation.done");
    const job = store.listDelegationJobs().find((j) => j.childSessionId === handle.childSessionId);
    expect(job?.status).toBe("done");
    expect(map.size).toBe(0);
  });

  it("cancel saat pause → graceful: job interrupted + kartu penanda pembatalan", async () => {
    const provider = new ScriptedProvider([
      () => ({ type: "done", finishReason: "tool_calls", text: "", toolCalls: [{ id: "c1", name: "todo_list", args: {} }] }),
      () => ({ type: "done", finishReason: "stop", text: "tak seharusnya terjadi", toolCalls: [] }),
    ]);
    const { map, deps: ctl } = controlsFixture();
    const handle = runChildPersona(makeDeps(provider, ctl), { sessionId: parentSession, turnId: "t2" }, "yui-scribe", "riset panjang", null, makeEmit());

    await waitFor(() => map.size === 1);
    const c = map.get(handle.childSessionId)!;
    c.pause();
    await waitFor(() => parentEvents.some((e) => e.type === "delegation.paused"));
    c.abort.abort(); // cancel saat ter-pause, gate harus terbangunkan, bukan menggantung

    const summary = await handle.summary;
    expect(summary).toContain("dibatalkan");
    expect(provider.calls).toBe(1); // iterasi 2 tak pernah jalan
    const job = store.listDelegationJobs().find((j) => j.childSessionId === handle.childSessionId);
    expect(job?.status).toBe("interrupted");
    const done = parentEvents.find((e) => e.type === "delegation.done");
    expect(done && done.type === "delegation.done" && done.summary.includes("dibatalkan")).toBe(true);
  });

  it("steer saat pause tetap ter-delain setelah resume (antrean tak hilang)", async () => {
    const provider = new ScriptedProvider([
      () => ({ type: "done", finishReason: "tool_calls", text: "", toolCalls: [{ id: "c1", name: "todo_list", args: {} }] }),
      (req?: ChatRequest) => {
        // iterasi 2 harus melihat pesan arahan berlabel
        void req;
        return { type: "done", finishReason: "stop", text: "oke arahan diterima", toolCalls: [] };
      },
    ]);
    const { map, deps: ctl } = controlsFixture();
    const handle = runChildPersona(makeDeps(provider, ctl), { sessionId: parentSession, turnId: "t3" }, "yui-scribe", "susun laporan", null, makeEmit());

    await waitFor(() => map.size === 1);
    const c = map.get(handle.childSessionId)!;
    c.pause();
    await waitFor(() => parentEvents.some((e) => e.type === "delegation.paused"));
    c.steer("prioritaskan ringkasan"); // masuk antrean saat ter-pause
    c.resume();

    await handle.summary;
    const childMsgs = JSON.stringify(store.getMessages(handle.childSessionId));
    expect(childMsgs).toContain("[arahan user, mid-turn] prioritaskan ringkasan");
    const steered = parentEvents.find((e) => e.type === "delegation.steered");
    expect(steered && steered.type === "delegation.steered" && steered.text.includes("prioritaskan")).toBe(true);
  });
});
