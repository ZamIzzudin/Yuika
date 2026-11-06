// @yuika/contracts — P1-INF-1: auth (email+password; magic link menyusul
// bersama infra email). Skema dipakai apps/api routes & web AuthGate.
import { z } from "zod";

/** Register & login memakai bentuk yang sama (email + password). */
export const AuthCredentials = z.object({
  email: z.string().email("valid email required").max(200),
  password: z.string().min(8, "password min 8 characters").max(200),
});
export const AuthRegisterRequest = AuthCredentials;
export const AuthLoginRequest = AuthCredentials;

/** User publik (tanpa hash). */
export const AuthUser = z.object({ id: z.string(), email: z.string() });

/** Respons register/login: bearer token + user. */
export const AuthSession = z.object({ token: z.string(), user: AuthUser });

/** Status untuk AuthGate: null user = belum/tidak login. */
export const AuthStatus = z.object({
  user: AuthUser.nullable(),
  /** true bila server sudah punya user terdaftar (semua route butuh token). */
  authRequired: z.boolean(),
});

export type AuthCredentialsT = z.infer<typeof AuthCredentials>;
export type AuthUserT = z.infer<typeof AuthUser>;
export type AuthSessionT = z.infer<typeof AuthSession>;
export type AuthStatusT = z.infer<typeof AuthStatus>;

// ── CP-3 — SSO login via portal (OAuth2-style + PKCE) ───────────────────────
// Portal = satu-satunya identity provider; Yuika mint sesinya SENDIRI.
// Alur: start → redirect portal /authorize → Accept → callback ?code&state
// → complete (tukar code+verifier di portal /api/oauth/token) → sesi Yuika.

/** Mulai SSO: browser minta URL authorize (redirect_uri = origin web app). */
export const PortalSsoStartRequest = z.object({
  redirectUri: z.string().url().max(500),
});

export const PortalSsoStartResponse = z.object({
  /** URL lengkap portal /authorize (browser diarahkan ke sini). */
  authorizeUrl: z.string().url(),
});

/** Selesaikan SSO dari halaman callback (?code&state di URL). */
export const PortalSsoCompleteRequest = z.object({
  code: z.string().min(8).max(256),
  state: z.string().min(8).max(256),
});

/** Sukses = sesi Yuika (bentuk sama dengan login lokal). */
export const PortalSsoCompleteResponse = AuthSession;

export type PortalSsoStartRequestT = z.infer<typeof PortalSsoStartRequest>;
export type PortalSsoStartResponseT = z.infer<typeof PortalSsoStartResponse>;
export type PortalSsoCompleteRequestT = z.infer<typeof PortalSsoCompleteRequest>;
export type PortalSsoCompleteResponseT = z.infer<typeof PortalSsoCompleteResponse>;
