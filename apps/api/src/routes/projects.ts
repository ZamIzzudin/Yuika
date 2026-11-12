// @yuika/api, routes project (P1-PRJ-*) + files/tasks/tree/roster/delegations/uploads.
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";
import { CreateProjectRequest, CreateTaskRequest, DelegationJob, lintTaskList, SaveRosterRequest, UpdateProjectRequest, UpdateTaskRequest } from "@yuika/contracts";


export function registerProjectRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  app.get("/api/projects", async () => ({ projects: getRt().listProjects() }));

  app.post("/api/projects", async (req, reply) => {
    const body = CreateProjectRequest.parse(req.body);
    const project = getRt().createProject(body.name, body.description);
    return reply.code(201).send({ project });
  });

  app.get("/api/projects/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = getRt().getProject(id);
    if (!project) return reply.code(404).send({ error: "project tidak ditemukan" });
    return { project };
  });

  app.patch("/api/projects/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = UpdateProjectRequest.parse(req.body);
    const project = getRt().updateProject(id, body);
    if (!project) return reply.code(404).send({ error: "project tidak ditemukan" });
    return { project };
  });

 /** DELETE, hapus project + SEMUA artefak terkait .
   *  DIPERTAHANKAN: skill persona (milik persona) & usage ledger (akuntansi jujur). */
  app.delete("/api/projects/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return await getRt().deleteProject(id);
    } catch (e) {
      return reply.code(404).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET /api/projects/:id/delegations → semua edge delegasi lintas sesi
   *  (graf nyata: parent→child, termasuk delegasi cucu) + jobs persist. */
  app.get("/api/projects/:id/delegations", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const rt = getRt();
      return { delegations: rt.getProjectDelegations(id), jobs: DelegationJob.array().parse(rt.delegationJobs(id)) };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET /api/projects/:id/files → tree. ?path=… (+&rev=N | &revisions=1). */
  app.get("/api/projects/:id/files", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const sp = req.query as Record<string, string | undefined>;
      const p = sp.path;
      if (p) {
        if (sp.revisions) return { revisions: getRt().listFileRevisions(id, p) };
        if (sp.rev) return { content: getRt().readFileRevision(id, p, Number(sp.rev)) };
        return getRt().readProjectFile(id, p);
      }
      return { tree: getRt().listProjectFiles(id) };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

 /** GET /:id/roster, roster dari project.yaml + readiness skill . */
  app.get("/api/projects/:id/roster", async (req, reply) => {
    const { id } = req.params as { id: string };
    const rt = getRt();
    if (!rt.getProject(id)) return reply.code(404).send({ error: "project tidak ditemukan" });
    return { roster: rt.getProjectRoster(id), readiness: rt.getRosterReadiness(id) };
  });

  app.put("/api/projects/:id/roster", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = SaveRosterRequest.parse(req.body);
    try {
      return { roster: getRt().saveProjectRoster(id, body.roster) };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) }); // unknown persona / project hilang
    }
  });

  app.get("/api/projects/:id/tasks", async (req, reply) => {
    const { id } = req.params as { id: string };
    const rt = getRt();
    if (!rt.getProject(id)) return reply.code(404).send({ error: "project tidak ditemukan" });
    return { tasks: rt.listProjectTasks(id) };
  });

 /** dashboard progres terukur, burndown task, RACI fase +
   *  metrik live, health (blocker/revisi/hold), ringkasan iterasi run. */
  app.get("/api/projects/:id/dashboard", async (req, reply) => {
    const { id } = req.params as { id: string };
    const rt = getRt();
    if (!rt.getProject(id)) return reply.code(404).send({ error: "project tidak ditemukan" });
    const dashboard = rt.getProjectDashboard(id);
    if (!dashboard) return reply.code(404).send({ error: "project tidak ditemukan" });
    return { dashboard };
  });

  app.post("/api/projects/:id/tasks", async (req, reply) => {
    const { id } = req.params as { id: string };
    const rt = getRt();
    if (!rt.getProject(id)) return reply.code(404).send({ error: "project tidak ditemukan" });
    const body = CreateTaskRequest.parse(req.body);
    const task = rt.createProjectTask(id, body.title, body.assignee ?? null, body.parentId ?? null, {
      description: body.description ?? null,
      acceptance: body.acceptance,
      dependsOn: body.dependsOn,
      estimate: body.estimate ?? null,
      phase: body.phase ?? null,
    });
    return reply.code(201).send({ task });
  });

 /** validator task list, DAG + coverage fase + kelengkapan detail. */
  app.get("/api/projects/:id/tasks/validate", async (req, reply) => {
    const { id } = req.params as { id: string };
    const rt = getRt();
    if (!rt.getProject(id)) return reply.code(404).send({ error: "project tidak ditemukan" });
    return lintTaskList(rt.listProjectTasks(id));
  });

  app.patch("/api/projects/:id/tasks/:taskId", async (req, reply) => {
    const { id, taskId } = req.params as { id: string; taskId: string };
    const body = UpdateTaskRequest.parse(req.body);
    // scope check: task harus milik project ini
    const existing = getRt().listProjectTasks(id).find((t) => t.id === taskId);
    if (!existing) return reply.code(404).send({ error: "task tidak ditemukan di project ini" });
    return { task: getRt().updateProjectTask(taskId, body) };
  });

 /** GET /:id/tree, TaskTree : pohon utuh dari replay
   *  event project (append-only). Refresh = fold ulang, tanpa state kedua. */
  app.get("/api/projects/:id/tree", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!getRt().getProject(id)) return reply.code(404).send({ error: "project tidak ditemukan" });
    return { nodes: getRt().getTaskTree(id) };
  });
}
