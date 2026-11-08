// @yuika/api, Batch 14a++: activity feed project-wide untuk tab Logs.
// GET /api/projects/:id/activity?limit=200 → langkah semua persona (tool
// calls, screen, vault, delegasi, approval) + browsing history, digabung,
// urut waktu terbaru. Realtime via poll ringan di web.
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";

interface VisitRow {
  createdAt: number;
  url: string;
  byRole: string;
}

export function registerActivityRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  app.get("/api/projects/:id/activity", async (req, reply) => {
    const { id } = req.params as { id: string };
    const rt = getRt();
    if (!rt.getProject(id)) return reply.code(404).send({ error: "project not found" });
    const limit = Math.min(Number((req.query as Record<string, string | undefined>).limit ?? 200) || 200, 500);

    const activity = rt.getProjectActivity(id, limit).map((a) => ({
      at: a.at,
      personaId: a.personaId,
      kind: a.kind,
      label: a.label,
      isError: a.isError ?? false,
      sessionId: a.sessionId,
    }));
    // Browsing history (reader/web_fetch + web tab agent) digabung ke feed.
    const visits = (rt.listBrowserVisits(id, limit) as VisitRow[]).map((v) => ({
      at: v.createdAt,
      personaId: v.byRole === "user" ? "user" : v.byRole,
      kind: "visit" as const,
      label: `visited ${v.url}`,
      isError: false,
      sessionId: "",
    }));

    const merged = [...activity, ...visits]
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);
    return { activity: merged };
  });
}
