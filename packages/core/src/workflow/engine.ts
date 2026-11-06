// @yuika/core — workflow engine v0 (P2-FLOW-2/3, PLAN §13.2–13.3).
// Run = DAG → job graph: fase berjalan BERURUTAN; fase sequential satu-per-satu
// (output fase = konteks fase berikut), fase parallel N delegation anak dengan
// scheduling topo-wave by depends_on + cap paralel. Gate antar fase = status
// `awaiting_gate` + janji resolve (approve/reject) — run berhenti sampai user
// memutuskan. Semua transisi lewat event `workflow.*` di sesi LEAD (Conductor)
// — board & replay gratis via stream sesi; state run persist di ProjectStore
// (workflow_runs) → resume pasca-restart = lanjut fase terakhir yang belum
// selesai, step yang sudah done tidak diulang.
import { randomUUID } from "node:crypto";
import type { WorkflowDef } from "@yuika/contracts";
import { normalizeWorkflowDef, lintWorkflow, type NormalizedWorkflowDef } from "@yuika/contracts";
import { runChildPersona, type DelegationDeps } from "../delegation/runner.js";
import { createSessionWithPrompt } from "../runtime-helpers.js";
import { makeEmitter, type Emit } from "../session/emit.js";
import { listPersonas } from "../personas/loader.js";
import type { ProjectStore, WorkflowPhaseState } from "../project/store.js";

// Re-export tipe store yang dipakai pemanggil engine (REST/UI).
export type { WorkflowPhaseState, WorkflowRunRow, WorkflowRunStatus } from "../project/store.js";

/** Ringkasan step dipotong agar konteks fase berikut tak membengkak. */
const MAX_SUMMARY_CHARS = 800;
const MAX_CONTEXT_CHARS = 4_000;

export interface WorkflowEngineDeps extends DelegationDeps {
  projects: ProjectStore;
}

export interface StartRunOptions {
  projectId: string;
  workflow: WorkflowDef;
  brief?: string;
  /** Sesi chat conductor sebagai lead (kendali workflow via chat — keputusan
   *  user 2026-11-08: brief/steer/gate di tab Chat). Kosong = engine membuat
   *  sesi lead sendiri (perilaku lama). */
  leadSessionId?: string;
}

export interface StartRunResult {
  runId: string;
  leadSessionId: string;
}

interface GateWaiter {
  resolve: (decision: "approved" | "rejected") => void;
}

/** State hidup run (FLOW-6: steering butuh akses dari method publik). */
interface RunHandle {
  def: NormalizedWorkflowDef;
  states: WorkflowPhaseState[];
  projectId: string;
  leadSessionId: string;
  brief: string;
  /** Instruksi steering user (urutan masuk) — masuk konteks fase berikutnya. */
  steers: string[];
}

/** Def valid + ternormalisasi, atau lempar (lint errors lengkap). */
function validated(input: WorkflowDef): NormalizedWorkflowDef {
  const lint = lintWorkflow(input);
  if (lint.errors.length) throw new Error(`workflow tidak valid: ${lint.errors.join("; ")}`);
  return normalizeWorkflowDef(input);
}

export class WorkflowEngine {
  private readonly gates = new Map<string, GateWaiter>();
  private readonly stopped = new Set<string>();
  private readonly runs = new Map<string, RunHandle>();
  private readonly paused = new Set<string>();
  private readonly pauseWaiters = new Map<string, () => void>();

  constructor(private readonly deps: WorkflowEngineDeps) {}

  /** Mulai run baru (fire-and-forget drive). Lead session = Conductor —
   *  parent semua delegation anak step (event run hidup di sesi ini).
   *  leadSessionId opsional: sesi chat conductor user dipakai sebagai lead
   *  supaya kendali run (brief/steer/gate) hidup di chat-nya sendiri. */
  startRun(opts: StartRunOptions): StartRunResult {
    const def = validated(opts.workflow);
    if (!this.deps.projects.getProject(opts.projectId)) throw new Error(`project tidak ditemukan: ${opts.projectId}`);
    const runId = `wf_${randomUUID().slice(0, 8)}`;

    const personas = listPersonas(this.deps.personasDir);
    const conductor = personas.find((p) => p.manifest.id === "yui-conductor");
    if (!conductor) throw new Error("persona yui-conductor tidak ditemukan (roster wajib utk workflow lead)");

    let leadSessionId: string;
    const provided = opts.leadSessionId ? this.deps.store.getSession(opts.leadSessionId) : undefined;
    if (opts.leadSessionId && !provided) throw new Error(`sesi lead tidak ditemukan: ${opts.leadSessionId}`);
    if (provided && provided.projectId !== opts.projectId)
      throw new Error("sesi lead bukan milik project ini");
    if (provided) {
      // sesi chat sudah punya system prompt conductor — injeksikan konteks run
      // sebagai pesan berprefix (pola sama dgn [steering])
      leadSessionId = provided.id;
      this.deps.store.appendMessage(leadSessionId, {
        role: "user",
        content:
          `[workflow lead] Kamu memimpin run "${def.name}" (${runId}). ` +
          `Step dieksekusi otomatis oleh engine; ringkasan anak muncul sebagai delegation.*.` +
          (opts.brief ? ` Brief:\n${opts.brief}` : ""),
      });
    } else {
      leadSessionId = `s_${randomUUID()}`;
      createSessionWithPrompt(
        this.deps.store,
        conductor,
        leadSessionId,
        ["delegate_task"],
        this.deps.skillsDir,
        opts.projectId,
        `\n\n[workflow lead] Kamu memimpin run "${def.name}" (${runId}). ` +
          `Step dieksekusi otomatis oleh engine; ringkasan anak muncul sebagai delegation.*. ` +
          (opts.brief ? `Brief:\n${opts.brief}` : ""),
      );
    }

    this.deps.projects.createWorkflowRun({
      id: runId,
      projectId: opts.projectId,
      leadSessionId,
      workflow: def,
    });
    void this.drive(runId, def, leadSessionId, opts.projectId, opts.brief ?? "", freshPhaseStates(def));
    return { runId, leadSessionId };
  }

  /** Keputusan gate (dipanggil UI/board). false bila run tidak menunggu gate. */
  approveGate(runId: string, decision: "approved" | "rejected"): boolean {
    const w = this.gates.get(runId);
    if (!w) return false;
    this.gates.delete(runId);
    w.resolve(decision);
    return true;
  }

  /** Berhenti di batas step berikutnya (steering mid-run = FLOW-6). */
  stopRun(runId: string): void {
    this.stopped.add(runId);
    this.approveGate(runId, "rejected"); // bangunkan bila nunggu gate
    this.wakePaused(runId); // bangunkan bila nunggu resume
  }

  // ── FLOW-6: steering mid-run ─────────────────────────────────────────────

  /** Suntik instruksi mid-run: masuk konteks fase BERIKUTNYA + tercatat
   *  sebagai pesan user di sesi lead (audit) + event workflow.steer. */
  steerRun(runId: string, instruction: string): boolean {
    const h = this.runs.get(runId);
    const text = instruction.trim();
    if (!h || !text) return false;
    h.steers.push(text);
    this.deps.store.appendMessage(h.leadSessionId, { role: "user", content: `[steering] ${text}` });
    makeEmitter(this.deps.store, this.deps.bus, h.leadSessionId)({ type: "workflow.steer", runId, instruction: text });
    return true;
  }

  /** Pause di batas step berikutnya (step yang sedang jalan diselesaikan).
   *  Saat awaiting_gate: status `paused` LANGSUNG (eksekusi memang berhenti;
   *  keputusan gate tetap boleh — berlaku setelah resume). */
  pauseRun(runId: string): boolean {
    const h = this.runs.get(runId);
    if (!h || this.stopped.has(runId)) return false;
    this.paused.add(runId);
    if (this.deps.projects.getWorkflowRun(runId)?.status === "awaiting_gate") {
      this.deps.projects.updateWorkflowRun(runId, { status: "paused" });
      makeEmitter(this.deps.store, this.deps.bus, h.leadSessionId)({ type: "workflow.paused", runId });
    }
    return true;
  }

  resumeRun(runId: string): boolean {
    if (!this.runs.has(runId)) return false;
    const h = this.runs.get(runId)!;
    this.paused.delete(runId);
    this.wakePaused(runId);
    // bila tak ada checkpoint yang berjalan (mis. paused saat gate), pulihkan
    // status manual: nunggu gate lagi bila gate belum diputuskan.
    if (this.deps.projects.getWorkflowRun(runId)?.status === "paused") {
      this.deps.projects.updateWorkflowRun(runId, { status: this.gates.has(runId) ? "awaiting_gate" : "running" });
      makeEmitter(this.deps.store, this.deps.bus, h.leadSessionId)({ type: "workflow.resumed", runId });
    }
    return true;
  }

  /** Reassign step yang BELUM selesai ke persona lain. Step yang sedang
   *  berjalan memakai persona lama sampai selesai (abort mid-provider
   *  menyusul); def + state dimutasi & di-persist agar resume tetap baru. */
  reassignStep(runId: string, phaseId: string, stepId: string, toPersona: string): { ok: boolean; error?: string } {
    const h = this.runs.get(runId);
    if (!h) return { ok: false, error: "run tidak aktif" };
    const phase = h.def.phases.find((p) => p.id === phaseId);
    if (!phase) return { ok: false, error: `fase "${phaseId}" tidak ditemukan` };
    const idx = phase.steps.findIndex((s) => s.id === stepId);
    if (idx < 0) return { ok: false, error: `step "${stepId}" tidak ditemukan` };
    const st = h.states.find((p) => p.phaseId === phaseId);
    if (st?.steps[idx]?.ok === true) return { ok: false, error: "step sudah selesai" };
    const from = phase.steps[idx]!.persona;
    if (from === toPersona) return { ok: false, error: "persona sama" };
    if (!listPersonas(this.deps.personasDir).some((p) => p.manifest.id === toPersona)) {
      return { ok: false, error: `persona "${toPersona}" tidak dikenal` };
    }
    phase.steps[idx]!.persona = toPersona;
    if (st?.steps[idx]) st.steps[idx].personaId = toPersona;
    this.deps.projects.updateWorkflowRun(runId, { workflow: h.def, phaseStates: h.states });
    makeEmitter(this.deps.store, this.deps.bus, h.leadSessionId)({
      type: "workflow.step.reassigned", runId, phaseId, stepId, fromPersona: from, toPersona,
    });
    return { ok: true };
  }

  private wakePaused(runId: string): void {
    this.pauseWaiters.get(runId)?.();
    this.pauseWaiters.delete(runId);
  }

  /** Boot resume (FLOW-3): lanjutkan run yang belum tamat — fase done
   *  dilewati, step done tidak diulang (state dari workflow_runs). */
  resumeRuns(): string[] {
    const resumed: string[] = [];
    for (const run of this.deps.projects.listActiveWorkflowRuns()) {
      const def = validated(run.workflow);
      const states = run.phaseStates.length ? run.phaseStates : freshPhaseStates(def);
      void this.drive(run.id, def, run.leadSessionId, run.projectId, "", states);
      resumed.push(run.id);
    }
    return resumed;
  }

  // ── drive ────────────────────────────────────────────────────────────────

  private async drive(
    runId: string,
    def: NormalizedWorkflowDef,
    leadSessionId: string,
    projectId: string,
    brief: string,
    states: WorkflowPhaseState[],
  ): Promise<void> {
    const emit = makeEmitter(this.deps.store, this.deps.bus, leadSessionId);
    const e = emit;
    const persist = () => this.deps.projects.updateWorkflowRun(runId, { phaseStates: states });

    const turnId = `wf-${runId}`;
    const handle: RunHandle = { def, states, projectId, leadSessionId, brief, steers: [] };
    this.runs.set(runId, handle);
    try {
      this.deps.projects.updateWorkflowRun(runId, { status: "running" });
      e({ type: "workflow.started", runId, projectId, workflowName: def.name, phaseCount: def.phases.length });

      for (let i = 0; i < def.phases.length; i++) {
        if (this.stopped.has(runId)) throw new StopRun();
        await this.waitWhilePaused(runId, e);
        const phase = def.phases[i]!;
        const st = states[i] ?? (states[i] = { phaseId: phase.id, status: "pending", steps: [] });
        if (st.status === "done") {
          // resume: fase selesai — tapi gate yang BELUM diputuskan ditanya ulang
          // (keputusan human tidak boleh hilang pasca-restart)
          if (phase.gate && !st.gatePassed && i < def.phases.length - 1) {
            await this.awaitGate(runId, phase.id, states, i, e);
            if (this.stopped.has(runId)) throw new StopRun();
          }
          continue;
        }

        st.status = "running";
        persist();
        e({ type: "phase.entered", runId, phaseId: phase.id, mode: phase.mode });

        const phaseContext = buildContext(brief, handle.steers, def, states, i);
        const stepDefs = phase.steps.map((s, idx) => ({
          def: s,
          state: st.steps[idx] ?? (st.steps[idx] = { id: s.id, personaId: s.persona, ok: null, summary: "" }),
        }));

        const record = async (idx: number, ok: boolean, summary: string): Promise<void> => {
          stepDefs[idx]!.state.ok = ok;
          stepDefs[idx]!.state.summary = summary.slice(0, MAX_SUMMARY_CHARS);
          persist();
          e({
            type: "step.done", runId, phaseId: phase.id, stepId: stepDefs[idx]!.def.id,
            personaId: stepDefs[idx]!.def.persona, ok, summary: stepDefs[idx]!.state.summary,
          });
        };

        if (phase.mode === "sequential") {
          for (let idx = 0; idx < stepDefs.length; idx++) {
            if (this.stopped.has(runId)) throw new StopRun();
            await this.waitWhilePaused(runId, e);
            const { def: step } = stepDefs[idx]!;
            if (stepDefs[idx]!.state.ok !== null) continue; // resume: step done diulang? tidak — dilewati
            e({ type: "step.started", runId, phaseId: phase.id, stepId: step.id, personaId: step.persona, task: step.task });
            try {
              const summary = await this.runStep(leadSessionId, turnId, step.persona, step.task, phaseContext);
              await record(idx, true, summary);
            } catch (err) {
              await record(idx, false, err instanceof Error ? err.message : String(err));
              throw err;
            }
          }
        } else {
          // parallel: topo-wave by depends_on + cap paralel global
          const cap = Math.max(1, this.deps.maxChildren?.() ?? 3);
          const results = new Set(stepDefs.filter((s) => s.state.ok !== null).map((s) => s.def.id));
          const inflight = new Map<number, Promise<void>>();
          while (results.size + inflight.size < stepDefs.length || inflight.size > 0) {
            for (let idx = 0; idx < stepDefs.length; idx++) {
              const sd = stepDefs[idx]!;
              if (sd.state.ok !== null || inflight.has(idx)) continue;
              if (!sd.def.depends_on.every((d) => results.has(d))) continue;
              if (inflight.size >= cap) break;
              await this.waitWhilePaused(runId, e); // jangan spawn step baru saat pause
              e({ type: "step.started", runId, phaseId: phase.id, stepId: sd.def.id, personaId: sd.def.persona, task: sd.def.task });
              const p = (async () => {
                try {
                  const summary = await this.runStep(leadSessionId, turnId, sd.def.persona, sd.def.task, phaseContext);
                  await record(idx, true, summary);
                  results.add(sd.def.id);
                } catch (err) {
                  await record(idx, false, err instanceof Error ? err.message : String(err));
                  throw err;
                }
              })().finally(() => inflight.delete(idx));
              inflight.set(idx, p);
            }
            if (inflight.size === 0) throw new Error(`workflow deadlock di fase "${phase.id}" (depends_on tak terpenuhi)`);
            await Promise.race(inflight.values());
          }
        }

        st.status = "done";
        persist();
        e({ type: "phase.done", runId, phaseId: phase.id });

        // gate antar fase (default ON; fase terakhir tanpa gate)
        if (phase.gate && i < def.phases.length - 1) {
          const decision = await this.awaitGate(runId, phase.id, states, i, e);
          if (decision === "rejected") throw new StopRun();
        }
      }

      this.deps.projects.updateWorkflowRun(runId, { status: "done" });
      e({ type: "workflow.done", runId, projectId, ok: true });
    } catch (err) {
      const stopped = err instanceof StopRun || this.stopped.has(runId);
      this.stopped.delete(runId);
      const status = stopped ? "stopped" : "failed";
      const message = err instanceof StopRun ? "dihentikan (stop/gate rejected)" : err instanceof Error ? err.message : String(err);
      this.deps.projects.updateWorkflowRun(runId, { status });
      e({ type: "workflow.done", runId, projectId, ok: false, error: message });
    } finally {
      // bersihkan registry steering — run tamat (done/failed/stopped)
      this.runs.delete(runId);
      this.paused.delete(runId);
      this.pauseWaiters.delete(runId);
    }
  }

  /** Titik jeda steering: selama paused (dan tidak di-stop) tahan eksekusi
   *  di sini — step yang sedang berjalan tetap diselesaikan. */
  private async waitWhilePaused(runId: string, e: Emit): Promise<void> {
    while (this.paused.has(runId) && !this.stopped.has(runId)) {
      this.deps.projects.updateWorkflowRun(runId, { status: "paused" });
      e({ type: "workflow.paused", runId });
      await new Promise<void>((r) => this.pauseWaiters.set(runId, r));
      if (this.paused.has(runId)) continue; // di-pause lagi segera setelah resume
      this.deps.projects.updateWorkflowRun(runId, { status: "running" });
      e({ type: "workflow.resumed", runId });
    }
  }

  /** Tunggu keputusan gate: status awaiting_gate + event await/passed;
   *  hasil keputusan di-persist (gatePassed) supaya resume tak menanya ulang. */
  private async awaitGate(
    runId: string,
    phaseId: string,
    states: WorkflowPhaseState[],
    phaseIdx: number,
    e: Emit,
  ): Promise<"approved" | "rejected"> {
    this.deps.projects.updateWorkflowRun(runId, { status: "awaiting_gate" });
    e({ type: "workflow.gate.await", runId, phaseId });
    const decision = await new Promise<"approved" | "rejected">((resolve) => {
      this.gates.set(runId, { resolve });
    });
    e({ type: "workflow.gate.passed", runId, phaseId, decision });
    if (decision === "approved") {
      states[phaseIdx]!.gatePassed = true;
      this.deps.projects.updateWorkflowRun(runId, { phaseStates: states, status: "running" });
    }
    return decision;
  }

  /** Satu step = satu delegation anak persona (loop anak yang sudah ada —
   *  cap, kontrol, metering, event delegation.* semuanya reuse). parentEmit =
   *  emitter sesi lead → delta/status anak live di stream run (board). */
  private async runStep(
    leadSessionId: string,
    turnId: string,
    personaId: string,
    task: string,
    context: string | null,
  ): Promise<string> {
    const parentEmit = makeEmitter(this.deps.store, this.deps.bus, leadSessionId);
    for (let attempt = 0; ; attempt++) {
      try {
        const handle = runChildPersona(this.deps, { sessionId: leadSessionId, turnId }, personaId, task, context, parentEmit);
        return await handle.summary;
      } catch (err) {
        // cap delegation tercapai saat wave start bersamaan → backoff singkat
        if (attempt < 5 && err instanceof Error && /batas delegation paralel/.test(err.message)) {
          await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
  }
}

class StopRun extends Error {
  constructor() {
    super("workflow stopped");
  }
}

// ── helper ──────────────────────────────────────────────────────────────────

function freshPhaseStates(def: NormalizedWorkflowDef): WorkflowPhaseState[] {
  return def.phases.map((p) => ({
    phaseId: p.id,
    status: "pending" as const,
    steps: [],
  }));
}

/** Konteks fase = brief + ringkasan semua step fase sebelumnya (terpotong)
 *  + instruksi steering user (FLOW-6 — ditaruh paling bawah: paling menonjol). */
function buildContext(brief: string, steers: string[], def: NormalizedWorkflowDef, states: WorkflowPhaseState[], upto: number): string | null {
  const parts: string[] = [];
  if (brief) parts.push(`Brief:\n${brief}`);
  for (let i = 0; i < upto; i++) {
    const phase = def.phases[i]!;
    const st = states[i];
    if (!st || st.status !== "done") continue;
    const summaries = st.steps
      .filter((s) => s.ok)
      .map((s) => `- ${s.personaId}: ${s.summary}`)
      .join("\n");
    if (summaries) parts.push(`Hasil fase "${phase.name}":\n${summaries}`);
  }
  if (steers.length) {
    parts.push(`Instruksi steering user (terbaru paling bawah):\n${steers.map((s) => `- ${s}`).join("\n")}`);
  }
  if (!parts.length) return null;
  const text = parts.join("\n\n");
  return text.length > MAX_CONTEXT_CHARS ? `${text.slice(0, MAX_CONTEXT_CHARS)}…` : text;
}
