// @yuika/core — P2-PM-4/5: dashboard progres terukur.
// Murni fungsi agregasi (tanpa I/O sendiri): dipanggil runtime dengan data
// store → ProjectDashboard (kontrak). Semua angka dihitung ulang per request
// (read-only, murah: task/run roster kecil; event scan ekor 500/sesi).
//
// P2-PM-4 (RACI ringan): tiap fase → owner persona (roster phases[]) +
// metrik live (% acceptance utk planning, gate utk design, done/total
// utk develop, verdict QA utk testing, dst — semua turun dari data yang
// sama: TaskItem.phase + WorkflowRunRow.phaseStates + qa.check events).
// P2-PM-5: burndown task + health (reopened, pending approvals, qa fail,
// delegation error) + ringkasan iterasi (run ke-N + delta vs sebelumnya).
import type {
  DashboardPhase,
  DashboardRun,
  ProjectDashboard,
  ProjectEvent,
  RosterEntry,
  TaskItem,
  WorkflowPhase,
} from "@yuika/contracts";
import { WORKFLOW_PHASES } from "@yuika/contracts";
import type { WorkflowRunRow } from "./store.js";
import type { ISessionStore } from "../session/store.js";
import type { YuiEvent } from "@yuika/contracts";

export interface ProjectSignals {
  qa: { pass: number; fail: number; warn: number };
  /** approval.requested tanpa approval.resolved/expired setelahnya. */
  pendingApprovals: number;
}

/** Scan event sesi project (ekor 500/sesi): verdict QA + approval masih hold. */
export function scanProjectSignals(store: ISessionStore, projectId: string): ProjectSignals {
  const qa = { pass: 0, fail: 0, warn: 0 };
  const seen = new Map<string, "requested" | "resolved" | "expired">();
  for (const sess of store.listProjectSessions(projectId)) {
    for (const e of store.getEvents(sess.id, 0).slice(-500) as YuiEvent[]) {
      if (e.type === "qa.check") {
        if (e.status === "pass") qa.pass++;
        else if (e.status === "fail") qa.fail++;
        else qa.warn++;
      } else if (e.type === "approval.requested") {
        seen.set(e.requestId, "requested");
      } else if (e.type === "approval.resolved" || e.type === "approval.expired") {
        const r = e as Extract<YuiEvent, { type: "approval.resolved" | "approval.expired" }>;
        if (seen.get(r.requestId) === "requested") seen.set(r.requestId, e.type === "approval.resolved" ? "resolved" : "expired");
      }
    }
  }
  let pendingApprovals = 0;
  for (const s of seen.values()) if (s === "requested") pendingApprovals++;
  return { qa, pendingApprovals };
}

/** Hitung task yang dibuka ulang setelah done — dari event `task.node.updated`
 *  (transisi done → todo/doing/review). Event hanya membawa status BARU,
 *  maka status pelacak dibangun berurutan (created mulai todo). */
export function countReopened(events: ProjectEvent[]): number {
  let last = new Map<string, string>();
  let reopened = 0;
  for (const e of events) {
    if (e.type === "task.node.created") {
      last.set(e.taskId, "todo");
    } else if (e.type === "task.node.updated" && e.status) {
      const prev = last.get(e.taskId);
      if (prev === "done" && e.status !== "done") reopened++;
      last.set(e.taskId, e.status);
    }
  }
  return reopened;
}

function taskStats(tasks: TaskItem[]): DashboardPhase["tasks"] & { unassigned: number; withAcceptance: number } {
  const done = tasks.filter((t) => t.status === "done");
  const withAcc = tasks.filter((t) => t.acceptance.length > 0);
  const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));
  return {
    total: tasks.length,
    todo: tasks.filter((t) => t.status === "todo").length,
    doing: tasks.filter((t) => t.status === "doing").length,
    review: tasks.filter((t) => t.status === "review").length,
    done: done.length,
    withAcceptancePct: pct(withAcc.length, tasks.length),
    unassigned: tasks.filter((t) => !t.assignee).length,
    withAcceptance: withAcc.length,
  };
}

/** Gate per fase dari run TERAKHIR (createdAt desc): passed bila gatePassed;
 *  pending bila run masih hidup dan menunggu gate fase ini. */
function gateOf(phase: WorkflowPhase, runs: WorkflowRunRow[]): DashboardPhase["gate"] {
  const run = [...runs]
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((r) => r.workflow.phases.some((p) => p.id === phase));
  if (!run) return "none";
  const st = run.phaseStates.find((p) => p.phaseId === phase);
  if (!st) return "none";
  if (st.gatePassed) return "passed";
  const alive = run.status === "running" || run.status === "awaiting_gate" || run.status === "paused";
  if (alive && st.status === "done") return "pending";
  return "none";
}

export function buildProjectDashboard(input: {
  tasks: TaskItem[];
  events: ProjectEvent[];
  roster: RosterEntry[];
  runs: WorkflowRunRow[];
  signals: ProjectSignals;
  delegationErrors: number;
}): ProjectDashboard {
  const { tasks, events, roster, runs, signals, delegationErrors } = input;

  const overall = taskStats(tasks);
  const phases: DashboardPhase[] = WORKFLOW_PHASES.map((phase) => {
    const owners = roster.filter((r) => r.phases.includes(phase)).map((r) => r.personaId);
    const inPhase = tasks.filter((t) => t.phase === phase);
    const stats = taskStats(inPhase);
    return {
      phase,
      owners,
      tasks: {
        total: stats.total,
        todo: stats.todo,
        doing: stats.doing,
        review: stats.review,
        done: stats.done,
        withAcceptancePct: stats.withAcceptancePct,
      },
      gate: gateOf(phase, runs),
      // verdict QA = sinyal project-wide; dipasang di kartu testing (ranah QA)
      qa: phase === "testing" && (signals.qa.pass + signals.qa.fail + signals.qa.warn) > 0 ? signals.qa : null,
    };
  });

  const ordered = [...runs].sort((a, b) => a.createdAt - b.createdAt);
  const runOut: DashboardRun[] = ordered.map((r, i) => {
    const steps = r.phaseStates.flatMap((p) => p.steps);
    const stepsDone = steps.filter((s) => s.ok === true).length;
    return {
      index: i + 1,
      runId: r.id,
      name: r.workflow.name,
      status: r.status,
      stepsDone,
      stepsTotal: steps.length,
      delta: i === 0 ? null : stepsDone - runOutPrev(ordered, i),
      startedAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });

  return {
    tasks: {
      total: overall.total,
      todo: overall.todo,
      doing: overall.doing,
      review: overall.review,
      done: overall.done,
      unassigned: overall.unassigned,
      reopened: countReopened(events),
      withAcceptancePct: overall.withAcceptancePct,
    },
    health: {
      pendingApprovals: signals.pendingApprovals,
      qaFail: signals.qa.fail,
      delegationErrors,
    },
    phases,
    runs: runOut,
    updatedAt: Date.now(),
  };
}

/** stepsDone run sebelumnya (i-1) — dipakai utk delta. */
function runOutPrev(ordered: WorkflowRunRow[], i: number): number {
  const prev = ordered[i - 1]!;
  const steps = prev.phaseStates.flatMap((p) => p.steps);
  return steps.filter((s) => s.ok === true).length;
}
