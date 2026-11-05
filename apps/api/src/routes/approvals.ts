// @yuika/api — approval decision (kartu persetujuan tool).
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";
import { ApprovalDecisionRequest } from "@yuika/contracts";

export function registerApprovalRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  app.post("/api/approvals/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = ApprovalDecisionRequest.parse(req.body);
    const ok = getRt().resolveApproval(id, body.approved, body.remember ?? false);
    if (!ok) return reply.code(404).send({ error: "request tidak dikenal / sudah selesai" });
    return { ok: true };
  });
}
