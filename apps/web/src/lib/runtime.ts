// Singleton runtime — aman terhadap HMR Next.js (cache di globalThis).
// QUIRK (dipelajari dev-10): runtime lama dibuat oleh kode SEBELUM update core;
// route baru yang memanggil method baru → "not a function" walau disk sudah
// benar. Solusi: tag PEMILIK singleton per module-instance — module di-reload
// oleh HMR (kode baru) → tag beda → runtime dibuat ulang. Di produksi (next
// start, tanpa HMR) tag stabil → singleton benar-benar tunggal.
import { createYuiRuntime, type YuiRuntime } from "@yui/core";

const g = globalThis as unknown as { __yuiRuntime?: YuiRuntime; __yuiRuntimeOwner?: string };
const OWNER = `rt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function getRuntime(): YuiRuntime {
  if (g.__yuiRuntimeOwner !== OWNER || !g.__yuiRuntime) {
    const baseUrl = process.env.YUI_OPENAI_BASE_URL;
    const apiKey = process.env.YUI_OPENAI_API_KEY;
    const model = process.env.YUI_MODEL;
    if (!baseUrl || !apiKey || !model) {
      throw new Error("Env belum lengkap: YUI_OPENAI_BASE_URL / YUI_OPENAI_API_KEY / YUI_MODEL (lihat .env.example)");
    }
    g.__yuiRuntime = createYuiRuntime({ provider: { baseUrl, apiKey, model } });
    g.__yuiRuntimeOwner = OWNER;
  }
  return g.__yuiRuntime;
}
