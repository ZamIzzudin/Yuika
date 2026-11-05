import { describe, expect, it } from "vitest";
import {
  CreateProjectRequest,
  ProjectInfo,
  RosterEntry,
  TaskItem,
  UpdateProjectRequest,
  WORKFLOW_PHASES,
} from "../index.js";

/** Behavior contract: project = entitas first-class (PLAN §13.1, D14). */
describe("Project contract", () => {
  it("ProjectInfo menerima bentuk valid + default", () => {
    const p = ProjectInfo.parse({
      id: "p_demo123",
      name: "Landing Page v2",
      description: "Redesign halaman utama",
      rootPath: "projects/p_demo123",
      createdAt: 1,
      updatedAt: 1,
    });
    expect(p.status).toBe("active"); // default
    expect(p.description).toBe("Redesign halaman utama");
  });

  it("ProjectInfo menolak id tanpa prefix p_", () => {
    expect(() =>
      ProjectInfo.parse({ id: "demo", name: "x", rootPath: "projects/demo", createdAt: 1, updatedAt: 1 }),
    ).toThrow();
  });

  it("RosterEntry default fase & binding kosong; fase invalid ditolak", () => {
    const r = RosterEntry.parse({ personaId: "yui-coder", role: "Implementer utama" });
    expect(r.phases).toEqual([]);
    expect(r.mcp).toEqual([]);
    expect(() =>
      RosterEntry.parse({ personaId: "yui-coder", role: "x", phases: ["deploy"] as never[] }),
    ).toThrow();
    expect(WORKFLOW_PHASES).toHaveLength(7); // template 7 fase (D15)
  });

  it("TaskItem status & assignee nullable", () => {
    const t = TaskItem.parse({ id: "t_1", projectId: "p_demo123", title: "Setup repo", createdAt: 1, updatedAt: 1 });
    expect(t.status).toBe("todo");
    expect(t.assignee).toBeNull();
    expect(t.refs).toEqual([]);
  });

  it("REST payload create/update tervalidasi", () => {
    expect(CreateProjectRequest.parse({ name: "Demo" }).description).toBe("");
    expect(() => CreateProjectRequest.parse({ name: "" })).toThrow(); // nama wajib
    const u = UpdateProjectRequest.parse({ status: "archived" });
    expect(u.status).toBe("archived");
    expect(u.name).toBeUndefined(); // patch parsial
    expect(() => UpdateProjectRequest.parse({ status: "deleted" })).toThrow();
  });
});
