// @yui/contracts — metering (P1-CRED-1): ledger pemakaian per panggilan LLM.
// Satu UsageEvent = SATU panggilan model sukses (iterasi loop / langkah delegasi
// anak) — rollup per turn/persona/model dihitung dari sini (P1-CRED-4 burn-rate).
// Invariant: angka HANYA dari `usage` yang dilaporkan provider — tidak ada
// estimasi (akurasi <2% vs tagihan provider = P1-CRED-6).

import { z } from "zod";

/** Baris ledger: satu panggilan model sukses (token in/out + latensi). */
export const UsageEvent = z.object({
  sessionId: z.string().min(1),
  /** Project tempat sesi melekat; null = workspace global. */
  projectId: z.string().nullable().default(null),
  personaId: z.string().min(1),
  model: z.string().min(1),
  promptTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  /** Durasi panggilan provider (ms) — bukti latensi per model. */
  latencyMs: z.number().int().nonnegative(),
  at: z.number().int().positive(),
});
export type UsageEvent = z.infer<typeof UsageEvent>;

/** Filter summary (semuanya opsional; kombinasi = AND). */
export const UsageFilter = z.object({
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  personaId: z.string().optional(),
  /** Hanya event `at >= since` (epoch ms) — window burn-rate. */
  since: z.number().int().nonnegative().optional(),
});
export type UsageFilter = z.infer<typeof UsageFilter>;

export const UsageRollup = z.object({
  key: z.string(),
  calls: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
export type UsageRollup = z.infer<typeof UsageRollup>;

export const UsageSummary = z.object({
  calls: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  byPersona: z.array(UsageRollup),
  byModel: z.array(UsageRollup),
  /** Epoch ms event termuda dalam hasil (null = kosong) — dipakai UI "per X jam". */
  windowStart: z.number().nullable(),
});
export type UsageSummary = z.infer<typeof UsageSummary>;
