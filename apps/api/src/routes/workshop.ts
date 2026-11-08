// @yuika/api, Batch 13 (P2-WKS): workshop persisten per project.
// GET  /api/projects/:id/workshop        → WorkshopInfo
// POST /api/projects/:id/workshop/start|sleep|recover|reset|destroy
// POST /api/projects/:id/workshop/exec   → jalankan perintah (by user, UI panel)
// GET  /api/projects/:id/workshop/log    → ring log (state + audit command)
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";
import { z } from "zod";

const StartRequest = z.object({
  /** Override allowlist egress (default: .yuika/workshop.json). */
  egressAllow: z.array(z.string().min(3).max(200)).max(64).optional(),
});

const ExecRequest = z.object({
  cmd: z.string().min(1).max(120),
  args: z.array(z.string().max(500)).max(32).default([]),
  timeoutMs: z.number().int().min(1_000).max(600_000).optional(),
});

export function registerWorkshopRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  const wsOf = (id: string) => {
    const rt = getRt();
    if (!rt.getProject(id)) return { err: "project tidak ditemukan" as const, rt };
    return { rt };
  };

  app.get("/api/projects/:id/workshop", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rt, err } = wsOf(id);
    if (err || !rt) return reply.code(404).send({ error: err ?? "project tidak ditemukan" });
    return { workshop: rt.workshop.info(id) };
  });

  app.post("/api/projects/:id/workshop/start", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rt, err } = wsOf(id);
    if (err || !rt) return reply.code(404).send({ error: err ?? "project tidak ditemukan" });
    const body = StartRequest.parse(req.body ?? {});
    try {
      const workshop = await rt.workshop.start(id, { egressAllow: body.egressAllow, by: "user" });
      return { workshop };
    } catch (e) {
      return reply.code(500).send({ error: e instanceof Error ? e.message : "start workshop gagal" });
    }
  });

  app.post("/api/projects/:id/workshop/:action(sleep|recover|reset|destroy)", async (req, reply) => {
    const { id, action } = req.params as { id: string; action: string };
    const { rt, err } = wsOf(id);
    if (err || !rt) return reply.code(404).send({ error: err ?? "project tidak ditemukan" });
    try {
      if (action === "destroy") {
        await rt.workshop.destroy(id);
        return { workshop: rt.workshop.info(id) };
      }
      const workshop =
        action === "sleep" ? await rt.workshop.sleep(id, "user")
        : action === "recover" ? await rt.workshop.recover(id)
        : await rt.workshop.reset(id);
      return { workshop };
    } catch (e) {
      return reply.code(500).send({ error: e instanceof Error ? e.message : `${action} workshop gagal` });
    }
  });

  app.post("/api/projects/:id/workshop/exec", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rt, err } = wsOf(id);
    if (err || !rt) return reply.code(404).send({ error: err ?? "project tidak ditemukan" });
    const body = ExecRequest.parse(req.body ?? {});
    try {
      const result = await rt.workshop.exec(id, body.cmd, body.args, { by: "user", timeoutMs: body.timeoutMs });
      return { result };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : "exec gagal" });
    }
  });

  app.get("/api/projects/:id/workshop/log", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rt, err } = wsOf(id);
    if (err || !rt) return reply.code(404).send({ error: err ?? "project tidak ditemukan" });
    const limit = Math.min(Number((req.query as Record<string, string | undefined>).limit ?? 100) || 100, 200);
    return { log: rt.workshop.listLog(id, limit) };
  });
}
