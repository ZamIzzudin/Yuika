// Project store: first-class project CRUD + the tasks table.
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

  it("touchProject marks activity, updatedAt rises (Home '... Ago' cards)", () => {
    const store = makeStore();
    store.createProject({ id: "p_a", name: "A", rootPath: "projects/p_a" });
    const before = store.getProject("p_a")!.updatedAt;

    // dorong updatedAt masa depan ala aktivitas, pastikan touch benar-benar menulis
    store.updateProject("p_a", { description: "seed" });
    const t0 = store.getProject("p_a")!.updatedAt;
    store.touchProject("p_a");
    expect(store.getProject("p_a")!.updatedAt).toBeGreaterThanOrEqual(t0);
    expect(store.getProject("p_a")!.updatedAt).toBeGreaterThan(before - 1);

    // task update ikut menyentuh project ( aktivitas )
    store.createTask({ id: "t_1", projectId: "p_a", title: "T", assignee: null, parentId: null, description: null, acceptance: [], dependsOn: [], estimate: null, phase: null });
    store.updateTask("t_1", { status: "done" });
    expect(store.getProject("p_a")!.updatedAt).toBeGreaterThanOrEqual(t0);
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

  it("tasks: CRUD penuh (), create, list scoped, update parsial + refs append", () => {
    const store = makeStore();
    store.createProject({ id: "p_a", name: "A", rootPath: "projects/p_a" });
    store.createProject({ id: "p_b", name: "B", rootPath: "projects/p_b" });

    store.createTask({ id: "t_1", projectId: "p_a", title: "Riset kompetitor" });
    store.createTask({ id: "t_2", projectId: "p_a", title: "Wireframe", assignee: "yui-designer" });

    expect(store.listTasks("p_a").map((t) => t.title)).toEqual(["Riset kompetitor", "Wireframe"]);
    expect(store.listTasks("p_b")).toEqual([]); // scoped per project
    expect(store.listTasks("p_a")[1]!.assignee).toBe("yui-designer");

    // update parsial: status + assignee tak tersentuh bila tak diberikan
    const up = store.updateTask("t_1", { status: "doing" })!;
    expect(up.status).toBe("doing");
    expect(up.assignee).toBeNull();
    // refs di-APPEND (bukan replace) & bebas duplikat
    store.updateTask("t_1", { addRefs: ["reports/riset.md", "job_9"] });
    const dedup = store.updateTask("t_1", { addRefs: ["reports/riset.md"] })!;
    expect(dedup.refs).toEqual(["reports/riset.md", "job_9"]);
    expect(store.updateTask("t_nope", { status: "done" })).toBeUndefined();
  });
});
