// @yuika/api — P2-STU-4: routes tab Browser (read-only).
// GET  /api/projects/:id/browser/fetch?url=…  → halaman tersanitasi (+catat kunjungan user)
// GET  /api/projects/:id/browser/visits       → riwayat (agent riset + user)
// GET  /api/projects/:id/browser/policy       → { allow, allowAll }
// PUT  /api/projects/:id/browser/policy       → set allowAll / allowlist (persist .yuika/browser.json)
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";
import { BrowserReadError } from "@yuika/core";
import { z } from "zod";

const policyPut = z.object({
  allowAll: z.boolean().optional(),
  allow: z.array(z.string().min(1).max(100)).max(200).optional(),
});

export function registerBrowserRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  app.get("/api/projects/:id/browser/fetch", async (req, reply) => {
    const { id } = req.params as { id: string };
    const url = (req.query as Record<string, string | undefined>).url ?? "";
    try {
      const page = await getRt().getBrowserPage(id, url, "user");
      return { url: page.url, title: page.title, contentType: page.contentType, html: page.html };
    } catch (e) {
      if (e instanceof BrowserReadError) {
        const status = e.code === "host_denied" || e.code === "scheme_denied" || e.code === "private_blocked" ? 403 : 400;
        return reply.code(status).send({ error: e.message, code: e.code });
      }
      return reply.code(500).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/projects/:id/browser/visits", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!getRt().getProject(id)) return reply.code(404).send({ error: "project tidak ditemukan" });
    const limit = Math.min(Number((req.query as Record<string, string | undefined>).limit ?? 30) || 30, 100);
    return { visits: getRt().listBrowserVisits(id, limit) };
  });

  app.get("/api/projects/:id/browser/policy", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return getRt().getBrowserPolicy(id);
    } catch {
      return reply.code(404).send({ error: "project tidak ditemukan" });
    }
  });

  app.put("/api/projects/:id/browser/policy", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = policyPut.safeParse(req.body ?? {});
    if (!parsed.success)
      return reply.code(400).send({ error: "body policy tidak valid (allowAll?: boolean, allow?: string[])" });
    try {
      return getRt().setBrowserPolicy(id, parsed.data);
    } catch {
      return reply.code(404).send({ error: "project tidak ditemukan" });
    }
  });
}
