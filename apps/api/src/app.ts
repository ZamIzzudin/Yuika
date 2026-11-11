// @yuika/api, Fastify app factory : semua REST/SSE yang dulu Next
// route handlers di apps/web/src/app/api/**. Path DIPERTAHANKAN persis
// (prefix /api/…) sehingga frontend hanya ganti base URL (lib/api.ts).
// buildApp(rt?), runtime bisa di-inject (test); default: singleton proses api.
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import type { YuiRuntime } from "@yuika/core";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerDelegationRoutes } from "./routes/delegations.js";
import { registerApprovalRoutes } from "./routes/approvals.js";
import { registerVaultRoutes } from "./routes/vault.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerDungeonRoutes } from "./routes/dungeons.js";
import { registerMcpRoutes } from "./routes/mcp.js";
import { registerMemoryRoutes } from "./routes/memory.js";
import { registerPersonaRoutes } from "./routes/personas.js";
import { registerDesignRoutes } from "./routes/design.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerSkillRoutes } from "./routes/skills.js";
import { registerUsageRoutes } from "./routes/usage.js";
import { registerPortalRoutes } from "./routes/portal.js";
import { registerWorkflowRoutes } from "./routes/workflows.js";
import { registerWorkshopRoutes } from "./routes/workshop.js";
import { registerBrowserRoutes } from "./routes/browser.js";
import { registerActivityRoutes } from "./routes/activity.js";
import { registerLoginRoutes } from "./routes/login.js";
import { registerTerminalRoutes } from "./routes/terminal.js";
import { registerScreenRoutes } from "./routes/screen.js";
import { getRuntime } from "./runtime.js";
import { registerAuthRoutes, bearerToken } from "./routes/auth.js";
import { registerAuthSsoRoutes } from "./routes/auth-sso.js"; // portal SSO
import { registerMetaRoutes } from "./routes/meta.js"; // version + update check
import { authUserCount, validateToken } from "./auth/store.js";
import type { SettingsDeps } from "./routes/settings.js";

export function buildApp(rt?: YuiRuntime, opts?: { settingsDeps?: SettingsDeps }): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 12 * 1024 * 1024 });
  // Default reflects the request origin (dev: web :3000 -> api :3211).
  // Split-origin deployments can pin allowed origins with YUI_CORS_ORIGIN
  // (comma separated, e.g. https://studio.example.com). Behind one reverse
  // proxy (same-origin) the browser never evaluates CORS at all.
  const corsOrigin: string[] | true = process.env.YUI_CORS_ORIGIN
    ? process.env.YUI_CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean)
    : true;
  void app.register(cors, { origin: corsOrigin });

  // Upload raw (pdf/xlsx/…): parser catch-all buffer, JSON tetap via parser
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

 // gerbang tenant. Selama belum ada user terdaftar → mode lokal
  // (API terbuka, backward-compatible self-hosted). Setelah user pertama:
  // semua route non-/api/auth/* wajib Bearer token (header, atau ?auth_token=
  // untuk EventSource SSE yang tak bisa set header).
  // YUI_AUTH_REQUIRED=1 (the prod compose default) closes open mode from
  // the first boot: a public instance never has an open window waiting for
  // the first user; portal sign-in still works (/api/auth/* is exempt).
  app.addHook("preHandler", async (req, reply) => {
    const url = req.raw.url ?? "";
    if (url.startsWith("/api/auth") || url.startsWith("/api/meta")) return;
    if (authUserCount() === 0 && process.env.YUI_AUTH_REQUIRED !== "1") return;
    const token = bearerToken(req.headers.authorization, (req.query as Record<string, unknown>)?.auth_token);
    const user = token ? validateToken(token) : null;
    if (!user) return reply.code(401).send({ error: "authentication required" });
    (req as FastifyRequest & { authUser: { id: string; email: string } }).authUser = user;
  });

  registerAuthRoutes(app);
  registerAuthSsoRoutes(app, getRt); // portal sign-in (start + complete)
  registerMetaRoutes(app); // /api/meta (version + update indicator)
  registerSessionRoutes(app, getRt);
  registerDelegationRoutes(app, getRt);
  registerApprovalRoutes(app, getRt);
  registerVaultRoutes(app, getRt); // metadata-only + fill
  registerProjectRoutes(app, getRt);
  registerDungeonRoutes(app, getRt);
  registerMcpRoutes(app, getRt);
  registerMemoryRoutes(app, getRt);
  registerPersonaRoutes(app, getRt);
  registerDesignRoutes(app, getRt); // P2-DSN-3: tab Design (embed viewer)
  registerSettingsRoutes(app, getRt, opts?.settingsDeps);
  registerSkillRoutes(app, getRt);
  registerUsageRoutes(app, getRt);
  registerTerminalRoutes(app, getRt); // : tab Terminal
  registerScreenRoutes(app, getRt); //  (P2-SCR): shared live screen + lease
  registerActivityRoutes(app, getRt); // ++: project-wide activity feed (tab Logs)
  registerLoginRoutes(app, getRt); // : fill_login card resolve
  registerPortalRoutes(app, getRt);
  registerWorkflowRoutes(app, getRt); // P2-FLOW: runs + gate + template
  registerWorkshopRoutes(app, getRt); //  (P2-WKS): workshop persisten
  registerBrowserRoutes(app, getRt); // : tab Browser read-only
  return app;
}
