// Singleton runtime — aman terhadap HMR Next.js (cache di globalThis).
// QUIRK (dipelajari dev-10): runtime lama dibuat oleh kode SEBELUM update core;
// route baru yang memanggil method baru → "not a function" walau disk sudah
// benar. Solusi: tag PEMILIK singleton = HASH SOURCE createYuiRuntime — route
// yang di-compile ulang membawa SALINAN source core yang SAMA → hash sama →
// runtime DIPERTAHANKAN (fix 2026-11: dulu tag per module-instance → tiap route
// API baru di-compile dev = runtime dibuang & dibuat ulang = SEMUA server MCP
// reconnect menumpuk, spam log & beban sistem). Source core berubah (edit
// @yui/core) → hash beda → runtime dibuat ulang sekali, seperti semula.
// Di produksi (next start, tanpa HMR) tag stabil → singleton tunggal.
import { createYuiRuntime, type YuiRuntime } from "@yui/core";

const g = globalThis as unknown as { __yuiRuntime?: YuiRuntime; __yuiRuntimeOwner?: string };

/** djb2 → base36 — hash pendek dari source fungsi (cukup untuk deteksi perubahan). */
function sourceTag(fn: (...args: never[]) => unknown): string {
  const s = String(fn);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + "-" + s.length.toString(36);
}
const OWNER = sourceTag(createYuiRuntime);

export function getRuntime(): YuiRuntime {
  if (g.__yuiRuntimeOwner !== OWNER || !g.__yuiRuntime) {
    // Runtime lama (module instance sebelumnya) dimatikan TOTAL — tanpa ini,
    // proses MCP stdio lama jadi zombie & menumpuk tiap recompile (beban server).
    if (g.__yuiRuntime) {
      void g.__yuiRuntime.dispose?.().catch((e: unknown) =>
        console.warn("[yui] dispose runtime lama gagal:", e instanceof Error ? e.message : e)
      );
    }
    const baseUrl = process.env.YUI_OPENAI_BASE_URL;
    const apiKey = process.env.YUI_OPENAI_API_KEY;
    const model = process.env.YUI_MODEL;
    if (!baseUrl || !apiKey || !model) {
      throw new Error("Env belum lengkap: YUI_OPENAI_BASE_URL / YUI_OPENAI_API_KEY / YUI_MODEL (lihat .env.example)");
    }
    g.__yuiRuntime = createYuiRuntime({ provider: { baseUrl, apiKey, model, kind: process.env.YUI_PROVIDER_KIND } });
    g.__yuiRuntimeOwner = OWNER;
  }
  return g.__yuiRuntime;
}
