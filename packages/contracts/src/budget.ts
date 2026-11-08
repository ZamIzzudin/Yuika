// budget & admission control per workspace.
// Prinsip (, gas-station pattern): saldo = angka JUJUR dari ledger
// metering × price book user-set (tanpa estimasi); HOLD hanya perkiraan kasar
// untuk pre-auth (di-settle saat turn selesai, actual usage sudah tercatat
// di ledger sendiri). Model tanpa harga = biaya tidak dihitung → coverage
// "partial" = angka adalah BATAS BAWAH (tidak bohong jadi 0).
// Rate limit (CRED-3): turn/menit sliding-window + cap delegation concurrency.
import { z } from "zod";

/** Konfigurasi budget & limit workspace, file `data/budget.json`. */
export const BudgetConfig = z.object({
  /** "warn" = melewati limit tetap jalan (badge di UI); "block" = turn ditolak. */
  mode: z.enum(["warn", "block"]).default("warn"),
  /** Batas belanja per hari (unit = mata uang price book dominan). null = tanpa batas. */
  dailyLimit: z.number().positive().nullable().default(null),
  /** Batas belanja total sepanjang masa. null = tanpa batas. */
  totalLimit: z.number().positive().nullable().default(null),
  /** CRED-3: maks turn per menit per workspace (sliding window). null = tanpa batas. */
  maxTurnsPerMinute: z.number().int().positive().nullable().default(null),
  /** CRED-3: maks delegasi anak berjalan paralel. null = default (2). */
  maxDelegationConcurrency: z.number().int().positive().nullable().default(null),
  updatedAt: z.number().int().nonnegative().default(0),
});
export type BudgetConfig = z.infer<typeof BudgetConfig>;

export const UpdateBudgetRequest = BudgetConfig.partial().omit({ updatedAt: true });
export type UpdateBudgetRequest = z.infer<typeof UpdateBudgetRequest>;

/** Snapshot saldo untuk UI (CRED-4), semua angka dari ledger × price book. */
export const BudgetStatus = z.object({
  config: BudgetConfig,
  /** Belanja sejak tengah malam lokal (porsi model terhargai saja). */
  spentToday: z.number().nonnegative(),
  /** Belanja total sepanjang masa. */
  spentTotal: z.number().nonnegative(),
  /** Burn-rate: belanja 24 jam terakhir ÷ 24. */
  burnRatePerHour: z.number().nonnegative(),
  /** Total HOLD aktif (turn berjalan, pre-auth). */
  activeHolds: z.number().nonnegative(),
  /** "full" = semua model terpakai dihargai; "partial" = ada yang tak dihargai
   *  (angka = batas bawah); "none" = tak ada model terhargai (angka tak bermakna). */
  coverage: z.enum(["full", "partial", "none"]),
  /** Mata uang angka belanja (dari model terpakai termahal-belanjanya). */
  currency: z.enum(["USD", "IDR"]).nullable(),
  dailyLimitHit: z.boolean(),
  totalLimitHit: z.boolean(),
});
export type BudgetStatus = z.infer<typeof BudgetStatus>;

/** CRED-4: attribution biaya matrix persona × model (cost via price book). */
export const UsageMatrixRow = z.object({
  personaId: z.string().min(1),
  model: z.string().min(1),
  calls: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  /** Estimasi biaya baris, null bila model tak dihargai (jujur, bukan 0). */
  cost: z.number().nullable(),
  currency: z.enum(["USD", "IDR"]).nullable(),
});
export type UsageMatrixRow = z.infer<typeof UsageMatrixRow>;
