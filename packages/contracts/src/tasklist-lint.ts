// @yuika/contracts — P2-PM-3: validator task list (Planner).
// Pure function browser-safe: DAG (dependsOn valid + tanpa siklus) + coverage
// fase (setiap fase wajib ter-cover ≥1 task) + kelengkapan detail
// (acceptance/assignee/estimate) sebagai warning.
import { z } from "zod";
import { WORKFLOW_PHASES, type TaskItem } from "./project.js";

export const TaskLintOptions = z.object({
  /** Fase yang wajib ter-cover ≥1 task. Default: seluruh WORKFLOW_PHASES. */
  requiredPhases: z.array(z.string()).optional(),
});

export interface TaskLintResult {
  ok: boolean; // true bila errors kosong
  errors: string[];
  warnings: string[];
  stats: {
    total: number;
    withAcceptance: number;
    withAssignee: number;
    withEstimate: number;
    phaseCoverage: Array<{ phase: string; tasks: number }>;
  };
}

/** Validasi task list detail (dipanggil REST /tasks/validate & test Planner). */
export function lintTaskList(tasks: TaskItem[], opts: { requiredPhases?: string[] } = {}): TaskLintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byId = new Map(tasks.map((t) => [t.id, t]));

  // 1) dependsOn dikenal + tanpa siklus (DFS warna)
  for (const t of tasks) {
    for (const d of t.dependsOn) {
      if (!byId.has(d)) errors.push(`task "${t.id}": dependsOn "${d}" tidak dikenal`);
      if (d === t.id) errors.push(`task "${t.id}": dependsOn diri sendiri`);
    }
  }
  const color = new Map<string, 0 | 1 | 2>(); // 0=putih 1=abu 2=hitam
  const visit = (id: string, stack: string[]): void => {
    const c = color.get(id) ?? 0;
    if (c === 1) {
      errors.push(`siklus dependsOn: ${[...stack.slice(stack.indexOf(id)), id].join(" → ")}`);
      return;
    }
    if (c === 2) return;
    color.set(id, 1);
    for (const d of byId.get(id)?.dependsOn ?? []) visit(d, [...stack, id]);
    color.set(id, 2);
  };
  for (const t of tasks) visit(t.id, []);

  // 2) coverage fase — setiap fase wajib ≥1 task
  const required = opts.requiredPhases ?? WORKFLOW_PHASES;
  const counts = new Map<string, number>(required.map((p) => [p, 0]));
  for (const t of tasks) {
    if (t.phase && counts.has(t.phase)) counts.set(t.phase, (counts.get(t.phase) ?? 0) + 1);
  }
  for (const [phase, n] of counts) {
    if (n === 0) errors.push(`fase "${phase}" tidak ter-cover task apa pun`);
  }

  // 3) kelengkapan detail (warning — task boleh dibuat dulu, diisi kemudian)
  let withAcceptance = 0;
  let withAssignee = 0;
  let withEstimate = 0;
  for (const t of tasks) {
    if (t.acceptance.length) withAcceptance++;
    else warnings.push(`task "${t.id}" tanpa acceptance criteria`);
    if (t.assignee) withAssignee++;
    else warnings.push(`task "${t.id}" tanpa assignee`);
    if (t.estimate) withEstimate++;
    else warnings.push(`task "${t.id}" tanpa estimate`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      total: tasks.length,
      withAcceptance,
      withAssignee,
      withEstimate,
      phaseCoverage: [...counts].map(([phase, n]) => ({ phase, tasks: n })),
    },
  };
}
