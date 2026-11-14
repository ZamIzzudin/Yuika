// @yuika/api, singleton YuiRuntime .
// Diadaptasi dari apps/web/src/lib/runtime.ts (perang HMR terbukti di sana):
// di proses api TIDAK ada HMR Next, tapi `tsx watch` me-reload modul saat edit,
// cache globalThis + tag pemilik (hash source createYuiRuntime) tetap dipakai
// agar reload tidak membuang runtime (server MCP reconnect menumpuk).
// Import env-boot PERTAMA, sebelum @yuika/core mengevaluasi env.ts (fail-fast).
import "./env-boot.js";
import { createYuiRuntime, type YuiRuntime } from "@yuika/core";

const g = globalThis as unknown as { __yuiRuntime?: YuiRuntime; __yuiRuntimeOwner?: string };

/** djb2 → base36, hash pendek dari source fungsi (cukup untuk deteksi perubahan). */
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
    // Lazy-config (D49): API BOLEH boot tanpa provider — runtime hidup dengan
    // nilai kosong; turn baru ditolak dengan pesan jelas (guard runTurn)
    // sampai user mengisi provider lewat Settings (swap panas + persist .env).
    g.__yuiRuntime = createYuiRuntime({
      provider: {
        baseUrl: process.env.YUI_OPENAI_BASE_URL ?? "",
        apiKey: process.env.YUI_OPENAI_API_KEY ?? "",
        model: process.env.YUI_MODEL ?? "",
        kind: process.env.YUI_PROVIDER_KIND,
      },
    });
    g.__yuiRuntimeOwner = OWNER;
  }
  return g.__yuiRuntime;
}
