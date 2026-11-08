// @yuika/api, kontrol anak delegasi (P0-DEL-2 steer/cancel + P1-DEL-3 pause/resume).
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { YuiRuntime } from "@yuika/core";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("steer"), text: z.string().min(1).max(4_000) }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume") }),
]);

export function registerDelegationRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  /** POST /api/delegations/:id, kontrol anak delegasi dari UI parent.
   *  id = childSessionId. 404 bila anak sudah selesai (tak terdaftar). */
  app.post("/api/delegations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body, use {action:'cancel'|'steer'|'pause'|'resume'} (+text for steer)" });
    }
    const rt = getRt();
    const ok =
      parsed.data.action === "cancel"
        ? rt.cancelDelegation(id)
        : parsed.data.action === "steer"
          ? rt.steerDelegation(id, parsed.data.text)
          : parsed.data.action === "pause"
            ? rt.pauseDelegation(id)
            : rt.resumeDelegation(id);
    if (!ok) return reply.code(404).send({ error: "delegation not active (may have finished)" });
    return { ok: true };
  });
}
