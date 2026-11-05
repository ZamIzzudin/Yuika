// P0-DEL-1: delegation job persist — baris job di DB (status lintas restart),
// audit done/error, dan boot-heal menutup job 'running' jadi 'interrupted'.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetRegistryForTests } from "../registry.js";
import { SessionStore } from "../session/store.js";
import { EventBus } from "../bus.js";
import { healInterruptedTurns } from "../session/heal.js";
import { runChildPersona } from "../delegation/runner.js";
import type { ProviderAdapter, ProviderChunk, ChatRequest, ProviderDone } from "../provider/adapter.js";
import type { EventDraft } from "@yuika/contracts";
import { resolveRepoRoot } from "../paths.js";

class OkProvider implements ProviderAdapter {
  id = "fake";
  fail = false;
  async chatStream(_req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
    if (this.fail) throw new Error("provider anak mati");
    onChunk({ type: "text_delta", delta: "hasil anak" });
    return { type: "done", finishReason: "stop", text: "hasil anak", toolCalls: [] };
  }
}

const REPO_ROOT = resolveRepoRoot(path.join(import.meta.dirname, "..", "..", "..", ".."));
let dir: string;
let ws: string;
let store: SessionStore;
const PARENT = "s_parent";

beforeEach(() => {
  resetRegistryForTests();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-del1-"));
  store = new SessionStore(path.join(dir, "t.db"));
  ws = path.join(dir, "ws");
  fs.mkdirSync(ws, { recursive: true });
  store.createSession(PARENT, "yui-conductor", "SYS", [], "proj-1");
});
afterEach(() => {
  store.close();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* lenient */
  }
});

function deps(provider: OkProvider) {
  return {
    store,
    bus: EventBus,
    provider,
    model: "m",
    personasDir: path.join(REPO_ROOT, "packages", "personas"),
    skillsDir: path.join(REPO_ROOT, "packages", "skills"),
    workspacePath: ws,
  };
}

describe("delegation job persist (P0-DEL-1)", () => {
  it("job row: running → done + summary saat anak sukses", async () => {
    const handle = runChildPersona(deps(new OkProvider()), { sessionId: PARENT, turnId: "t1" }, "yui-scribe", "tulis ringkasan", null, () => {});
    await handle.summary;
    const jobs = store.listDelegationJobs("proj-1");
    expect(jobs.length).toBe(1);
    expect(jobs[0]!.status).toBe("done");
    expect(jobs[0]!.summary).toBe("hasil anak");
    expect(jobs[0]!.personaId).toBe("yui-scribe");
    expect(jobs[0]!.childSessionId).toBe(handle.childSessionId);
  });

  it("job row: error tercatat saat anak gagal (bukan hanya event)", async () => {
    const p = new OkProvider();
    const handle = runChildPersona(deps(p), { sessionId: PARENT, turnId: "t2" }, "yui-scribe", "tugas gagal", null, () => {});
    p.fail = true; // provider mati SETELAH job dibuat — simulasi crash runtime anak
    await expect(handle.summary).rejects.toThrow("provider anak mati");
    const jobs = store.listDelegationJobs("proj-1");
    expect(jobs[0]!.status).toBe("error");
    expect(jobs[0]!.error).toContain("provider anak mati");
  });

  it("boot-heal: job 'running' pasca-restart → interrupted + alasan", async () => {
    // Simulasi: server mati saat job berjalan — baris running tertinggal
    // (dibuat manual karena proses nyata tak bisa di-restart dalam satu test).
    const id = store.startDelegationJob({ parentSessionId: PARENT, parentTurnId: "t3", childSessionId: "s_child_x", personaId: "yui-coder", goal: "kerja setengah jalan" });
    expect(store.findRunningDelegationJobs().length).toBe(1);
    healInterruptedTurns(store);
    const job = store.listDelegationJobs().find((j) => j.id === id)!;
    expect(job.status).toBe("interrupted");
    expect(job.error).toContain("direstart");
    expect(store.findRunningDelegationJobs().length).toBe(0);
    // Idempoten: heal kedua tidak mengubah apa pun (sudah bukan running).
    healInterruptedTurns(store);
    expect(store.listDelegationJobs().find((j) => j.id === id)!.status).toBe("interrupted");
  });

  it("filter projectId mengikuti sesi PARENT; sesi global tak muncul di project lain", async () => {
    const handle = runChildPersona(deps(new OkProvider()), { sessionId: PARENT, turnId: "t4" }, "yui-scribe", "kerja", null, () => {});
    await handle.summary;
    expect(store.listDelegationJobs("proj-1").length).toBe(1);
    expect(store.listDelegationJobs("proj-lain").length).toBe(0);
    expect(store.listDelegationJobs().length).toBe(1);
  });

  it("kegagalan menulis job TIDAK membatalkan delegasi (best-effort)", async () => {
    const broken = {
      ...deps(new OkProvider()),
      store: new Proxy(store, {
        get(target: SessionStore, prop: string) {
          if (prop === "startDelegationJob") throw new Error("db busy");
          return (target as unknown as Record<string, unknown>)[prop];
        },
      }),
    } as never;
    const handle = runChildPersona(broken, { sessionId: PARENT, turnId: "t5" }, "yui-scribe", "tetap jalan", null, () => {});
    await expect(handle.summary).resolves.toBe("hasil anak");
  });

  it("event draft minimal tetap valid utk emit anak (smoke)", async () => {
    const seen: EventDraft[] = [];
    const handle = runChildPersona(deps(new OkProvider()), { sessionId: PARENT, turnId: "t6" }, "yui-scribe", "smoke", null, (d) => seen.push(d));
    await handle.summary;
    expect(seen.some((e) => e.type === "delegation.started")).toBe(true);
    expect(seen.some((e) => e.type === "delegation.done")).toBe(true);
  });
});
