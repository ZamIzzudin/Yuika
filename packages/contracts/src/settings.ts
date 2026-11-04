// @yui/contracts — Settings (UI Pengaturan): provider & model (swap panas),
// fondasi seksi setelan lain (API key, fallback model, dst).
import { z } from "zod";

/** GET /api/settings/provider — config aktif (key TIDAK pernah dikirim penuh). */
export const ProviderSettings = z.object({
  baseUrl: z.string(),
  model: z.string(),
  fallbackModel: z.string().default(""),
  hasApiKey: z.boolean(),
  keyPreview: z.string(),
});
export type ProviderSettings = z.infer<typeof ProviderSettings>;

/** PUT /api/settings/provider — field kosong/undefined = tidak diubah. */
export const UpdateProviderSettingsRequest = z.object({
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(8).optional(),
  model: z.string().min(1).optional(),
  /** String kosong = hapus fallback. */
  fallbackModel: z.string().nullable().optional(),
});
export type UpdateProviderSettingsRequest = z.infer<typeof UpdateProviderSettingsRequest>;

/** P1-MDL: override model per persona (UI Settings) — sumber router model. */
export const ModelOverrideEntry = z.object({
  model: z.string().optional(),
  fallback: z.string().optional(),
});
export type ModelOverrideEntry = z.infer<typeof ModelOverrideEntry>;

/** GET /api/settings/models — default + override per persona + daftar persona. */
export const ModelRoutes = z.object({
  defaultModel: z.string(),
  defaultFallback: z.string(),
  overrides: z.record(z.string(), ModelOverrideEntry),
  personas: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type ModelRoutes = z.infer<typeof ModelRoutes>;

/** PUT /api/settings/models — {personaId, model?, fallback?} (string kosong = hapus). */
export const UpdateModelRouteRequest = z.object({
  personaId: z.string().min(1),
  model: z.string().optional(),
  fallback: z.string().optional(),
});
export type UpdateModelRouteRequest = z.infer<typeof UpdateModelRouteRequest>;

/** P1-MDL-3: harga per model — dasar indikator biaya dari metering (P1-CRED-1).
 *  perMillion = harga per 1.000.000 token; 0/absen = biaya tak dihitung (jujur). */
export const ModelPrice = z.object({
  inputPerMillion: z.number().nonnegative().default(0),
  outputPerMillion: z.number().nonnegative().default(0),
  currency: z.enum(["USD", "IDR"]).default("USD"),
});
export type ModelPrice = z.infer<typeof ModelPrice>;
/** key = nama model persis (mis. "glm/glm-5.1"). */
export const PriceBook = z.record(z.string(), ModelPrice);
export type PriceBook = z.infer<typeof PriceBook>;

/** PUT /api/settings/models/prices — upsert satu model (string kosong tak mungkin; hapus via nol). */
export const UpdateModelPriceRequest = z.object({
  model: z.string().min(1),
  price: ModelPrice,
});
export type UpdateModelPriceRequest = z.infer<typeof UpdateModelPriceRequest>;

/** P1-MDL-2: hasil smoke test satu model (tool-call 2 langkah minimal). */
export const ModelSmokeResult = z.object({
  model: z.string(),
  ok: z.boolean(),
  latencyMs: z.number().int(),
  error: z.string().nullable().default(null),
});
export type ModelSmokeResult = z.infer<typeof ModelSmokeResult>;

/** GET/POST /api/settings/provider/smoke — status terakhir / jalankan ulang. */
export const ModelSmokeResponse = z.object({
  running: z.boolean(),
  results: z.array(ModelSmokeResult),
});
export type ModelSmokeResponse = z.infer<typeof ModelSmokeResponse>;
