// @yuika/core, project store (P1-PRJ-1, PLAN §13.1: project = entitas first-class).
// DB yang sama dengan sessions (demo.db); project BISA di-update (beda invariant
// append-only events). Tabel project_tasks dibuat sekaligus, dipakai P1-PRJ-4.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { ProjectEvent, ProjectInfo, type TaskItem, WorkflowDef } from "@yuika/contracts";

type ProjectEventType = ProjectEvent["type"];

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  root_path: string;
  kind: string;
  created_at: number;
  updated_at: number;
};

export class ProjectStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        root_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS project_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'todo',
        assignee TEXT,
        refs TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id);
      CREATE TABLE IF NOT EXISTS project_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_project_events_project ON project_events(project_id, seq);
    `);
    // P1-DUN-1: kolom kind, ruangan `dungeon` (arena latihan) vs `project` produksi
    const pcols = this.db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
    if (!pcols.some((c) => c.name === "kind")) {
      this.db.exec("ALTER TABLE projects ADD COLUMN kind TEXT NOT NULL DEFAULT 'project'");
    }
    // P2-PM-3: kolom detail task (Planner), migrasi idempotent utk DB lama
    const tcols = this.db.prepare("PRAGMA table_info(project_tasks)").all() as { name: string }[];
    const detailCols: Array<[string, string]> = [
      ["description", "TEXT"],
      ["acceptance", "TEXT NOT NULL DEFAULT '[]'"],
      ["depends_on", "TEXT NOT NULL DEFAULT '[]'"],
      ["estimate", "TEXT"],
      ["phase", "TEXT"],
    ];
    for (const [col, decl] of detailCols) {
      if (!tcols.some((c) => c.name === col)) this.db.exec(`ALTER TABLE project_tasks ADD COLUMN ${col} ${decl}`);
    }
    // P2-STU-4: riwayat kunjungan tab Browser (agent riset & user), audit +
    // "user melihat halaman yang sama dgn agent".
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS browser_visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT,
        by_role TEXT NOT NULL DEFAULT 'user',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_browser_visits_project ON browser_visits(project_id, id DESC);
    `);
    // P2-FLOW-2: run workflow, satu eksekusi workflow.yaml per project.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        lead_session_id TEXT NOT NULL,
        workflow TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        phase_states TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_project ON workflow_runs(project_id);
    `);
  }

  createProject(input: { id: string; name: string; description?: string; rootPath: string; kind?: "project" | "dungeon" }): ProjectInfo {
    const now = Date.now();
    this.db
      .prepare(
        "INSERT INTO projects (id, name, description, status, root_path, kind, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?, ?)",
      )
      .run(input.id, input.name, input.description ?? "", input.rootPath, input.kind ?? "project", now, now);
    return { id: input.id, name: input.name, description: input.description ?? "", status: "active", rootPath: input.rootPath, kind: input.kind ?? "project", createdAt: now, updatedAt: now };
  }

  listProjects(): ProjectInfo[] {
    const rows = this.db
      .prepare("SELECT * FROM projects ORDER BY created_at DESC, rowid DESC")
      .all() as ProjectRow[];
    return rows.map(toInfo);
  }

  getProject(id: string): ProjectInfo | undefined {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
    return row ? toInfo(row) : undefined;
  }

  updateProject(
    id: string,
    patch: { name?: string; description?: string; status?: "active" | "archived" },
  ): ProjectInfo | undefined {
    const cur = this.getProject(id);
    if (!cur) return undefined;
    const next = {
      name: patch.name ?? cur.name,
      description: patch.description ?? cur.description,
      status: patch.status ?? cur.status,
      updatedAt: Date.now(),
    };
    this.db
      .prepare("UPDATE projects SET name = ?, description = ?, status = ?, updated_at = ? WHERE id = ?")
      .run(next.name, next.description, next.status, next.updatedAt, id);
    return { ...cur, ...next };
  }

  /** D28 (kartu Home "… Ago"): tandai aktivitas terbaru project, sesi baru,
   *  perubahan roster, task. Edit metadata sudah lewat updateProjectData. */
  touchProject(id: string): void {
    this.db
      .prepare("UPDATE projects SET updated_at = ? WHERE id = ?")
      .run(Date.now(), id);
  }

  // ---- P2-FLOW-2: workflow runs (engine = satu-satunya penulis status) ----

  createWorkflowRun(input: { id: string; projectId: string; leadSessionId: string; workflow: unknown }): void {
    const now = Date.now();
    this.db
      .prepare(
        "INSERT INTO workflow_runs (id, project_id, lead_session_id, workflow, status, phase_states, created_at, updated_at) VALUES (?, ?, ?, ?, 'queued', '[]', ?, ?)",
      )
      .run(input.id, input.projectId, input.leadSessionId, JSON.stringify(input.workflow), now, now);
  }

  updateWorkflowRun(id: string, patch: { status?: string; phaseStates?: unknown; workflow?: unknown }): void {
    const sets: string[] = ["updated_at = ?"];
    const vals: unknown[] = [Date.now()];
    if (patch.status !== undefined) {
      sets.push("status = ?");
      vals.push(patch.status);
    }
    if (patch.phaseStates !== undefined) {
      sets.push("phase_states = ?");
      vals.push(JSON.stringify(patch.phaseStates));
    }
    // P2-FLOW-6: reassign step mengubah persona di def, persist agar
    // resume pasca-restart tetap memakai persona baru.
    if (patch.workflow !== undefined) {
      sets.push("workflow = ?");
      vals.push(JSON.stringify(patch.workflow));
    }
    vals.push(id);
    this.db.prepare(`UPDATE workflow_runs SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }

  getWorkflowRun(id: string): WorkflowRunRow | undefined {
    const r = this.db.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(id) as WorkflowRunDbRow | undefined;
    return r ? toWorkflowRun(r) : undefined;
  }

  listWorkflowRuns(projectId: string): WorkflowRunRow[] {
    return (this.db
      .prepare("SELECT * FROM workflow_runs WHERE project_id = ? ORDER BY created_at DESC")
      .all(projectId) as WorkflowRunDbRow[]).map(toWorkflowRun);
  }

  /** Boot resume: run yang belum tamat (FLOW-3). */
  listActiveWorkflowRuns(): WorkflowRunRow[] {
    return (this.db
      .prepare("SELECT * FROM workflow_runs WHERE status IN ('queued','running','awaiting_gate') ORDER BY created_at ASC")
      .all() as WorkflowRunDbRow[]).map(toWorkflowRun);
  }

  // ---- browser visits (P2-STU-4) ----

  addBrowserVisit(input: { projectId: string; url: string; title?: string | null; byRole: "agent" | "user" }): void {
    this.db
      .prepare("INSERT INTO browser_visits (project_id, url, title, by_role, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(input.projectId, input.url, input.title ?? null, input.byRole, Date.now());
  }

  listBrowserVisits(projectId: string, limit = 30): Array<{ id: number; url: string; title: string | null; byRole: string; createdAt: number }> {
    const rows = this.db
      .prepare("SELECT id, url, title, by_role, created_at FROM browser_visits WHERE project_id = ? ORDER BY id DESC LIMIT ?")
      .all(projectId, limit) as Array<{ id: number; url: string; title: string | null; by_role: string; created_at: number }>;
    return rows.map((r) => ({ id: r.id, url: r.url, title: r.title, byRole: r.by_role, createdAt: r.created_at }));
  }

  // ---- tasks (P1-PRJ-4) + event task.node.* (P1-PRJ-7, PLAN §13.7) ----
  // Setiap mutasi task menulis event DI TRANSAKSI YANG SAMA, ProjectStore adalah
  // satu-satunya penulis → TaskTree (proyeksi event) tak bisa drift dari tabel.
  /** P2-PM-3: input detail task (dipakai createTask & updateTask). */
  createTask(input: {
    id: string;
    projectId: string;
    title: string;
    assignee?: string | null;
    parentId?: string | null;
    description?: string | null;
    acceptance?: string[];
    dependsOn?: string[];
    estimate?: string | null;
    phase?: TaskItem["phase"];
  }): TaskItem {
    const now = Date.now();
    const parent = input.parentId ?? null;
    const acceptance = input.acceptance ?? [];
    const dependsOn = input.dependsOn ?? [];
    const emit = this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO project_tasks (id, project_id, title, status, assignee, refs, description, acceptance, depends_on, estimate, phase, created_at, updated_at) VALUES (?, ?, ?, 'todo', ?, '[]', ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(input.id, input.projectId, input.title, input.assignee ?? null, input.description ?? null, JSON.stringify(acceptance), JSON.stringify(dependsOn), input.estimate ?? null, input.phase ?? null, now, now);
      this.appendEvent(
        "task.node.created",
        { projectId: input.projectId, taskId: input.id, parent, title: input.title, assignee: input.assignee ?? null, description: input.description ?? null, acceptance, dependsOn, estimate: input.estimate ?? null, phase: input.phase ?? null },
        now,
      );
    });
    emit();
    return {
      id: input.id, projectId: input.projectId, title: input.title, status: "todo", assignee: input.assignee ?? null, refs: [],
      description: input.description ?? null, acceptance, dependsOn, estimate: input.estimate ?? null, phase: input.phase ?? null,
      createdAt: now, updatedAt: now,
    };
  }

  /** P1-PER-4: jumlah task DONE per assignee persona (lintas semua project). */
  taskDoneCountsByAssignee(): Map<string, number> {
    const rows = this.db
      .prepare(`SELECT assignee, COUNT(*) AS n FROM project_tasks WHERE status = 'done' AND assignee IS NOT NULL GROUP BY assignee`)
      .all() as Array<{ assignee: string; n: number }>;
    return new Map(rows.map((r) => [r.assignee, r.n]));
  }

  listTasks(projectId: string): TaskItem[] {    const rows = this.db
      .prepare("SELECT * FROM project_tasks WHERE project_id = ? ORDER BY created_at ASC, rowid ASC")
      .all(projectId) as TaskDbRow[];
    return rows.map(taskFromRow);
  }

  getTask(id: string): TaskItem | undefined {
    const row = this.db.prepare("SELECT * FROM project_tasks WHERE id = ?").get(id) as TaskDbRow | undefined;
    return row ? taskFromRow(row) : undefined;
  }

  /** Update parsial (title/status/assignee); refs di-append (bukan replace).
   *  P2-PM-3: detail (description/acceptance/dependsOn/estimate/phase) =
   *  replace-semantik. `addArtefak` hanya masuk event (TaskTree). */
  updateTask(
    id: string,
    patch: {
      title?: string;
      status?: TaskItem["status"];
      assignee?: string | null;
      addRefs?: string[];
      addArtefak?: string[];
      description?: string | null;
      acceptance?: string[];
      dependsOn?: string[];
      estimate?: string | null;
      phase?: TaskItem["phase"];
    },
  ): TaskItem | undefined {
    const cur = this.getTask(id);
    if (!cur) return undefined;
    const now = Date.now();
    const next = {
      title: patch.title ?? cur.title,
      status: patch.status ?? cur.status,
      assignee: patch.assignee === undefined ? cur.assignee : patch.assignee,
      refs: patch.addRefs?.length ? [...new Set([...cur.refs, ...patch.addRefs])] : cur.refs,
      description: patch.description === undefined ? cur.description : patch.description,
      acceptance: patch.acceptance ?? cur.acceptance,
      dependsOn: patch.dependsOn ?? cur.dependsOn,
      estimate: patch.estimate === undefined ? cur.estimate : patch.estimate,
      phase: patch.phase === undefined ? cur.phase : patch.phase,
      updatedAt: now,
    };
    const emit = this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE project_tasks SET title = ?, status = ?, assignee = ?, refs = ?, description = ?, acceptance = ?, depends_on = ?, estimate = ?, phase = ?, updated_at = ? WHERE id = ?",
        )
        .run(next.title, next.status, next.assignee, JSON.stringify(next.refs), next.description, JSON.stringify(next.acceptance), JSON.stringify(next.dependsOn), next.estimate, next.phase, next.updatedAt, id);
      const ev: Record<string, unknown> = { projectId: cur.projectId, taskId: id };
      // D28: perubahan task = aktivitas project (kartu Home "… Ago")
      this.touchProject(cur.projectId);
      if (patch.title !== undefined) ev.title = patch.title;
      if (patch.status !== undefined) ev.status = patch.status;
      if (patch.assignee !== undefined) ev.assignee = patch.assignee;
      if (patch.addRefs?.length) ev.addRefs = patch.addRefs;
      if (patch.addArtefak?.length) ev.addArtefak = patch.addArtefak;
      if (patch.description !== undefined) ev.description = patch.description;
      if (patch.acceptance !== undefined) ev.acceptance = patch.acceptance;
      if (patch.dependsOn !== undefined) ev.dependsOn = patch.dependsOn;
      if (patch.estimate !== undefined) ev.estimate = patch.estimate;
      if (patch.phase !== undefined) ev.phase = patch.phase;
      this.appendEvent("task.node.updated", ev, now);
    });
    emit();
    return { ...cur, ...next };
  }

  /** Tambah event project (payload tanpa field type; projectId wajib ada). */
  appendEvent(type: ProjectEventType, payload: Record<string, unknown>, ts = Date.now()): void {
    this.db
      .prepare("INSERT INTO project_events (project_id, type, payload, ts) VALUES (?, ?, ?, ?)")
      .run(payload.projectId as string, type, JSON.stringify({ ...payload, ts }), ts);
  }

  /** Event stream project urut seq ASC, sumber replay TaskTree. */
  listEvents(projectId: string): ProjectEvent[] {
    const rows = this.db
      .prepare("SELECT type, payload FROM project_events WHERE project_id = ? ORDER BY seq ASC")
      .all(projectId) as { type: string; payload: string }[];
    return rows.map((r) => ProjectEvent.parse({ ...JSON.parse(r.payload), type: r.type }));
  }

  /** P1-PRJ-8: hapus SEMUA baris milik project (tasks + event + baris projects)
   *  dalam SATU transaksi, panggil SETELAH artefak lain (sesi/file) bersih. */
  deleteProjectData(projectId: string): { tasks: number; projectEvents: number } {
    const tasks = this.db.prepare("DELETE FROM project_tasks WHERE project_id = ?").run(projectId).changes;
    const projectEvents = this.db.prepare("DELETE FROM project_events WHERE project_id = ?").run(projectId).changes;
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
    return { tasks, projectEvents };
  }

  close(): void {
    this.db.close();
  }
}

function toInfo(r: ProjectRow): ProjectInfo {
  return ProjectInfo.parse({
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status,
    rootPath: r.root_path,
    kind: (r.kind as "project" | "dungeon") ?? "project",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}

// ── P2-FLOW-2 ───────────────────────────────────────────────────────────────

export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "awaiting_gate"
  | "paused" // P2-FLOW-6: steering, pause mid-run (resume manual)
  | "done"
  | "failed"
  | "stopped";

export interface WorkflowStepState {
  id: string;
  personaId: string;
  ok: boolean | null; // null = belum jalan
  summary: string;
}

export interface WorkflowPhaseState {
  phaseId: string;
  status: "pending" | "running" | "done";
  steps: WorkflowStepState[];
  /** FLOW-3: true = gate fase ini SUDAH di-approve (persist), resume tidak
   *  menanya ulang; undefined/false + gate ON = gate harus ditanya lagi. */
  gatePassed?: boolean;
}

export interface WorkflowRunRow {
  id: string;
  projectId: string;
  leadSessionId: string;
  workflow: WorkflowDef;
  status: WorkflowRunStatus;
  phaseStates: WorkflowPhaseState[];
  createdAt: number;
  updatedAt: number;
}

interface WorkflowRunDbRow {
  id: string;
  project_id: string;
  lead_session_id: string;
  workflow: string;
  status: string;
  phase_states: string;
  created_at: number;
  updated_at: number;
}

function toWorkflowRun(r: WorkflowRunDbRow): WorkflowRunRow {
  return {
    id: r.id,
    projectId: r.project_id,
    leadSessionId: r.lead_session_id,
    workflow: WorkflowDef.parse(JSON.parse(r.workflow)),
    status: (r.status as WorkflowRunStatus) ?? "queued",
    phaseStates: JSON.parse(r.phase_states) as WorkflowPhaseState[],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── P2-PM-3: row → TaskItem (detail first-class) ────────────────────────────

interface TaskDbRow {
  id: string;
  project_id: string;
  title: string;
  status: string;
  assignee: string | null;
  refs: string;
  description: string | null;
  acceptance: string | null;
  depends_on: string | null;
  estimate: string | null;
  phase: string | null;
  created_at: number;
  updated_at: number;
}

function taskFromRow(r: TaskDbRow): TaskItem {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    status: r.status as TaskItem["status"],
    assignee: r.assignee,
    refs: JSON.parse(r.refs) as string[],
    description: r.description,
    acceptance: r.acceptance ? (JSON.parse(r.acceptance) as string[]) : [],
    dependsOn: r.depends_on ? (JSON.parse(r.depends_on) as string[]) : [],
    estimate: r.estimate,
    phase: (r.phase as TaskItem["phase"]) ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
