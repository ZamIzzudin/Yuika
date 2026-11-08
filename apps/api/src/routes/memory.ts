// @yuika/api, USER.md / MEMORY.md editor .
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";
import { MemoryScope, SaveMemoryRequest } from "@yuika/contracts";

export function registerMemoryRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  /** GET /api/memory?scope=user|project&projectId=…, baca USER.md / MEMORY.md. */
  app.get("/api/memory", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const scope = MemoryScope.parse(q.scope ?? "user");
    try {
      return { scope, projectId: q.projectId ?? null, content: getRt().readMemory(scope, q.projectId) };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** PUT /api/memory, simpan utuh dari editor user (satu-satunya jalur menimpa). */
  app.put("/api/memory", async (req, reply) => {
    const body = SaveMemoryRequest.parse(req.body);
    try {
      getRt().saveMemory(body.scope, body.content, body.projectId);
      return { ok: true };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });
}
