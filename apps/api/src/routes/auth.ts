// @yuika/api, REST /api/auth/* (me, logout; SSO start/complete di
// routes/auth-sso.ts). Local register/login DIHAPUS (portal-only): akun &
// signup hidup di yuika-portal. Route-route ini di-whitelist middleware
// auth (lihat app.ts).
import type { FastifyInstance } from "fastify";
import { AuthStatus } from "@yuika/contracts";
import { authUserCount, deleteSession, validateToken } from "../auth/store.js";
import { portalBase } from "./auth-sso.js";

/** Bearer token dari header Authorization (atau ?auth_token= utk SSE). */
export function bearerToken(header: string | undefined, queryToken: unknown): string | null {
  const h = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (h) return h;
  return typeof queryToken === "string" && queryToken.length > 0 ? queryToken : null;
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post("/api/auth/logout", async (req, reply) => {
    const token = bearerToken(req.headers.authorization, (req.query as Record<string, unknown>)?.auth_token);
    if (token) deleteSession(token);
    return reply.send({ ok: true });
  });

  // Selalu 200: AuthGate membaca {user, authRequired} untuk memutuskan UI.
  app.get("/api/auth/me", async (req) => {
    const token = bearerToken(req.headers.authorization, (req.query as Record<string, unknown>)?.auth_token);
    const user = token ? validateToken(token) : null;
    return AuthStatus.parse({
      user,
      // D50: YUI_AUTH_REQUIRED=1 (default compose prod) menutup mode terbuka
      // sejak boot — UI gate harus tahu itu LEWAT field ini (tanpa menunggu
      // user pertama).
      authRequired: authUserCount() > 0 || process.env.YUI_AUTH_REQUIRED === "1",
      portalUrl: portalBase(),
    });
  });
}
