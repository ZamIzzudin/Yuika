// @yuika/api, portal SSO login (OAuth2-style + PKCE S256).
// The portal is the only identity provider (signup happens there); Yuika
// issues its own sessions (the portal never learns the Yuika secret).
//
// POST /api/auth/portal/start    {redirectUri} → {authorizeUrl}
//   attempt (state+verifier+challenge) disimpan in-memory 5 menit; state
//   MENGANDUNG attemptId ("aid.state") sehingga callback lintas-origin
//   tidak butuh cookie (hindari isu credentials lintas port di dev).
// POST /api/auth/portal/complete {code, state} → {token, user}
//   tukar code+verifier ke portal /api/oauth/token → find-or-create user
//   lokal by portalAccountId → sesi Yuika biasa.
//
// Kedua route di bawah /api/auth/* → otomatis lolos middleware auth.
import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  PortalSsoCompleteRequest,
  PortalSsoStartRequest,
} from "@yuika/contracts";
import { createSession, findOrCreatePortalUser, PortalLinkConflictError } from "../auth/store.js";
import { getWebDevice, saveWebDevice } from "../portal/store.js";
import { getWebPresence } from "../portal/web-presence.js";
import { claimAtPortal } from "./portal.js";
import { generateDeviceKeys } from "@yuika/crypto";
import { defaultRelayUrl } from "../portal/service.js";

const ATTEMPT_TTL_MS = 5 * 60 * 1000;
const CLIENT_ID = "yuika-web";

interface SsoAttempt {
  state: string;
  verifier: string;
  redirectUri: string;
  portalUrl: string;
  expiresAt: number;
}

/** attemptId → attempt (in-memory; proses restart = login ulang, aman). */
const attempts = new Map<string, SsoAttempt>();

function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function portalBase(): string {
  return (process.env.YUI_PORTAL_URL || "http://localhost:3100").replace(/\/$/, "");
}

function sweep(): void {
  const now = Date.now();
  for (const [k, v] of attempts) if (v.expiresAt < now) attempts.delete(k);
}

export function registerAuthSsoRoutes(app: FastifyInstance): void {
  app.post("/api/auth/portal/start", async (req, reply) => {
    const body = PortalSsoStartRequest.parse(req.body);
    sweep();
    const attemptId = randomBytes(12).toString("base64url");
    const state = `${attemptId}.${randomBytes(16).toString("base64url")}`;
    const verifier = randomBytes(48).toString("base64url"); // 64 char, dalam rentang PKCE
    const portalUrl = portalBase();
    attempts.set(attemptId, {
      state,
      verifier,
      redirectUri: body.redirectUri,
      portalUrl,
      expiresAt: Date.now() + ATTEMPT_TTL_MS,
    });
    const u = new URL("/authorize", portalUrl);
    u.searchParams.set("client", CLIENT_ID);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("redirect_uri", body.redirectUri);
    u.searchParams.set("state", state);
    u.searchParams.set("code_challenge", s256(verifier));
    u.searchParams.set("code_challenge_method", "S256");
    return reply.send({ authorizeUrl: u.toString() });
  });

  app.post("/api/auth/portal/complete", async (req, reply) => {
    const body = PortalSsoCompleteRequest.parse(req.body);
    sweep();
    // state = "attemptId.random" → attempt ditemukan tanpa cookie.
    const attemptId = body.state.split(".")[0];
    const attempt = attemptId ? attempts.get(attemptId) : undefined;
    if (!attemptId || !attempt || attempt.state !== body.state) {
      return reply.code(400).send({ error: "unknown or expired sign-in attempt, restart sign-in" });
    }
    attempts.delete(attemptId); // sekali pakai

    // Tukar code di portal (server-to-server, PKCE verifier ikut dikirim).
    let exchanged: { accountId?: string; email?: string; deviceToken?: string } = {};
    try {
      const res = await fetch(`${attempt.portalUrl}/api/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: body.code,
          code_verifier: attempt.verifier,
          redirect_uri: attempt.redirectUri,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        return reply.code(401).send({ error: err.error ?? `portal rejected code (${res.status})` });
      }
      exchanged = (await res.json()) as { accountId?: string; email?: string };
    } catch (e) {
      return reply.code(502).send({ error: `portal unreachable: ${e instanceof Error ? e.message : String(e)}` });
    }
    if (typeof exchanged.accountId !== "string" || typeof exchanged.email !== "string") {
      return reply.code(502).send({ error: "portal token response missing accountId/email" });
    }

    try {
      const user = findOrCreatePortalUser(exchanged.accountId, exchanged.email);
      // Browser auto-link: the portal includes a one-time deviceToken in
      // the exchange; claim it with a STABLE key (stored locally) so the
      // deviceId is stable. Re-claim on EVERY login: it heals drift when
      // the device was deleted on the portal side (unlink/db reset).
      // A failed claim is NOT a failed login (the old row stays intact).
      if (exchanged.deviceToken) {
        const existing = getWebDevice();
        const sameAccount = existing?.accountId === exchanged.accountId;
        // kunci sama selama akun sama (deviceId stabil); akun beda → kunci baru
        const keys = sameAccount && existing
          ? { signPriv: existing.signPriv, signPub: existing.signPub, dhPriv: existing.dhPriv, dhPub: existing.dhPub }
          : generateDeviceKeys();
        try {
          const { deviceId } = await claimAtPortal(attempt.portalUrl, {
            token: exchanged.deviceToken,
            kind: "web",
            name: "Yuika web (SSO)",
            signPub: keys.signPub,
            dhPub: keys.dhPub,
          });
          saveWebDevice({
            deviceId,
            accountId: exchanged.accountId,
            kind: "web",
            name: "Yuika web (SSO)",
            signPriv: keys.signPriv,
            signPub: keys.signPub,
            dhPriv: keys.dhPriv,
            dhPub: keys.dhPub,
            portalUrl: attempt.portalUrl,
            relayUrl: defaultRelayUrl(),
            linkedAt: Date.now(),
          });
          // Online presence (the device shows online on the portal Devices
          // page; bye 4001 on unlink drops the row and revokes sessions).
          void getWebPresence()
            .start(getWebDevice()!)
            .catch(() => undefined);
          req.log.info({ deviceId }, sameAccount ? "[sso] web device re-linked (idempotent)" : "[sso] web device auto-linked");
        } catch (e) {
          req.log.warn({ err: e instanceof Error ? e.message : String(e) }, "[sso] web device auto-link gagal, login tetap lanjut");
        }
      }
      return reply.send({ token: createSession(user.id), user });
    } catch (e) {
      if (e instanceof PortalLinkConflictError) return reply.code(409).send({ error: e.message });
      throw e;
    }
  });
}
