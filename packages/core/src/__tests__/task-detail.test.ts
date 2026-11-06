// P2-PM-3 — task list detail first-class: persist di store, replay di TaskTree,
// skenario Planner ≥30 task via tool todo_add → lintTaskList hijau.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lintTaskList, WORKFLOW_PHASES, type TaskItem } from "@yuika/contracts";
import { ProjectStore } from "../project/store.js";
import { taskTreeFromEvents } from "../project/tasktree.js";
import { registerTodoTools } from "../tools/todo-tools.js";
import { registry, resetRegistryForTests, type ToolContext } from "../registry.js";

function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-pm3-"));
  return { store: new ProjectStore(path.join(dir, "test.db")), dir };
}

/** Fake session store minimal — todo tools hanya butuh projectId sesi. */
function fakeSessionStore(projectId: string | null) {
  return {
    getSession: () => (projectId ? { id: "s_pm3", projectId } : { id: "s_global" }),
  } as unknown as Parameters<typeof registerTodoTools>[0]["sessionStore"];
}

/** Brief besar → Planner generate ≥30 task terstruktur (fase lengkap, DAG antar-fase). */
function plannerTasks(): Array<{ phase: string; title: string }> {
  const phases = WORKFLOW_PHASES; // 7 fase × 5 task = 35
  const out: Array<{ phase: string; title: string }> = [];
  for (let i = 0; i < 35; i++) {
    const phase = phases[i % phases.length]!;
    out.push({ phase, title: `task ${phase} #${i}` });
  }
  return out;
}

describe("P2-PM-3 task detail", () => {
  it("createTask dengan detail → persist; list/get roundtrip", () => {
    const { store } = makeStore();
    store.createProject({ id: "p_a", name: "A", rootPath: "projects/a" });
    const t = store.createTask({
      id: "t_1", projectId: "p_a", title: "Riset kompetitor",
      description: "petakan 5 kompetitor utama",
      acceptance: ["tabel 5 kompetitor di docs/research.md"],
      dependsOn: [], estimate: "2d", phase: "research", assignee: "yui-scholar",
    });
    expect(t).toMatchObject({ description: "petakan 5 kompetitor utama", estimate: "2d", phase: "research" });

    const got = store.listTasks("p_a")[0]!;
    expect(got.acceptance).toEqual(["tabel 5 kompetitor di docs/research.md"]);
    expect(store.getTask("t_1")!.dependsOn).toEqual([]);

    // update replace-semantik
    store.updateTask("t_1", { acceptance: ["tabel 5 + 1 baru"], dependsOn: ["t_0"], estimate: "3d" });
    const up = store.getTask("t_1")!;
    expect(up.acceptance).toEqual(["tabel 5 + 1 baru"]);
    expect(up.dependsOn).toEqual(["t_0"]);
    expect(up.estimate).toBe("3d");
    expect(up.title).toBe("Riset kompetitor"); // tak tersentuh
  });

  it("detail ter-replay di TaskTree dari event stream", () => {
    const { store } = makeStore();
    store.createProject({ id: "p_a", name: "A", rootPath: "projects/a" });
    store.createTask({ id: "t_1", projectId: "p_a", title: "Desain", acceptance: ["mockup ok"], dependsOn: ["t_0"], phase: "design", estimate: "1d" });
    store.updateTask("t_1", { acceptance: ["mockup + styleguide"] });
    const nodes = taskTreeFromEvents(store.listEvents("p_a"));
    expect(nodes[0]).toMatchObject({
      id: "t_1", phase: "design", estimate: "1d", dependsOn: ["t_0"],
      acceptance: ["mockup + styleguide"],
    });
  });

  it("skenario Planner: brief besar → 35 task via todo_add → validator hijau", async () => {
    const { store } = makeStore();
    store.createProject({ id: "p_plan", name: "Rilis v2", rootPath: "projects/plan" });
    resetRegistryForTests();
    registerTodoTools({ sessionStore: fakeSessionStore("p_plan"), projects: store });
    const dispatch = (args: unknown) =>
      registry.dispatch("todo_add", args, { sessionId: "s_pm3", turnId: "turn_pm3", workspacePath: ".", emit: () => {}, requestApproval: async () => true } satisfies ToolContext);
    const specs = plannerTasks(); // 7 fase × 5 task, rantai DAG antar-fase

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i]!;
      const res = await dispatch(
        {
          title: spec.title,
          assignee: i % 2 ? "yui-coder" : "yui-scholar",
          description: `detail untuk ${spec.title}`,
          acceptance: [`${spec.title}: acceptance terverifikasi`],
          estimate: i % 3 ? "1d" : "2d",
          phase: spec.phase,
        },
      );
      // dep = task pertama fase SEBELUMNYA (id nyata dari store) → DAG antar-fase
      const dep = store.listTasks("p_plan").find((t) => t.phase === prevPhaseOf(spec.phase));
      const created = (res.result as { task: TaskItem }).task;
      if (dep) store.updateTask(created.id, { dependsOn: [dep.id] });
    }

    const tasks = store.listTasks("p_plan");
    expect(tasks.length).toBe(35);
    const lint = lintTaskList(tasks);
    expect(lint.errors).toEqual([]);
    expect(lint.ok).toBe(true);
    expect(lint.warnings).toEqual([]);
    expect(lint.stats.withAcceptance).toBe(35);
  });
});

/** Fase sebelumnya dalam WORKFLOW_PHASES (untuk rantai DAG antar-fase). */
function prevPhaseOf(phase: string): string {
  const i = WORKFLOW_PHASES.indexOf(phase as (typeof WORKFLOW_PHASES)[number]);
  return WORKFLOW_PHASES[(i + 6) % WORKFLOW_PHASES.length]!;
}
