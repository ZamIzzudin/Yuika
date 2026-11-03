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
