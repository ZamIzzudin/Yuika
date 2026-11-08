// Batch 16 (Team Assembly), assign roster otomatis:
//  · workflow run start → ensureFullRoster(projectId) dipanggil (semua persona
//    masuk roster, merge, entry custom utuh)
//  · delegasi (runChildPersona) → onChildSpawn(personaId, projectId) dipanggil
//    (runtime memakai ini untuk merge-assign anak ke roster)
//  · sesi project dengan persona yang TIDAK di-roster → runtime menolak
//    (enforcement hidup di runtime.createSession; dungeon dikecualikan).
import { afterEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { loadWorkflowYaml, SEVEN_PHASE_TEMPLATE_YAML } from "@yuika/contracts";
import { WorkflowEngine } from "../workflow/engine.js";
import { EventBus } from "../bus.js";
import type { ProviderAdapter, ProviderDone } from "../provider/adapter.js";
import { ProjectStore } from "../project/store.js";
import { SessionStore } from "../session/store.js";
import { runChildPersona } from "../delegation/runner.js";
import { resolveRepoRoot } from "../paths.js";

const REPO_ROOT = resolveRepoRoot(path.join(import.meta.dirname, "..", "..", "..", ".."));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "yui-roster-"));
const ws = path.join(tmp, "ws");
fs.mkdirSync(ws, { recursive: true });

const stubProvider: ProviderAdapter = {
  id: "stub",
  async chatStream(): Promise<ProviderDone> {
    return { type: "done", finishReason: "stop", text: "ok", toolCalls: [] };
  },
};

function makeStores() {
  const dir = path.join(tmp, `db-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(dir, { recursive: true });
  const projects = new ProjectStore(path.join(dir, "test.db"));
  const store = new SessionStore(path.join(dir, "test.db"));
  return { dir, projects, store };
}

describe("Batch 16, Team Assembly (roster assign)", () => {
  it("workflow engine.start → ensureFullRoster dipanggil dengan projectId", async () => {
    const { dir: dirRef, projects, store } = makeStores();
    try {
      projects.createProject({ id: "p_w", name: "W", rootPath: "projects/p_w" });
      const ensure = vi.fn();
      const engine = new WorkflowEngine({
        store,
        bus: EventBus,
        provider: stubProvider,
        model: "fake-model",
        personasDir: path.join(REPO_ROOT, "packages", "personas"),
        skillsDir: path.join(REPO_ROOT, "packages", "skills"),
        workspacePath: ws,
        projects,
        ensureFullRoster: ensure,
      });
      try {
        engine.startRun({ projectId: "p_w", brief: "demo", workflow: loadWorkflowYaml(SEVEN_PHASE_TEMPLATE_YAML) });
      } catch {
        /* run boleh gagal/gated, panggilan roster tetap wajib terjadi */
      }
      expect(ensure).toHaveBeenCalledTimes(1);
      expect(ensure).toHaveBeenCalledWith("p_w");
    } finally {
      /* cleanup: tmp per-file (Windows EPERM bila sqlite masih terbuka) */
    }
  }, 20_000);

  it("delegasi anak → onChildSpawn(personaId, projectId) dipanggil", async () => {
    const { dir: dirRef, projects, store } = makeStores();
    try {
      projects.createProject({ id: "p_d", name: "D", rootPath: "projects/p_d" });
      store.createSession("s_parent", "yui-conductor", "sys", [], "p_d");
      const onChildSpawn = vi.fn();
      const handle = runChildPersona(
        {
          store,
          bus: EventBus,
          provider: stubProvider,
          model: "fake-model",
          personasDir: path.join(REPO_ROOT, "packages", "personas"),
          skillsDir: path.join(REPO_ROOT, "packages", "skills"),
          workspacePath: ws,
          onChildSpawn,
        },
        { sessionId: "s_parent", turnId: "t1" },
        "yui-scholar",
        "riset singkat",
        null,
        () => undefined,
      );
      await handle.summary.catch(() => undefined);
      expect(onChildSpawn).toHaveBeenCalledWith("yui-scholar", "p_d");
    } finally {
      /* cleanup: tmp per-file (Windows EPERM bila sqlite masih terbuka) */
    }
  }, 20_000);
});

afterEach(() => {
  /* db ditutup per-test di finally */
});
