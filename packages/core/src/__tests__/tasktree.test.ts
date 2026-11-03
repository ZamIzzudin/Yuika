// P1-PRJ-7 (TASKS.md, PLAN §13.7/D19): TaskTree = proyeksi event, bukan state kedua.
// Replay seluruh event project → pohon utuh; TaskList = flat view dari tree.
import { describe, expect, it } from "vitest";
import { ProjectEvent, type ProjectEvent as PE } from "@yui/contracts";
import { flattenTree, taskTreeFromEvents } from "../project/tasktree.js";

let seq = 0;
const created = (taskId: string, parent: string | null, title: string, assignee: string | null = null): PE =>
  ProjectEvent.parse({ type: "task.node.created", projectId: "p_x", taskId, parent, title, assignee, ts: ++seq });
const updated = (taskId: string, patch: Partial<{ title: string; status: "todo" | "doing" | "review" | "done"; assignee: string | null; addRefs: string[]; addArtefak: string[] }>): PE =>
  ProjectEvent.parse({ type: "task.node.updated", projectId: "p_x", taskId, ...patch, ts: ++seq });

describe("TaskTree projector", () => {
  it("pohon utuh dari replay: parent/child nested, urut penciptaan", () => {
    const tree = taskTreeFromEvents([
      created("t1", null, "Riset Phaser"),
      created("t2", "t1", "Dokumentasi Physics"),
      created("t3", "t1", "Contoh project"),
      created("t4", null, "Template skor"),
    ]);
    expect(tree.map((n) => n.id)).toEqual(["t1", "t4"]);
    expect(tree[0]!.children.map((n) => n.id)).toEqual(["t2", "t3"]);
  });

  it("update diterapkan: status/assignee/title; refs & artefak ter-akumulasi + dedup", () => {
    const tree = taskTreeFromEvents([
      created("t1", null, "Riset", "yui-scholar"),
      updated("t1", { status: "doing" }),
      updated("t1", { title: "Riset Phaser" }),
      updated("t1", { addRefs: ["job_1", "job_1", "step:2"] }),
      updated("t1", { addArtefak: ["reports/skill-draft.md"] }),
      updated("t1", { status: "review", assignee: null }),
    ]);
    expect(tree[0]).toMatchObject({ title: "Riset Phaser", status: "review", assignee: null, refs: ["job_1", "step:2"], artefak: ["reports/skill-draft.md"] });
  });

  it("parent tak dikenal / rusak → node naik jadi root (replay defensif)", () => {
    const tree = taskTreeFromEvents([created("t1", "t_hantu", "Yatim")]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.parent).toBe("t_hantu");
    expect(tree[0]!.children).toEqual([]);
  });

  it("flatten = proyeksi TaskList (depth-lalu-penciptaan)", () => {
    const flat = flattenTree(
      taskTreeFromEvents([created("t1", null, "A"), created("t2", "t1", "A.1"), created("t3", "t2", "A.1.1"), created("t4", null, "B")]),
    );
    expect(flat.map((f) => `${f.node.id}:${f.depth}`)).toEqual(["t1:0", "t2:1", "t3:2", "t4:0"]);
  });
});
