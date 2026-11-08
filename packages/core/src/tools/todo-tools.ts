// @yuika/core, todo tools : tasklist per project dilihat/dikelola agent.
// Hanya jalan untuk sesi yang melekat ke project , sesi workspace global
// mendapat error informatif. Status machine: todo → doing → review → done.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { registry } from "../registry.js";
import { TaskStatus, WORKFLOW_PHASES } from "@yuika/contracts";
import type { ProjectStore } from "../project/store.js";
import type { ISessionStore } from "../session/store.js";

const listSchema = z.object({});
const addSchema = z.object({
  title: z.string().min(1).max(140).describe("judul task, imperatif & spesifik"),
  assignee: z.string().nullish().describe("persona id assignee (mis. yui-coder), opsional"),
 // detail first-class, Planner mengisi saat generate task list
  description: z.string().max(2_000).nullish().describe("deskripsi lengkap apa & mengapa (beda dari judul)"),
  acceptance: z.array(z.string().min(3).max(500)).max(20).optional().describe("acceptance criteria, kalimat terverifikasi-able"),
  dependsOn: z.array(z.string()).max(50).optional().describe("id task yang harus selesai dulu (DAG)"),
  estimate: z.string().max(24).nullish().describe("estimasi kasar, mis. \"2d\" / \"4h\""),
  phase: z.enum(WORKFLOW_PHASES).nullish().describe("fase workflow yang di-cover task ini"),
});
const updateSchema = z.object({
  id: z.string().describe("task id dari todo_list"),
  title: z.string().min(1).max(140).optional(),
  status: TaskStatus.optional().describe("todo | doing | review | done"),
  assignee: z.string().nullable().optional(),
  addRefs: z.array(z.string()).optional().describe("referensi artefak (path/job id) untuk ditambahkan"),
 // detail, replace-semantik
  description: z.string().max(2_000).nullable().optional(),
  acceptance: z.array(z.string().min(3).max(500)).max(20).optional(),
  dependsOn: z.array(z.string()).max(50).optional(),
  estimate: z.string().max(24).nullable().optional(),
  phase: z.enum(WORKFLOW_PHASES).nullable().optional(),
});

export function registerTodoTools(deps: { sessionStore: ISessionStore; projects: ProjectStore }): void {
  /** Resolve project sesi; throw kalau sesi tidak melekat ke project. */
  function projectIdOf(sessionId: string): string {
    const session = deps.sessionStore.getSession(sessionId);
    const pid = session?.projectId ?? null;
    if (!pid) throw new Error("sesi ini tidak melekat ke project, tasklist hanya tersedia di sesi project");
    return pid;
  }

  registry.register({
    name: "todo_list",
    description: "Lihat tasklist project sesi ini (id, judul, status, assignee).",
    parameters: listSchema,
    handler: async (_args: z.infer<typeof listSchema>, ctx) => {
      const tasks = deps.projects.listTasks(projectIdOf(ctx.sessionId));
      return { result: { tasks } };
    },
  });

  registry.register({
    name: "todo_add",
    description:
      "Tambah task baru ke tasklist project sesi ini. Planner: sertakan acceptance, " +
      "dependsOn (DAG), assignee, estimate, dan phase agar task list lolos validator.",
    parameters: addSchema,
    handler: async (args: z.infer<typeof addSchema>, ctx) => {
      const task = deps.projects.createTask({
        id: `t_${randomUUID().slice(0, 8)}`,
        projectId: projectIdOf(ctx.sessionId),
        title: args.title,
        assignee: args.assignee ?? null,
        description: args.description ?? null,
        acceptance: args.acceptance,
        dependsOn: args.dependsOn,
        estimate: args.estimate ?? null,
        phase: args.phase ?? null,
      });
      return { result: { task } };
    },
  });

  registry.register({
    name: "todo_update",
    description:
      "Perbarui task project (status todo→doing→review→done, judul, assignee, tambah referensi artefak). " +
      "Tandai 'done' saat pekerjaan benar-benar selesai & terverifikasi.",
    parameters: updateSchema,
    handler: async (args: z.infer<typeof updateSchema>, ctx) => {
      const pid = projectIdOf(ctx.sessionId);
      const existing = deps.projects.getTask(args.id);
      if (!existing || existing.projectId !== pid) throw new Error(`task tidak ditemukan di project ini: ${args.id}`);
      const task = deps.projects.updateTask(args.id, args);
      if (!task) throw new Error(`task tidak ditemukan: ${args.id}`);
      return { result: { task } };
    },
  });
}
