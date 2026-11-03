// P1-PRJ-1 (TASKS.md): project store — CRUD project first-class + tabel tasks siap PRJ-4.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectStore } from "../project/store.js";

function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-projects-"));
  return new ProjectStore(path.join(dir, "test.db"));
}

describe("ProjectStore", () => {
  it("create → get roundtrip; list terurut terbaru dulu", () => {
    const store = makeStore();
    const a = store.createProject({ id: "p_a", name: "Project A", rootPath: "projects/p_a" });
    const b = store.createProject({ id: "p_b", name: "Project B", description: "demo", rootPath: "projects/p_b" });

    expect(store.getProject("p_a")).toMatchObject({ id: "p_a", name: "Project A", status: "active" });
    expect(store.getProject("p_b")).toMatchObject({ id: "p_b", description: "demo" });
    expect(store.listProjects().map((p) => p.id)).toEqual(["p_b", "p_a"]); // DESC createdAt
    expect(a.rootPath).toBe("projects/p_a");
  });

  it("update parsial: nama berubah, field lain utuh; unknown id → undefined", () => {
    const store = makeStore();
    store.createProject({ id: "p_a", name: "Lama", description: "d", rootPath: "projects/p_a" });

    const up = store.updateProject("p_a", { name: "Baru" })!;
    expect(up.name).toBe("Baru");
    expect(up.description).toBe("d"); // tidak tersentuh
    expect(up.updatedAt).toBeGreaterThanOrEqual(up.createdAt);

    const archived = store.updateProject("p_a", { status: "archived" })!;
    expect(archived.status).toBe("archived");
    expect(store.updateProject("p_nope", { name: "x" })).toBeUndefined();
    expect(store.getProject("p_nope")).toBeUndefined();
  });

  it("tasks: tabel siap (P1-PRJ-4) — create + list per project", () => {
    const store = makeStore();
    store.createProject({ id: "p_a", name: "A", rootPath: "projects/p_a" });
    store.createProject({ id: "p_b", name: "B", rootPath: "projects/p_b" });

    store.createTask({ id: "t_1", projectId: "p_a", title: "Riset kompetitor" });
    store.createTask({ id: "t_2", projectId: "p_a", title: "Wireframe", assignee: "yui-designer" });

    expect(store.listTasks("p_a").map((t) => t.title)).toEqual(["Riset kompetitor", "Wireframe"]);
    expect(store.listTasks("p_b")).toEqual([]); // scoped per project
    expect(store.listTasks("p_a")[1]!.assignee).toBe("yui-designer");
  });
});
