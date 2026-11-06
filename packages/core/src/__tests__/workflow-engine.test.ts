// P2-FLOW-2/3 — workflow engine v0: fase sequential/parallel, gate antar fase,
// event workflow.*, persist run + resume pasca-restart (step done tak diulang,
// gate yang belum diputuskan ditanya ulang).
// Acceptance FLOW-2: template 7 fase jalan E2E (provider fake tanpa script habis).
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProviderAdapter, ChatRequest, ProviderChunk, ProviderDone } from "../provider/adapter.js";
import { SessionStore } from "../session/store.js";
import { EventBus } from "../bus.js";
import { registry, resetRegistryForTests } from "../registry.js";
import { registerFileTools } from "../tools/file-tools.js";
import { ProjectStore } from "../project/store.js";
import { WorkflowEngine } from "../workflow/engine.js";
import { loadWorkflowYaml, SEVEN_PHASE_TEMPLATE_YAML, type YuiEvent, type WorkflowDef } from "@yuika/contracts";
import { resolveRepoRoot } from "../paths.js";

/** Provider tak pernah habis: tiap call = satu kalimat deterministik. */
class EndlessProvider implements ProviderAdapter {
  readonly id = "endless";
  calls = 0;
  async chatStream(_req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
    this.calls++;
    onChunk({ type: "text_delta", delta: `step-output-${this.calls}` });
    return { type: "done", finishReason: "stop", text: `step-output-${this.calls}`, toolCalls: [] };
  }
}

/** Provider yang gagal pada call ke-N (simulasi step gagal). */
class FailAtProvider implements ProviderAdapter {
  readonly id = "failat";
  calls = 0;
  constructor(private readonly failAt: number) {}
  async chatStream(_req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
    this.calls++;
    if (this.calls === this.failAt) throw new Error("simulated provider failure");
    onChunk({ type: "text_delta", delta: `ok-${this.calls}` });
    return { type: "done", finishReason: "stop", text: `ok-${this.calls}`, toolCalls: [] };
  }
}

const REPO_ROOT = resolveRepoRoot(path.join(import.meta.dirname, "..", "..", "..", ".."));

let store: SessionStore;
let projects: ProjectStore;
let events: YuiEvent[];
let ws: string;
/** Hygiene: bus global — semua subscription dibersihkan tiap test. */
const subs: Array<() => void> = [];

beforeEach(() => {
  resetRegistryForTests();
  registerFileTools();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-flow-"));
  store = new SessionStore(path.join(dir, "test.db"));
  projects = new ProjectStore(path.join(dir, "test.db"));
  ws = path.join(dir, "workspace");
  fs.mkdirSync(ws, { recursive: true });
  events = [];
  subs.push(EventBus.subscribeAll((e) => events.push(e)));
  projects.createProject({ id: "p_demo", name: "Demo", rootPath: ws });
});

afterEach(() => {
  for (const off of subs.splice(0)) off();
});

function makeEngine(provider: ProviderAdapter): WorkflowEngine {
  return new WorkflowEngine({
    store,
    bus: EventBus,
    provider,
    model: "fake-model",
    personasDir: path.join(REPO_ROOT, "packages", "personas"),
    skillsDir: path.join(REPO_ROOT, "packages", "skills"),
    workspacePath: ws,
    projects,
  });
}

async function waitFor(cond: () => boolean, ms = 15_000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms)
      throw new Error(`waitFor timeout — events: ${events.map((e) => e.type).slice(-30).join(",")}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

const types = () => events.map((e) => e.type);
const template = () => loadWorkflowYaml(SEVEN_PHASE_TEMPLATE_YAML);

/** Auto-approve gates: begitu gate.await muncul → approve. */
function autoApproveGates(engine: WorkflowEngine): void {
  const seen = new Set<string>();
  subs.push(
    EventBus.subscribeAll((e) => {
      if (e.type === "workflow.gate.await" && !seen.has(e.runId + e.phaseId)) {
        seen.add(e.runId + e.phaseId);
        queueMicrotask(() => engine.approveGate(e.runId, "approved"));
      }
    }),
  );
}

describe("P2-FLOW-2 — engine v0", () => {
  it("template 7 fase jalan E2E: semua fase + step selesai, run done", async () => {
    const engine = makeEngine(new EndlessProvider());
    autoApproveGates(engine);
    const { runId, leadSessionId } = engine.startRun({ projectId: "p_demo", workflow: template(), brief: "Build a landing page" });
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "done");

    const run = projects.getWorkflowRun(runId)!;
    expect(run.phaseStates.map((p) => p.status)).toEqual(Array(7).fill("done"));
    expect(run.phaseStates.flatMap((p) => p.steps)).toHaveLength(12);
    expect(run.phaseStates.flatMap((p) => p.steps).every((s) => s.ok === true)).toBe(true);
    // event run utuh di sesi lead (replay gratis via stream sesi)
    expect(types().filter((t) => t === "workflow.started")).toHaveLength(1);
    expect(types().filter((t) => t === "phase.done")).toHaveLength(7);
    expect(types().filter((t) => t === "workflow.done")).toHaveLength(1);
    expect(events.find((e) => e.type === "workflow.done")).toMatchObject({ ok: true });
    expect(store.getSession(leadSessionId)?.personaId).toBe("yui-conductor");
    expect(types().filter((t) => t === "delegation.started")).toHaveLength(12);
  }, 30_000);

  it("fase parallel: dua step berjalan BERSAMAAN (2× step.started sebelum step.done)", async () => {
    const wf: WorkflowDef = {
      name: "par",
      phases: [
        {
          id: "a", name: "A", mode: "parallel", gate: false,
          steps: [
            { id: "s1", persona: "yui-scholar", task: "t1" },
            { id: "s2", persona: "yui-scribe", task: "t2" },
          ],
        },
      ],
    };
    const engine = makeEngine(new EndlessProvider());
    const { runId } = engine.startRun({ projectId: "p_demo", workflow: wf });
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "done");
    const seq = types();
    const firstDone = seq.indexOf("step.done");
    const secondStart = seq.map((t, i) => ({ t, i })).filter((x) => x.t === "step.started")[1]!.i;
    expect(secondStart).toBeLessThan(firstDone); // overlap = paralel sungguhan
  }, 30_000);

  it("depends_on: step menunggu dependency selesai", async () => {
    const wf: WorkflowDef = {
      name: "dep",
      phases: [
        {
          id: "a", name: "A", mode: "parallel", gate: false,
          steps: [
            { id: "s1", persona: "yui-scholar", task: "t1" },
            { id: "s2", persona: "yui-scribe", task: "t2", depends_on: ["s1"] },
          ],
        },
      ],
    };
    const engine = makeEngine(new EndlessProvider());
    const { runId } = engine.startRun({ projectId: "p_demo", workflow: wf });
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "done");
    const doneS1 = events.findIndex((e) => e.type === "step.done" && (e as { stepId?: string }).stepId === "s1");
    const startS2 = events.findIndex((e) => e.type === "step.started" && (e as { stepId?: string }).stepId === "s2");
    expect(startS2).toBeGreaterThan(doneS1);
  }, 30_000);

  it("step gagal → run failed + workflow.done ok:false", async () => {
    const wf: WorkflowDef = {
      name: "fail",
      phases: [{ id: "a", name: "A", mode: "sequential", gate: false, steps: [{ persona: "yui-coder", task: "t" }] }],
    };
    const engine = makeEngine(new FailAtProvider(1));
    const { runId } = engine.startRun({ projectId: "p_demo", workflow: wf });
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "failed");
    const done = events.find((e) => e.type === "workflow.done") as { ok: boolean; error?: string };
    expect(done.ok).toBe(false);
    expect(done.error).toContain("simulated provider failure");
  }, 30_000);
});

describe("P2-FLOW-3 — gate + resume", () => {
  const twoPhase = (): WorkflowDef => ({
    name: "gate",
    phases: [
      { id: "a", name: "A", mode: "sequential", gate: true, steps: [{ persona: "yui-planner", task: "t1" }] },
      { id: "b", name: "B", mode: "sequential", gate: false, steps: [{ persona: "yui-coder", task: "t2" }] },
    ],
  });

  it("gate ON → awaiting_gate setelah fase A; approve → lanjut fase B → done", async () => {
    const engine = makeEngine(new EndlessProvider());
    const { runId } = engine.startRun({ projectId: "p_demo", workflow: twoPhase() });
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "awaiting_gate");
    expect(types()).toContain("workflow.gate.await");
    expect(engine.approveGate(runId, "approved")).toBe(true);
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "done");
    expect(types()).toContain("workflow.gate.passed");
    expect(types().filter((t) => t === "phase.entered")).toHaveLength(2);
  }, 30_000);

  it("gate rejected → run stopped (fase B tidak pernah jalan)", async () => {
    const engine = makeEngine(new EndlessProvider());
    const { runId } = engine.startRun({ projectId: "p_demo", workflow: twoPhase() });
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "awaiting_gate");
    engine.approveGate(runId, "rejected");
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "stopped");
    expect(types().filter((t) => t === "phase.entered")).toHaveLength(1);
    expect(types()).toContain("workflow.gate.passed");
  }, 30_000);

  it("resume pasca-restart: gate belum diputuskan DITANYA ULANG; step done tak diulang", async () => {
    // engine 1: jalankan sampai gate fase A (belum diputuskan)
    const engine1 = makeEngine(new EndlessProvider());
    const { runId, leadSessionId } = engine1.startRun({ projectId: "p_demo", workflow: twoPhase() });
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "awaiting_gate");

    // "restart": engine baru (memori gate hilang), resume dari DB
    const engine2 = makeEngine(new EndlessProvider());
    const resumed = engine2.resumeRuns();
    expect(resumed).toEqual([runId]);
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "awaiting_gate"); // gate dijaga ulang
    expect(types().filter((t) => t === "workflow.gate.await")).toHaveLength(2);
    engine2.approveGate(runId, "approved");
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "done");

    const run = projects.getWorkflowRun(runId)!;
    expect(run.leadSessionId).toBe(leadSessionId);
    expect(run.phaseStates[0]!.steps[0]!.ok).toBe(true); // hasil fase A utuh
    expect(run.phaseStates[1]!.steps[0]!.ok).toBe(true); // fase B jalan
    // fase A hanya dijalankan SEKALI (engine 1) — resume tak mengulang
    expect(types().filter((t) => t === "step.started")).toHaveLength(2);
  }, 30_000);
});
