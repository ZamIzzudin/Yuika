// @yuika/contracts, credential vault.
// INVARIANT: secret VALUES never appear here, only metadata.
// Protected cards are filled via POST /api/vault/fill/:id (VaultFillSubmit);
// events only carry `hasValue`. There is no path back to the model.
import { z } from "zod";

/** Secret kinds: api_key = for secret_http (bearer/header);
 *  command = for env-exported run_command; login = fill_login
 *  (value = JSON {user,pass}, filled into the live browser via CDP,
 *  never returned to the model context). */
export const VAULT_KINDS = ["api_key", "command", "login"] as const;
export const VaultKind = z.enum(VAULT_KINDS);
export type VaultKind = z.infer<typeof VaultKind>;

/** Storage scope. workspace = every persona; persona = only the owner;
 *  project = every persona in that project. Explicit cross-scope grants
 *  will arrive together with fill_login. */
export const VAULT_SCOPES = ["workspace", "project", "persona"] as const;
export const VaultScope = z.enum(VAULT_SCOPES);
export type VaultScope = z.infer<typeof VaultScope>;

/** Metadata rahasia, respons list API & tool vault_list. TANPA nilai. */
export const VaultSecretMeta = z.object({
  id: z.string(),
  name: z.string(),
  kind: VaultKind,
  scope: VaultScope,
  projectId: z.string().nullable(),
  personaId: z.string().nullable(),
  /** true = run-only ("Save to Vault" OFF), dihapus saat run berakhir. */
  runOnly: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastUsedAt: z.number().nullable(),
});
export type VaultSecretMeta = z.infer<typeof VaultSecretMeta>;

export const VaultListResponse = z.object({ secrets: z.array(VaultSecretMeta) });
export type VaultListResponse = z.infer<typeof VaultListResponse>;

/** Body POST /api/vault/fill/:id, satu-satunya tempat nilai lewat jaringan
 *  (HTTPS lokal / localhost); TIDAK pernah di-log & TIDAK pernah di-event. */
export const VaultFillSubmit = z.object({
  value: z.string().min(1).max(8192),
  save: z.boolean().default(true),
});
export type VaultFillSubmit = z.infer<typeof VaultFillSubmit>;

/** Respons fill, metadata saja (nilai tak pernah dikembalikan). */
export const VaultFillResponse = z.object({ ok: z.literal(true), name: z.string() });
