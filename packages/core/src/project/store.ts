// @yui/core — project store (P1-PRJ-1, PLAN §13.1: project = entitas first-class).
// DB yang sama dengan sessions (demo.db); project BISA di-update (beda invariant
// append-only events). Tabel project_tasks dibuat sekaligus — dipakai P1-PRJ-4.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { ProjectInfo, type TaskItem } from "@yui/contracts";

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  root_path: string;
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
    `);
  }

  createProject(input: { id: string; name: string; description?: string; rootPath: string }): ProjectInfo {
    const now = Date.now();
    this.db
      .prepare(
        "INSERT INTO projects (id, name, description, status, root_path, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?)",
      )
      .run(input.id, input.name, input.description ?? "", input.rootPath, now, now);
    return { id: input.id, name: input.name, description: input.description ?? "", status: "active", rootPath: input.rootPath, createdAt: now, updatedAt: now };
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

  // ---- tasks (tabel siap; REST/tool menyusul P1-PRJ-4) ----

  createTask(input: { id: string; projectId: string; title: string; assignee?: string | null }): TaskItem {
    const now = Date.now();
    this.db
      .prepare(
        "INSERT INTO project_tasks (id, project_id, title, status, assignee, refs, created_at, updated_at) VALUES (?, ?, ?, 'todo', ?, '[]', ?, ?)",
      )
      .run(input.id, input.projectId, input.title, input.assignee ?? null, now, now);
    return { id: input.id, projectId: input.projectId, title: input.title, status: "todo", assignee: input.assignee ?? null, refs: [], createdAt: now, updatedAt: now };
  }

  listTasks(projectId: string): TaskItem[] {
    const rows = this.db
      .prepare("SELECT * FROM project_tasks WHERE project_id = ? ORDER BY created_at ASC")
      .all(projectId) as { id: string; project_id: string; title: string; status: string; assignee: string | null; refs: string; created_at: number; updated_at: number }[];
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      title: r.title,
      status: r.status as TaskItem["status"],
      assignee: r.assignee,
      refs: JSON.parse(r.refs) as string[],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
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
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}
