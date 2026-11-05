// @yui/api — singleton YuiRuntime (P0-INF-1).
// Diadaptasi dari apps/web/src/lib/runtime.ts (perang HMR terbukti di sana):
// di proses api TIDAK ada HMR Next, tapi `tsx watch` me-reload modul saat edit —
// cache globalThis + tag pemilik (hash source createYuiRuntime) tetap dipakai
// agar reload tidak membuang runtime (server MCP reconnect menumpuk).
// Import env-boot PERTAMA — sebelum @yui/core mengevaluasi env.ts (fail-fast).
import "./env-boot.js";
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
