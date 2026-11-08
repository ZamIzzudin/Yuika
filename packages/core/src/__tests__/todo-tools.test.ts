// tool todo_*, agent mengelola tasklist project dari turn.
import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registry, resetRegistryForTests } from "../registry.js";
import { registerTodoTools } from "../tools/todo-tools.js";
import { SessionStore } from "../session/store.js";
import { ProjectStore } from "../project/store.js";

const ctx = { sessionId: "s_prj", turnId: "t1", workspacePath: "/tmp", emit: () => {}, requestApproval: async () => true };

describe("todo tools ()", () => {
  let projects: ProjectStore;
  let sessions: SessionStore;

  beforeEach(() => {
    resetRegistryForTests();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-todo-"));
    projects = new ProjectStore(path.join(dir, "p.db"));
    sessions = new SessionStore(path.join(dir, "s.db"));
    projects.createProject({ id: "p_a", name: "A", rootPath: "projects/p_a" });
    sessions.createSession("s_prj", "yui-conductor", "SYS", [], "p_a");
    sessions.createSession("s_free", "yui-scholar", "SYS", []);
    registerTodoTools({ sessionStore: sessions, projects });
  });

  it("sesi TANPA project → error informatif, bukan crash", async () => {
    const res = await registry.dispatch("todo_list", {}, { ...ctx, sessionId: "s_free" });
    expect(res.isError).toBe(true);
    if (res.isError) expect(String((res.result as { error: string }).error)).toContain("project");
  });

  it("add → list → update done (agent menandai selesai dari turn)", async () => {
    const add = await registry.dispatch("todo_add", { title: "Tulis draft arsitektur", assignee: "yui-scribe" }, ctx);
    expect(add.isError).toBeFalsy();
    const id = (add.result as { task: { id: string } }).task.id;
    expect(id).toMatch(/^t_/);

    const list = await registry.dispatch("todo_list", {}, ctx);
    const tasks = (list.result as { tasks: { id: string; status: string; assignee: string | null }[] }).tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.status).toBe("todo");
    expect(tasks[0]!.assignee).toBe("yui-scribe");

    const up = await registry.dispatch("todo_update", { id, status: "done" }, ctx);
    expect(up.isError).toBeFalsy();
    expect(projects.getTask(id)!.status).toBe("done");
  });

  it("todo_update task project lain DITOLAK (scope per project)", async () => {
    projects.createProject({ id: "p_b", name: "B", rootPath: "projects/p_b" });
    const foreign = projects.createTask({ id: "t_foreign", projectId: "p_b", title: "Milik B" });
    const res = await registry.dispatch("todo_update", { id: foreign.id, status: "done" }, ctx);
    expect(res.isError).toBe(true);
    expect(projects.getTask(foreign.id)!.status).toBe("todo"); // tidak tersentuh
  });
});
