// @yuika/api — P1-INF-1: REST /api/auth/* (register, login, logout, me).
// Route-route ini di-whitelist middleware auth (lihat app.ts).
import type { FastifyInstance } from "fastify";
import {
  AuthLoginRequest,
  AuthRegisterRequest,
  AuthStatus,
} from "@yuika/contracts";
import {
  AuthError,
  authUserCount,
  createSession,
  createUser,
  deleteSession,
  validateToken,
  verifyUser,
} from "../auth/store.js";

/** Bearer token dari header Authorization (atau ?auth_token= utk SSE). */
export function bearerToken(header: string | undefined, queryToken: unknown): string | null {
  const h = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (h) return h;
  return typeof queryToken === "string" && queryToken.length > 0 ? queryToken : null;
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post("/api/auth/register", async (req, reply) => {
    const body = AuthRegisterRequest.parse(req.body);
    try {
      const user = createUser(body.email, body.password);
      return reply.code(201).send({ token: createSession(user.id), user });
    } catch (e) {
      if (e instanceof AuthError) return reply.code(409).send({ error: e.message });
      throw e;
    }
  });

  app.post("/api/auth/login", async (req, reply) => {
    const body = AuthLoginRequest.parse(req.body);
    const user = verifyUser(body.email, body.password);
    if (!user) return reply.code(401).send({ error: "invalid email or password" });
    return reply.send({ token: createSession(user.id), user });
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = bearerToken(req.headers.authorization, (req.query as Record<string, unknown>)?.auth_token);
    if (token) deleteSession(token);
    return reply.send({ ok: true });
  });

  // Selalu 200: AuthGate membaca {user, authRequired} untuk memutuskan UI.
  app.get("/api/auth/me", async (req) => {
    const token = bearerToken(req.headers.authorization, (req.query as Record<string, unknown>)?.auth_token);
    const user = token ? validateToken(token) : null;
    return AuthStatus.parse({ user, authRequired: authUserCount() > 0 });
  });
}
