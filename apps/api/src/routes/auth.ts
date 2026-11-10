// @yuika/api, REST /api/auth/* (me, logout; SSO start/complete di
// routes/auth-sso.ts). Local register/login DIHAPUS (portal-only): akun &
// signup hidup di yuika-portal. Route-route ini di-whitelist middleware
// auth (lihat app.ts).
import type { FastifyInstance } from "fastify";
import { AuthStatus } from "@yuika/contracts";
import { authUserCount, deleteSession, validateToken } from "../auth/store.js";
import { getPortalHost } from "../portal/service.js";
import { getHostDevice, getWebDevice } from "../portal/store.js";
import { unlinkSelfAtPortal } from "../portal/self-unlink.js";
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
    // Sign-out = keluar dari portal juga (symmetry dengan unlink portal→
    // bye 4001): stop presence relay + best-effort self-unlink device rows
    // (web SSO + host pairing manual). Gagal portal → tetap sign-out lokal;
    // kunci DIPERTAHANKAN agar login berikutnya re-claim deviceId stabil.
    const web = getWebDevice();
    const host = getHostDevice();
    await Promise.allSettled([
      web ? unlinkSelfAtPortal(web) : Promise.resolve(false),
      host ? unlinkSelfAtPortal(host) : Promise.resolve(false),
    ]);
    await getPortalHost().stop().catch(() => undefined);
    return reply.send({ ok: true });
  });

  // Selalu 200: AuthGate membaca {user, authRequired} untuk memutuskan UI.
  app.get("/api/auth/me", async (req) => {
    const token = bearerToken(req.headers.authorization, (req.query as Record<string, unknown>)?.auth_token);
    const user = token ? validateToken(token) : null;
    return AuthStatus.parse({
      user,
      // YUI_AUTH_REQUIRED=1 (prod compose default) closes open mode from
      // the first boot; the login gate must learn it from THIS field
      // (not by waiting for the first user).
      authRequired: authUserCount() > 0 || process.env.YUI_AUTH_REQUIRED === "1",
      portalUrl: portalBase(),
    });
  });
}
