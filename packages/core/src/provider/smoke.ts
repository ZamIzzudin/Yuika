// @yuika/core, model smoke test (P1-MDL-2): verifikasi kecil per model sebelum
// dipercaya router. Tes = tool-call 2 langkah minimal: model HARUS memanggil
// tool `ping_check`. Quirk schema GLM (draft 2020-12 vs openapi) dinetralkan
// lewat normalizeToolSchema, pelajaran insiden GLM 1210 (PLAN §12).
import type { ProviderAdapter, ToolSchema } from "./adapter.js";
import { normalizeToolSchema } from "../registry.js";
import type { ModelSmokeResult } from "@yuika/contracts";

/** Tool dummy smoke, schema sengaja minimal & sudah ternormalisasi. */
const PING_TOOL: ToolSchema = {
  name: "ping_check",
  description: "Health check. Panggil tool ini dengan v=1, jangan menjawab dengan teks.",
  parameters: normalizeToolSchema({
    type: "object",
    properties: { v: { type: "number", description: "isi 1" } },
    required: ["v"],
    additionalProperties: false,
  }) as Record<string, unknown>,
};

/** Smoke satu model: ok = model memanggil ping_check (bukan cuma balas teks). */
export async function smokeModel(provider: ProviderAdapter, model: string, timeoutMs = 45_000): Promise<ModelSmokeResult> {
  const started = Date.now();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    // race ganda: provider sungguhan menolak saat abort, tapi jangan bergantung
    // padanya saja, timer ini menjamin smoke SELALU selesai (hang = gagal rapi).
    const timeoutP = new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout ${timeoutMs}ms`)), timeoutMs));
    const done = await Promise.race([
      provider.chatStream(
        {
          model,
          messages: [
            { role: "system", content: "Health check. Ikuti instruksi persis." },
            { role: "user", content: 'Panggil tool ping_check dengan {"v":1}. Jangan menulis teks lain.' },
          ],
          tools: [PING_TOOL],
          signal: ac.signal,
        },
        () => undefined, // chunk teks diabaikan, yang dinilai tool-call
      ),
      timeoutP,
    ]);
    const called = done.toolCalls.some((c) => c.name === "ping_check");
    if (!called) {
      return {
        model,
        ok: false,
        latencyMs: Date.now() - started,
        error: `model tidak memanggil ping_check (jawab teks: "${done.text.slice(0, 60)}…")`,
      };
    }
    return { model, ok: true, latencyMs: Date.now() - started, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { model, ok: false, latencyMs: Date.now() - started, error: msg.includes("abort") ? `timeout ${timeoutMs}ms` : msg.slice(0, 200) };
  } finally {
    clearTimeout(t);
  }
}
