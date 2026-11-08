// @yuika/core, TaskTree projector (, /): hierarki pemantauan
// delegasi DIPROYEKSIKAN dari event stream project (append-only), bukan state kedua.
// Replay = fold ulang seluruh event → pohon utuh; refresh/reconnect gratis.
import type { ProjectEvent, TaskNode } from "@yuika/contracts";

/** Fold event → pohon (children nested, urut penciptaan). Node dengan parent tak dikenal naik ke root. */
export function taskTreeFromEvents(events: ProjectEvent[]): TaskNode[] {
  const nodes = new Map<string, TaskNode>();
  const order: string[] = [];

  for (const e of events) {
    if (e.type === "task.node.created") {
      if (nodes.has(e.taskId)) continue; // replay defensif: id duplikat diabaikan
      nodes.set(e.taskId, {
        id: e.taskId,
        parent: e.parent,
        title: e.title,
        status: "todo",
        assignee: e.assignee,
        refs: [],
        artefak: [],
 // detail task ikut ke pohon
        description: e.description ?? null,
        acceptance: e.acceptance ?? [],
        dependsOn: e.dependsOn ?? [],
        estimate: e.estimate ?? null,
        phase: e.phase ?? null,
        children: [],
      });
      order.push(e.taskId);
    } else {
      const n = nodes.get(e.taskId);
      if (!n) continue; // event untuk task pra-TaskTree, skip
      if (e.title !== undefined) n.title = e.title;
      if (e.status !== undefined) {
        // catat transisi waktu untuk durasi (tab Pohon: "running Xm Ys")
        if (e.status === "doing" || e.status === "review") n.startedAt = e.ts;
        if (e.status === "done") n.doneAt = e.ts;
        n.status = e.status;
      }
      if (e.assignee !== undefined) n.assignee = e.assignee;
      if (e.addRefs?.length) n.refs = [...new Set([...n.refs, ...e.addRefs])];
      if (e.addArtefak?.length) n.artefak = [...new Set([...n.artefak, ...e.addArtefak])];
 // detail, replace-semantik
      if (e.description !== undefined) n.description = e.description;
      if (e.acceptance !== undefined) n.acceptance = e.acceptance;
      if (e.dependsOn !== undefined) n.dependsOn = e.dependsOn;
      if (e.estimate !== undefined) n.estimate = e.estimate;
      if (e.phase !== undefined) n.phase = e.phase;
    }
  }

  const roots: TaskNode[] = [];
  for (const id of order) {
    const n = nodes.get(id)!;
    const parent = n.parent ? nodes.get(n.parent) : undefined;
    if (parent && parent !== n) parent.children.push(n);
    else roots.push(n);
  }
  return roots;
}

/** Proyeksi flat (TaskList board) dari tree, urut kedalaman-lalu-penciptaan. */
export function flattenTree(nodes: TaskNode[], depth = 0): { node: TaskNode; depth: number }[] {
  return nodes.flatMap((n) => [{ node: n, depth }, ...flattenTree(n.children, depth + 1)]);
}
