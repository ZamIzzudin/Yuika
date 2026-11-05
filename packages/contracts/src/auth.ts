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
