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

/** Provider tak pernah habis: tiap call = satu kalimat deterministik.
 *  `reqs` merekam konteks tiap call (untuk assert steering masuk konteks). */
class EndlessProvider implements ProviderAdapter {
  readonly id = "endless";
  calls = 0;
  reqs: string[] = [];
  async chatStream(req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
    this.calls++;
    this.reqs.push(req.messages.map((m) => m.content).join("\n"));
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
  it("lead dari chat user (2026-11-08): sesi chat conductor dipakai sbg lead — konteks run di-inject, sesi baru TIDAK dibuat, sesi lintas-project ditolak", async () => {
    // sesi chat "user" (persona conductor) di project demo
    store.createSession("s_chatku", "yui-conductor", "system-prompt-chat", [], "p_demo");
    const engine = makeEngine(new EndlessProvider());
    autoApproveGates(engine);

    const { leadSessionId } = engine.startRun({
      projectId: "p_demo",
      workflow: template(),
      brief: "brief dari chat",
      leadSessionId: "s_chatku",
    });
    expect(leadSessionId).toBe("s_chatku");
    // konteks run muncul di sesi chat (pola [workflow lead])
    const msgs = store.getMessages("s_chatku");
    expect(msgs.some((m) => m.content.includes("[workflow lead]") && m.content.includes("brief dari chat"))).toBe(true);

    await waitFor(() => projects.getWorkflowRun((events.find((e) => e.type === "workflow.done") as { runId?: string } | undefined)?.runId ?? "")?.status === "done");

    // sesi milik project lain → ditolak
    projects.createProject({ id: "p_lain", name: "Lain", rootPath: ws });
    store.createSession("s_lain", "yui-conductor", "x", [], "p_lain");
    expect(() =>
      engine.startRun({ projectId: "p_demo", workflow: template(), leadSessionId: "s_lain" }),
    ).toThrow(/bukan milik project/);
    // sesi tak dikenal → ditolak
    expect(() =>
      engine.startRun({ projectId: "p_demo", workflow: template(), leadSessionId: "s_hantu" }),
    ).toThrow(/tidak ditemukan/);
  });

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

// ── P2-FLOW-6: steering mid-run — steer / pause+resume / reassign ──────────
const two = (): WorkflowDef => ({
  name: "two",
  phases: [
    { id: "a", name: "A", mode: "sequential", steps: [{ id: "s1", persona: "yui-scribe", task: "step A" }] },
    { id: "b", name: "B", mode: "sequential", steps: [{ id: "s1", persona: "yui-scribe", task: "step B" }] },
  ],
});

describe("P2-FLOW-6 — steering mid-run", () => {
  it("steer: pesan user di sesi lead + event + instruksi masuk konteks fase berikut", async () => {
    const prov = new EndlessProvider();
    const engine = makeEngine(prov);
    const { runId, leadSessionId } = engine.startRun({ projectId: "p_demo", workflow: two() });
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "awaiting_gate");

    expect(engine.steerRun(runId, "jaga scope tetap kecil")).toBe(true);
    expect(engine.steerRun("wf_nope", "x")).toBe(false);
    expect(engine.steerRun(runId, "   ")).toBe(false);
    await waitFor(() => types().includes("workflow.steer"));
    expect(events.find((e) => e.type === "workflow.steer")).toMatchObject({
      runId,
      instruction: "jaga scope tetap kecil",
    });
    // audit: instruksi terekam sebagai pesan user di sesi lead
    expect(
      store.getMessages(leadSessionId).some((m) => m.role === "user" && m.content.includes("[steering] jaga scope tetap kecil")),
    ).toBe(true);

    engine.approveGate(runId, "approved");
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "done");
    // konteks step fase B memuat instruksi steering
    expect(prov.reqs.at(-1)).toContain("Instruksi steering");
    expect(prov.reqs.at(-1)).toContain("jaga scope tetap kecil");
  }, 30_000);

  it("pause → step fase berikut TIDAK jalan; resume → lanjut sampai done", async () => {
    const engine = makeEngine(new EndlessProvider());
    const { runId } = engine.startRun({ projectId: "p_demo", workflow: two() });
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "awaiting_gate");

    expect(engine.pauseRun(runId)).toBe(true);
    engine.approveGate(runId, "approved");
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "paused");
    await new Promise((r) => setTimeout(r, 150)); // beri waktu bila eksekusi bocor
    expect(events.filter((e) => e.type === "phase.entered" && e.phaseId === "b")).toHaveLength(0);
    expect(types()).toContain("workflow.paused");

    expect(engine.resumeRun(runId)).toBe(true);
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "done");
    expect(types()).toContain("workflow.resumed");
    expect(events.filter((e) => e.type === "phase.entered" && e.phaseId === "b")).toHaveLength(1);
  }, 30_000);

  it("stop saat paused → run stopped; resume setelah tamat → false", async () => {
    const engine = makeEngine(new EndlessProvider());
    const { runId } = engine.startRun({ projectId: "p_demo", workflow: two() });
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "awaiting_gate");
    engine.pauseRun(runId);
    engine.approveGate(runId, "approved");
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "paused");
    engine.stopRun(runId);
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "stopped");
    expect(engine.resumeRun(runId)).toBe(false);
  }, 30_000);

  it("reassign step pending: def+state persist, event tercatat, step jalan dengan persona baru; done step ditolak", async () => {
    const engine = makeEngine(new EndlessProvider());
    const { runId } = engine.startRun({ projectId: "p_demo", workflow: two() });
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "awaiting_gate");

    // error paths dulu
    expect(engine.reassignStep(runId, "b", "s1", "yui-scribe")).toMatchObject({ ok: false, error: "persona sama" });
    expect(engine.reassignStep(runId, "b", "ngaco", "yui-coder").ok).toBe(false);
    expect(engine.reassignStep(runId, "b", "s1", "persona-ngaco").ok).toBe(false);
    expect(engine.reassignStep(runId, "a", "s1", "yui-coder").ok).toBe(false); // fase A done

    const res = engine.reassignStep(runId, "b", "s1", "yui-coder");
    expect(res).toEqual({ ok: true });
    await waitFor(() => types().includes("workflow.step.reassigned"));
    expect(events.find((e) => e.type === "workflow.step.reassigned")).toMatchObject({
      runId, phaseId: "b", stepId: "s1", fromPersona: "yui-scribe", toPersona: "yui-coder",
    });
    // persist: def tersimpan memuat persona baru
    const stored = projects.getWorkflowRun(runId)!.workflow as ReturnType<typeof two>;
    expect(stored.phases[1]!.steps[0]!.persona).toBe("yui-coder");

    engine.approveGate(runId, "approved");
    await waitFor(() => projects.getWorkflowRun(runId)?.status === "done");
    const bStarted = events.filter((e) => e.type === "step.started" && e.phaseId === "b");
    expect(bStarted).toHaveLength(1);
    expect(bStarted[0]).toMatchObject({ personaId: "yui-coder" });
  }, 30_000);
});
