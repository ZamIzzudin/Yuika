// @yuika/contracts — Vault kredensial (Batch 12 / D27).
// INVARIAN: nilai rahasia TIDAK PERNAH muncul di kontrak ini — hanya metadata.
// Kartu protected mengisi nilai via POST /api/vault/fill/:id (body VaultFillSubmit);
// event hanya membawa `hasValue`. Jalur balik nilai ke model TIDAK ADA.
import { z } from "zod";

/** Kind rahasia v0 (D27): api_key = utk secret_http (bearer/header);
 *  command = utk env export run_command; login = fill_login (VLT-4 blok C —
 *  value = JSON {user,pass}, dipakai CDP fill ke live browser, tak pernah
 *  kembali ke konteks model). */
export const VAULT_KINDS = ["api_key", "command", "login"] as const;
export const VaultKind = z.enum(VAULT_KINDS);
export type VaultKind = z.infer<typeof VaultKind>;

/** Scope penyimpanan (D27: sharing lintas persona). v0: workspace = semua
 *  persona; persona = hanya persona pemilik; project = semua persona di
 *  project itu. Grant eksplisit lintas-scope = menyusul bersama fill_login. */
export const VAULT_SCOPES = ["workspace", "project", "persona"] as const;
export const VaultScope = z.enum(VAULT_SCOPES);
export type VaultScope = z.infer<typeof VaultScope>;

/** Metadata rahasia — respons list API & tool vault_list. TANPA nilai. */
export const VaultSecretMeta = z.object({
  id: z.string(),
  name: z.string(),
  kind: VaultKind,
  scope: VaultScope,
  projectId: z.string().nullable(),
  personaId: z.string().nullable(),
  /** true = run-only ("Save to Vault" OFF) — dihapus saat run berakhir. */
  runOnly: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastUsedAt: z.number().nullable(),
});
export type VaultSecretMeta = z.infer<typeof VaultSecretMeta>;

export const VaultListResponse = z.object({ secrets: z.array(VaultSecretMeta) });
export type VaultListResponse = z.infer<typeof VaultListResponse>;

/** Body POST /api/vault/fill/:id — satu-satunya tempat nilai lewat jaringan
 *  (HTTPS lokal / localhost); TIDAK pernah di-log & TIDAK pernah di-event. */
export const VaultFillSubmit = z.object({
  value: z.string().min(1).max(8192),
  save: z.boolean().default(true),
});
export type VaultFillSubmit = z.infer<typeof VaultFillSubmit>;

/** Respons fill — metadata saja (nilai tak pernah dikembalikan). */
export const VaultFillResponse = z.object({ ok: z.literal(true), name: z.string() });
