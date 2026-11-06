// P2-PM-3 — validator task list detail: DAG, coverage fase, kelengkapan.
import { describe, expect, it } from "vitest";
import { lintTaskList } from "../tasklist-lint.js";
import { WORKFLOW_PHASES, type TaskItem } from "../project.js";

let seq = 0;
function task(patch: Partial<TaskItem> & { id: string }): TaskItem {
  seq++;
  return {
    projectId: "p_test",
    title: `task ${seq}`,
    status: "todo",
    assignee: "yui-coder",
    refs: [],
    description: null,
    acceptance: ["kriteria terpenuhi"],
    dependsOn: [],
    estimate: "1d",
    phase: null,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

/** 30+ task lengkap: tiap fase 5 task, DAG berantai antar-fase. */
function bigPlan(n = 31): TaskItem[] {
  const phases = WORKFLOW_PHASES; // 7 fase
  const out: TaskItem[] = [];
  const lastOfPhase = new Map<string, string>();
  for (let i = 0; i < n; i++) {
    const phase = phases[i % phases.length]!;
    const prev = lastOfPhase.get(phases[(phases.indexOf(phase) + 6) % phases.length]!);
    const t = task({
      id: `t_plan_${i}`,
      title: `task ${phase} #${i}`,
      acceptance: [`${phase} acceptance ${i} terverifikasi`],
      dependsOn: prev ? [prev] : [],
      phase,
    });
    out.push(t);
    lastOfPhase.set(phase, t.id);
  }
  return out;
}

describe("P2-PM-3 lintTaskList", () => {
  it("brief besar → ≥30 task lengkap → validator hijau", () => {
    const res = lintTaskList(bigPlan());
    expect(res.stats.total).toBeGreaterThanOrEqual(30);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
    expect(res.warnings).toEqual([]); // semua task lengkap (acceptance/assignee/estimate)
    expect(res.stats.phaseCoverage.every((p) => p.tasks >= 1)).toBe(true);
  });

  it("dependsOn tak dikenal → error", () => {
    const res = lintTaskList([task({ id: "t_a", dependsOn: ["t_hantu"] })]);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("t_hantu"))).toBe(true);
  });

  it("siklus dependsOn (a→b→a) → error", () => {
    const res = lintTaskList([task({ id: "t_a", dependsOn: ["t_b"] }), task({ id: "t_b", dependsOn: ["t_a"] })]);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("siklus"))).toBe(true);
  });

  it("fase tanpa task → error coverage; task tanpa detail → warning", () => {
    const res = lintTaskList([task({ id: "t_a", phase: "planning", acceptance: [], assignee: null, estimate: null })], {
      requiredPhases: ["planning", "testing"],
    });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('"testing"'))).toBe(true);
    expect(res.warnings.filter((w) => w.includes("t_a")).length).toBe(3); // acceptance, assignee, estimate
  });

  it("phase coverage dihitung benar", () => {
    const res = lintTaskList([
      task({ id: "t_a", phase: "planning" }),
      task({ id: "t_b", phase: "planning" }),
    ], { requiredPhases: ["planning", "docs"] });
    expect(res.stats.phaseCoverage).toEqual(
      expect.arrayContaining([
        { phase: "planning", tasks: 2 },
        { phase: "docs", tasks: 0 },
      ]),
    );
  });
});
