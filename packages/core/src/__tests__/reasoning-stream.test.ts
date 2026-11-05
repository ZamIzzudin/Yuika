// Fix dev-10 (laporan user: "task sederhana 30 menit, UI seperti mati"):
// GLM mengirim pikiran model di `delta.reasoning_content` — adapter LAMA
// membuangnya diam-diam (42k token reasoning per call tak terlihat). Kini
// diteruskan sebagai chunk reasoning_delta → loop emit reasoning.delta →
// UI streaming "💭 Berpikir…". Test: mock fetch SSE OpenAI-compat.
import { describe, expect, it } from "vitest";
import { OpenAICompatProvider } from "../provider/openai-compat.js";
import type { ProviderChunk } from "../provider/adapter.js";

describe("OpenAICompat reasoning_content → reasoning_delta (fix dev-10)", () => {
  it("delta reasoning_content diteruskan sebagai chunk reasoning_delta + tetap ada text_delta", async () => {
    const p = new OpenAICompatProvider({ baseUrl: "http://x.test/v1", apiKey: "k" });
    // Patch klien SDK: Stream OpenAI = async iterable chunk (sudah ter-parse).
    (p as unknown as { client: { chat: { completions: { create: unknown } } } }).client.chat.completions.create = async function* () {
      yield { choices: [{ delta: { reasoning_content: "mempertimbangkan struktur " } }] };
      yield { choices: [{ delta: { reasoning_content: "file…" } }] };
      yield { choices: [{ delta: { content: "Siap, kutulis " } }] };
      yield { choices: [{ delta: { content: "filenya." } }] };
      yield { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 8 } };
    };
    const chunks: ProviderChunk[] = [];
    const done = await p.chatStream({ model: "glm/glm-5", messages: [{ role: "user", content: "tulis" }], tools: [] }, (c) => chunks.push(c));

    const reasoning = chunks.filter((c): c is { type: "reasoning_delta"; delta: string } => c.type === "reasoning_delta").map((c) => c.delta).join("");
    expect(reasoning).toBe("mempertimbangkan struktur file…"); // tak dibuang lagi
    expect(done.text).toBe("Siap, kutulis filenya.");
    expect(done.usage?.outputTokens).toBe(8);
  });
});
