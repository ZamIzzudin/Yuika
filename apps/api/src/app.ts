// @yuika/api — Fastify app factory (P0-INF-1): semua REST/SSE yang dulu Next
// route handlers di apps/web/src/app/api/**. Path DIPERTAHANKAN persis
// (prefix /api/…) sehingga frontend hanya ganti base URL (lib/api.ts).
// buildApp(rt?) — runtime bisa di-inject (test); default: singleton proses api.
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import type { YuiRuntime } from "@yuika/core";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerDelegationRoutes } from "./routes/delegations.js";
import { registerApprovalRoutes } from "./routes/approvals.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerDungeonRoutes } from "./routes/dungeons.js";
import { registerMcpRoutes } from "./routes/mcp.js";
import { registerMemoryRoutes } from "./routes/memory.js";
import { registerPersonaRoutes } from "./routes/personas.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerSkillRoutes } from "./routes/skills.js";
import { registerUsageRoutes } from "./routes/usage.js";
import { registerPortalRoutes } from "./routes/portal.js";
import { registerTerminalRoutes } from "./routes/terminal.js";
import { getRuntime } from "./runtime.js";
import { registerAuthRoutes, bearerToken } from "./routes/auth.js";
import { authUserCount, validateToken } from "./auth/store.js";

export function buildApp(rt?: YuiRuntime): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 12 * 1024 * 1024 });
  void app.register(cors, { origin: true }); // local app: reflect origin (web:3000 ↔ api:3211)

  // Upload raw (pdf/xlsx/…): parser catch-all buffer — JSON tetap via parser
  // bawaan; tipe tanpa parser terdaftar jatuh ke sini sebagai Buffer.
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

  // Error handler: zod invalid → 400 {error} (frontend membaca field ini);
  // fastify statusCode (415 dsb.) dipertahankan; lainnya → 500 tanpa bocor stack.
  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: err.issues.map((i) => i.message).join("; ") });
    }
    const e = err as { statusCode?: unknown; message?: unknown };
    const status = typeof e.statusCode === "number" && e.statusCode >= 400 ? e.statusCode : 500;
    if (status >= 500) console.error("[yui:api]", err);
    return reply.code(status).send({ error: err instanceof Error ? err.message : String(err) });
  });

  const getRt = (): YuiRuntime => rt ?? getRuntime();

  // P1-INF-1: gerbang tenant. Selama belum ada user terdaftar → mode lokal
  // (API terbuka, backward-compatible self-hosted). Setelah user pertama:
  // semua route non-/api/auth/* wajib Bearer token (header, atau ?auth_token=
  // untuk EventSource SSE yang tak bisa set header).
  app.addHook("preHandler", async (req, reply) => {
    const url = req.raw.url ?? "";
    if (url.startsWith("/api/auth")) return;
    if (authUserCount() === 0) return;
    const token = bearerToken(req.headers.authorization, (req.query as Record<string, unknown>)?.auth_token);
    const user = token ? validateToken(token) : null;
    if (!user) return reply.code(401).send({ error: "authentication required" });
    (req as FastifyRequest & { authUser: { id: string; email: string } }).authUser = user;
  });

  registerAuthRoutes(app);
  registerSessionRoutes(app, getRt);
  registerDelegationRoutes(app, getRt);
  registerApprovalRoutes(app, getRt);
  registerProjectRoutes(app, getRt);
  registerDungeonRoutes(app, getRt);
  registerMcpRoutes(app, getRt);
  registerMemoryRoutes(app, getRt);
  registerPersonaRoutes(app, getRt);
  registerSettingsRoutes(app, getRt);
  registerSkillRoutes(app, getRt);
  registerUsageRoutes(app, getRt);
  registerTerminalRoutes(app, getRt); // P2-STU-2: tab Terminal
  registerPortalRoutes(app, getRt);
  return app;
}
