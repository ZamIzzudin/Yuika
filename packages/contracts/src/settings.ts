// @yui/contracts — Settings (UI Pengaturan): provider & model (swap panas),
// fondasi seksi setelan lain (API key, fallback model, dst).
import { z } from "zod";

/** GET /api/settings/provider — config aktif (key TIDAK pernah dikirim penuh). */
export const ProviderSettings = z.object({
  baseUrl: z.string(),
  model: z.string(),
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
