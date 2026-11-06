// @yuika/contracts — workflow deklaratif (P2-FLOW-1, PLAN §13.2).
// SATU sumber schema `workflow.yaml`: fase 7-langkah (planning→riset→desain→
// develop→testing→dokumentasi→deliverable), mode sequential/parallel, steps
// {persona, task, depends_on}, gate human-approval default ON.
// Engine (core) TIDAK PERNAH menulis state bebas — semua transisi lewat
// event; def ini read-only hasil parse+lint.
import { z } from "zod";
import YAML from "yaml";

// ── schema ──────────────────────────────────────────────────────────────────

export const WorkflowStepDef = z.object({
  /** Opsional — default `s<index+1>` per fase (uniqueness dicek lint). */
  id: z.string().min(1).optional(),
  persona: z.string().min(1),
  task: z.string().min(1),
  /** Referensi id step LAIN di fase yang sama (intra-fase). */
  depends_on: z.array(z.string().min(1)).optional(),
  /** Hanya bermakna di fase parallel (lint → warning di fase sequential). */
  max_concurrent: z.number().int().positive().optional(),
});
export type WorkflowStepDef = z.infer<typeof WorkflowStepDef>;

export const WorkflowPhaseDef = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, "phase id: kebab-case"),
  name: z.string().min(1),
  mode: z.enum(["sequential", "parallel"]),
  steps: z.array(WorkflowStepDef).min(1),
  /** Human gate SEBELUM fase berikut (default ON — §12.13). Fase terakhir
   *  diabaikan engine (tidak ada fase berikutnya). */
  gate: z.boolean().optional(),
});
export type WorkflowPhaseDef = z.infer<typeof WorkflowPhaseDef>;

export const WorkflowDef = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  phases: z.array(WorkflowPhaseDef).min(1),
});
export type WorkflowDef = z.infer<typeof WorkflowDef>;

// ── normalisasi (isi default; idempotent) ───────────────────────────────────

/** Hasil normalisasi — tanpa field optional (dipakai engine & lint). */
export interface NormalizedStep {
  id: string;
  persona: string;
  task: string;
  depends_on: string[];
  max_concurrent?: number;
}
export interface NormalizedPhase {
  id: string;
  name: string;
  mode: "sequential" | "parallel";
  steps: NormalizedStep[];
  gate: boolean;
}
export interface NormalizedWorkflowDef {
  id?: string;
  name: string;
  description?: string;
  phases: NormalizedPhase[];
}

/** Isi default: step id (`s<index+1>` per fase), `gate: true`, depends_on []. */
export function normalizeWorkflowDef(def: WorkflowDef): NormalizedWorkflowDef {
  return {
    ...def,
    phases: def.phases.map((p) => ({
      ...p,
      gate: p.gate ?? true,
      steps: p.steps.map((s, i) => ({
        ...s,
        id: s.id ?? `s${i + 1}`,
        depends_on: s.depends_on ?? [],
      })),
    })),
  };
}

// ── lint struktural (setelah zod lolos) ─────────────────────────────────────

export interface WorkflowLintResult {
  errors: string[];
  warnings: string[];
}

export interface LintOptions {
  /** Roster persona valid (id) — jika diberikan, persona di luar daftar = error. */
  personas?: string[];
}

/** Lint def ternormalisasi: id unik, depends_on valid & tanpa siklus,
 *  max_concurrent hanya di parallel, persona dikenal (bila roster diberikan). */
export function lintWorkflow(input: WorkflowDef | NormalizedWorkflowDef, opts: LintOptions = {}): WorkflowLintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const def = input.phases.every((p) => p.gate !== undefined && p.steps.every((st) => st.id !== undefined && st.depends_on !== undefined))
    ? (input as NormalizedWorkflowDef)
    : normalizeWorkflowDef(input as WorkflowDef);

  const phaseIds = new Set<string>();
  for (const phase of def.phases) {
    if (phaseIds.has(phase.id)) errors.push(`phase id duplikat: "${phase.id}"`);
    phaseIds.add(phase.id);

    const stepIds = new Set<string>();
    for (const s of phase.steps) {
      if (stepIds.has(s.id)) errors.push(`phase "${phase.id}": step id duplikat "${s.id}"`);
      stepIds.add(s.id);
      if (opts.personas && !opts.personas.includes(s.persona))
        errors.push(`phase "${phase.id}" step "${s.id}": persona "${s.persona}" tidak ada di roster`);
      if (phase.mode === "sequential" && s.max_concurrent !== undefined)
        warnings.push(`phase "${phase.id}" sequential: max_concurrent diabaikan`);
    }

    // depends_on valid + deteksi siklus (DFS warna)
    const edges = new Map<string, string[]>(
      phase.steps.map((s): [string, string[]] => [s.id, s.depends_on.filter((d) => d !== s.id)]),
    );
    for (const s of phase.steps) {
      for (const d of s.depends_on) {
        if (d === s.id) errors.push(`phase "${phase.id}" step "${s.id}": depends_on diri sendiri`);
        else if (!stepIds.has(d)) errors.push(`phase "${phase.id}" step "${s.id}": depends_on "${d}" tidak dikenal`);
      }
    }
    const state = new Map<string, 1 | 2>(); // 1 = visiting, 2 = done
    const visit = (id: string, path: string[]): void => {
      if (state.get(id) === 2) return;
      if (state.get(id) === 1) {
        errors.push(`phase "${phase.id}": siklus depends_on (${[...path.slice(path.indexOf(id)), id].join(" → ")})`);
        return;
      }
      state.set(id, 1);
      for (const d of edges.get(id) ?? []) visit(d, [...path, id]);
      state.set(id, 2);
    };
    for (const s of phase.steps) visit(s.id, []);

    if (phase.gate && phase === def.phases[def.phases.length - 1])
      warnings.push(`phase "${phase.id}": gate fase terakhir tidak berpengaruh (tidak ada fase berikutnya)`);
  }

  return { errors, warnings };
}

// ── loader YAML ─────────────────────────────────────────────────────────────

/** Parse + zod-validate teks `workflow.yaml`. Melempar Error berisi
 *  message zod (panggil lint terpisah untuk aturan struktural). */
export function loadWorkflowYaml(text: string): WorkflowDef {
  const raw = YAML.parse(text) as unknown;
  const parsed = WorkflowDef.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`workflow.yaml tidak valid: ${detail}`);
  }
  return parsed.data;
}

// ── template 7 fase (default project baru) ─────────────────────────────────

export const SEVEN_PHASE_TEMPLATE_YAML = `# workflow.yaml — template 7 fase (PLAN §13)
# Fase berjalan berurutan; mode parallel = N agent delegation anak sekaligus
# (cap max_concurrent per step / cap global per project). gate = human approval
# "fase X selesai — lanjut?" SEBELUM fase berikut (default ON).
name: Seven-phase delivery
description: planning → research → design → develop → testing → docs → deliverable
phases:
  - id: planning
    name: Planning
    mode: parallel
    steps:
      - id: breakdown
        persona: yui-planner
        task: Break the brief into a task list with acceptance criteria and depends_on (TaskTree).
      - id: risks
        persona: yui-analyst
        task: Identify top risks and unknowns; propose mitigations.
    gate: true

  - id: research
    name: Research
    mode: parallel
    steps:
      - id: landscape
        persona: yui-scholar
        task: Survey prior art and reference material; summarize findings with sources.
      - id: tech-notes
        persona: yui-scholar
        task: Evaluate candidate technologies; write comparison notes with a recommendation.
    gate: true

  - id: design
    name: Design
    mode: parallel
    steps:
      - id: wireframes
        persona: yui-designer
        task: Produce wireframes for the primary flows.
      - id: tokens
        persona: yui-designer
        task: Define the design tokens (color, type, spacing) to hand off.
        depends_on: [wireframes]
    gate: true

  - id: develop
    name: Develop
    mode: parallel
    steps:
      - id: core
        persona: yui-coder
        task: Implement core functionality against the task list.
      - id: ui
        persona: yui-coder
        task: Implement UI from the wireframes and tokens.
        depends_on: [core]
    gate: true

  - id: testing
    name: Testing
    mode: sequential
    steps:
      - id: qa
        persona: yui-analyst
        task: Run QA against acceptance criteria; write a defect report with severity.
    gate: true

  - id: docs
    name: Documentation
    mode: parallel
    steps:
      - id: user-guide
        persona: yui-scribe
        task: Write the user guide from the delivered features.
      - id: changelog
        persona: yui-scribe
        task: Write the changelog and release notes.
    gate: true

  - id: deliverable
    name: Deliverable
    mode: sequential
    steps:
      - id: package
        persona: yui-conductor
        task: Collect artifacts (reports, docs, code) into a deliverable summary with next steps.
    gate: false
`;
