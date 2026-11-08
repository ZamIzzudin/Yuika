// unit test agregasi dashboard: burndown task, RACI owner dari
// roster, reopened dari event transisi, gate mapping, delta iterasi run,
// sinyal QA + pending approval. Murni fungsi, store dipalsukan minimal.
import { describe, expect, it } from "vitest";
import {
  buildProjectDashboard,
  countReopened,
  scanProjectSignals,
} from "../project/dashboard.js";
import type { ProjectEvent, RosterEntry, TaskItem, YuiEvent } from "@yuika/contracts";
import type { WorkflowRunRow } from "../project/store.js";

function task(id: string, over: Partial<TaskItem> = {}): TaskItem {
  return {
    id,
    projectId: "p1",
    title: id,
    status: "todo",
    assignee: null,
    refs: [],
    acceptance: [],
    dependsOn: [],
    estimate: null,
    description: null,
    phase: null,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

function ev(type: "task.node.created" | "task.node.updated", taskId: string, status?: string): ProjectEvent {
  if (type === "task.node.created")
    return { type, projectId: "p1", taskId, parent: null, title: taskId, assignee: null, ts: 1 };
  const e: ProjectEvent = { type, projectId: "p1", taskId, ts: 1 };
  if (status) return { ...e, status: status as TaskItem["status"] } as ProjectEvent;
  return e;
}

function run(id: string, over: Partial<WorkflowRunRow> = {}): WorkflowRunRow {
  return {
    id,
    projectId: "p1",
    leadSessionId: "s1",
    workflow: {
      name: "Seven-phase delivery",
      phases: [
        {
          id: "planning",
          name: "Planning",
          mode: "parallel",
          gate: true,
          steps: [
            { id: "breakdown", persona: "yui-planner", task: "t", depends_on: [] },
            { id: "risks", persona: "yui-analyst", task: "t", depends_on: [] },
          ],
        },
      ],
    },
    status: "running",
    phaseStates: [
      {
        phaseId: "planning",
        status: "done",
        gatePassed: true,
        steps: [
          { id: "breakdown", personaId: "yui-planner", ok: true, summary: "" },
          { id: "risks", personaId: "yui-analyst", ok: null, summary: "" },
        ],
      },
    ],
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

describe("countReopened (transisi done → bukan done)", () => {
  it("menghitung task yang dibuka ulang; done → done bukan reopened", () => {
    const events = [
      ev("task.node.created", "t1"),
      ev("task.node.updated", "t1", "doing"),
      ev("task.node.updated", "t1", "done"),
      ev("task.node.updated", "t1", "review"), // reopened #1
      ev("task.node.updated", "t1", "done"),
      ev("task.node.updated", "t1", "todo"), // reopened #2
      ev("task.node.created", "t2"),
      ev("task.node.updated", "t2", "done"),
      ev("task.node.updated", "t2", "done"), // bukan reopened
    ];
    expect(countReopened(events)).toBe(2);
  });
});

describe("scanProjectSignals (QA verdict + approval hold)", () => {
  it("qa.check dihitung; approval tanpa resolve tetap pending", () => {
    const events: YuiEvent[] = [
      { type: "qa.check", item: "a", status: "pass", ts: 1 } as unknown as YuiEvent,
      { type: "qa.check", item: "b", status: "fail", ts: 2 } as unknown as YuiEvent,
      { type: "qa.check", item: "c", status: "warn", ts: 3 } as unknown as YuiEvent,
      { type: "approval.requested", requestId: "ap1", tool: "run_command", args: {}, reason: "r", ts: 4 } as unknown as YuiEvent,
      { type: "approval.requested", requestId: "ap2", tool: "run_command", args: {}, reason: "r", ts: 5 } as unknown as YuiEvent,
      { type: "approval.resolved", requestId: "ap1", approved: true, ts: 6 } as unknown as YuiEvent,
    ];
    const store = {
      listProjectSessions: () => [{ id: "s1", personaId: "yui-sherlock", createdAt: 1, lastEventAt: 1, lastEventId: 1 }],
      getEvents: () => events,
    };
    const sig = scanProjectSignals(store as never, "p1");
    expect(sig.qa).toEqual({ pass: 1, fail: 1, warn: 1 });
    expect(sig.pendingApprovals).toBe(1);
  });
});

describe("buildProjectDashboard", () => {
  const roster: RosterEntry[] = [
    { personaId: "yui-planner", role: "plan", phases: ["planning"], mcp: [] },
    { personaId: "yui-sherlock", role: "qa", phases: ["testing"], mcp: [] },
  ];

  it("burndown + unassigned + acceptance pct + owner RACI + qa di fase testing", () => {
    const d = buildProjectDashboard({
      tasks: [
        task("t1", { status: "done", assignee: "yui-coder", acceptance: ["a"], phase: "planning" }),
        task("t2", { status: "doing", assignee: "yui-coder", acceptance: [], phase: "planning" }),
        task("t3", { status: "todo", phase: "develop" }),
      ],
      events: [ev("task.node.created", "t1")],
      roster,
      runs: [],
      signals: { qa: { pass: 2, fail: 1, warn: 0 }, pendingApprovals: 1 },
      delegationErrors: 0,
    });
    expect(d.tasks).toMatchObject({ total: 3, done: 1, doing: 1, todo: 1, unassigned: 1, reopened: 0 });
    expect(d.tasks.withAcceptancePct).toBe(33);
    expect(d.health).toEqual({ pendingApprovals: 1, qaFail: 1, delegationErrors: 0 });
    const planning = d.phases.find((p) => p.phase === "planning")!;
    expect(planning.owners).toEqual(["yui-planner"]);
    expect(planning.tasks).toMatchObject({ total: 2, done: 1, doing: 1, withAcceptancePct: 50 });
    const testing = d.phases.find((p) => p.phase === "testing")!;
    expect(testing.owners).toEqual(["yui-sherlock"]);
    expect(testing.qa).toEqual({ pass: 2, fail: 1, warn: 0 });
    // fase lain tanpa verdict → null
    expect(d.phases.find((p) => p.phase === "design")!.qa).toBeNull();
    // 7 fase selalu hadir
    expect(d.phases).toHaveLength(7);
  });

  it("gate mapping: gatePassed → passed; fase done tanpa gate di run hidup → pending; run mati → none", () => {
    const mk = (status: WorkflowRunRow["status"], gatePassed: boolean | undefined): WorkflowRunRow =>
      run("r1", {
        status,
        phaseStates: [{ phaseId: "planning", status: "done", gatePassed, steps: [] }],
      });
    const dPass = buildProjectDashboard({ tasks: [], events: [], roster, runs: [mk("running", true)], signals: { qa: { pass: 0, fail: 0, warn: 0 }, pendingApprovals: 0 }, delegationErrors: 0 });
    expect(dPass.phases.find((p) => p.phase === "planning")!.gate).toBe("passed");

    const dPend = buildProjectDashboard({ tasks: [], events: [], roster, runs: [mk("awaiting_gate", false)], signals: { qa: { pass: 0, fail: 0, warn: 0 }, pendingApprovals: 0 }, delegationErrors: 0 });
    expect(dPend.phases.find((p) => p.phase === "planning")!.gate).toBe("pending");

    const dDead = buildProjectDashboard({ tasks: [], events: [], roster, runs: [mk("stopped", false)], signals: { qa: { pass: 0, fail: 0, warn: 0 }, pendingApprovals: 0 }, delegationErrors: 0 });
    expect(dDead.phases.find((p) => p.phase === "planning")!.gate).toBe("none");
  });

  it("iterasi: index urut createdAt, stepsDone dari ok===true, delta vs run sebelumnya", () => {
    const r1 = run("r1", { createdAt: 1 });
    const r2 = run("r2", {
      createdAt: 2,
      phaseStates: [
        {
          phaseId: "planning",
          status: "done",
          gatePassed: true,
          steps: [
            { id: "a", personaId: "yui-planner", ok: true, summary: "" },
            { id: "b", personaId: "yui-analyst", ok: true, summary: "" },
          ],
        },
      ],
    });
    const d = buildProjectDashboard({ tasks: [], events: [], roster, runs: [r2, r1], signals: { qa: { pass: 0, fail: 0, warn: 0 }, pendingApprovals: 0 }, delegationErrors: 0 });
    expect(d.runs.map((r) => [r.index, r.runId, r.stepsDone, r.stepsTotal])).toEqual([
      [1, "r1", 1, 2],
      [2, "r2", 2, 2],
    ]);
    expect(d.runs[0]!.delta).toBeNull();
    expect(d.runs[1]!.delta).toBe(1); // 2 - 1
  });
});
