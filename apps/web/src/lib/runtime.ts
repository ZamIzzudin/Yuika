// Singleton runtime — aman terhadap HMR Next.js (cache di globalThis).
import { createYuiRuntime, type YuiRuntime } from "@yui/core";

const g = globalThis as unknown as { __yuiRuntime?: YuiRuntime };

export function getRuntime(): YuiRuntime {
  if (!g.__yuiRuntime) {
    const baseUrl = process.env.YUI_OPENAI_BASE_URL;
    const apiKey = process.env.YUI_OPENAI_API_KEY;
    const model = process.env.YUI_MODEL;
    if (!baseUrl || !apiKey || !model) {
      throw new Error("Env belum lengkap: YUI_OPENAI_BASE_URL / YUI_OPENAI_API_KEY / YUI_MODEL (lihat .env.example)");
    }
    g.__yuiRuntime = createYuiRuntime({ provider: { baseUrl, apiKey, model } });
  }
  return g.__yuiRuntime;
}
