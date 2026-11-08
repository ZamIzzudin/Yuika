// @yuika/api, usage metering (P1-CRED-1) + attribution matrix (CRED-4).
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";
import { UsageFilter } from "@yuika/contracts";

export function registerUsageRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  /** GET /api/usage?projectId=&sessionId=&personaId=&since=&recent=N&matrix=1
   *  summary metering (rollup per persona/model) + feed event terbaru;
   *  `since` = epoch ms (window burn-rate); `matrix=1` → attribution + biaya. */
  app.get("/api/usage", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const filter = UsageFilter.parse({
      projectId: q.projectId ?? undefined,
      sessionId: q.sessionId ?? undefined,
      personaId: q.personaId ?? undefined,
      since: q.since ? Number(q.since) : undefined,
    });
    const rt = getRt();
    return {
      summary: rt.getUsageSummary(filter),
      recent: q.recent ? rt.getUsageRecent(Math.min(Number(q.recent) || 20, 200), filter) : undefined,
      matrix: q.matrix ? rt.getUsageMatrix(filter) : undefined,
    };
  });
}
