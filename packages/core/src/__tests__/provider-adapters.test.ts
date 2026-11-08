// P1-INF-2: adapter Anthropic & Gemini, konversi format internal + streaming
// SSE via fetch FAKE (tanpa network). Fokus: mapping pesan/tool, akumulasi
// tool-call stream, usage, finishReason.
import { describe, expect, it, afterEach } from "vitest";
import type { ChatRequest, InternalMessage, ToolCallRequest } from "../provider/adapter.js";
import { AnthropicProvider, toAnthropicMessages } from "../provider/anthropic.js";
import { GeminiProvider, toGeminiRequest } from "../provider/gemini.js";

const origFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = origFetch;
});

/** SSE responder: kirim blok `data: <json>\n\n` berurutan. */
function fakeSse(blocks: object[], status = 200) {
  const body = blocks.map((b) => `data: ${JSON.stringify(b)}\n\n`).join("");
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(body));
      c.close();
    },
  });
  return Promise.resolve(new Response(stream, { status, headers: { "content-type": "text/event-stream" } }));
}

const msgs: InternalMessage[] = [
  { role: "system", content: "kamu Yui" },
  { role: "user", content: "buat file a.txt" },
  { role: "assistant", content: "oke", toolCalls: [{ id: "c1", name: "write_file", args: { path: "a.txt" } }] },
  { role: "tool", content: '{"ok":true}', toolCallId: "c1" },
];

const req = (over: Partial<ChatRequest> = {}): ChatRequest => ({
  model: "test-model",
  messages: msgs,
  tools: [{ name: "write_file", description: "tulis file", parameters: { type: "object" } }],
  ...over,
});

describe("Anthropic adapter", () => {
  it("konversi pesan: system terpisah; tool_use + tool_result di role benar", () => {
    const { system, contents } = toAnthropicMessages(msgs);
    expect(system).toBe("kamu Yui");
    expect(contents).toEqual([
      { role: "user", content: [{ type: "text", text: "buat file a.txt" }] },
      { role: "assistant", content: [{ type: "text", text: "oke" }, { type: "tool_use", id: "c1", name: "write_file", input: { path: "a.txt" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "c1", content: '{"ok":true}' }] },
    ]);
  });

  it("stream: text + tool_use terakumulasi (input_json_delta), usage & stop_reason terpetakan", async () => {
    globalThis.fetch = (async () =>
      fakeSse([
        { type: "message_start", message: { usage: { input_tokens: 11 } } },
        { type: "content_block_start", content_block: { type: "tool_use", id: "tc_1", name: "write_file" } },
        { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: '{"pa' } },
        { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: 'th":"b.txt"}' } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "siap " } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "bang" } },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 7 } },
        { type: "message_stop" },
      ])) as typeof fetch;
    const p = new AnthropicProvider({ baseUrl: "https://api.anthropic.test", apiKey: "k" });
    const deltas: string[] = [];
    const done = await p.chatStream(req(), (c) => c.type === "text_delta" && deltas.push(c.delta));
    expect(deltas.join("")).toBe("siap bang");
    expect(done.finishReason).toBe("tool_calls");
    expect(done.toolCalls).toEqual([{ id: "tc_1", name: "write_file", args: { path: "b.txt" } }]);
    expect(done.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
  });

  it("HTTP error → throw dengan status", async () => {
    globalThis.fetch = (async () => fakeSse([], 401)) as typeof fetch;
    const p = new AnthropicProvider({ baseUrl: "https://x.test", apiKey: "k" });
    await expect(p.chatStream(req(), () => undefined)).rejects.toThrow("Anthropic API 401");
  });
});

describe("Gemini adapter", () => {
  it("konversi pesan: systemInstruction; functionCall (model) + functionResponse (user, id→nama)", () => {
    const { systemInstruction, contents } = toGeminiRequest(msgs);
    expect(systemInstruction).toBe("kamu Yui");
    expect(contents).toEqual([
      { role: "user", parts: [{ text: "buat file a.txt" }] },
      { role: "model", parts: [{ text: "oke" }, { functionCall: { name: "write_file", args: { path: "a.txt" } } }] },
      { role: "user", parts: [{ functionResponse: { name: "write_file", response: { ok: true } } }] },
    ]);
  });

  it("stream: text + functionCall utuh; finishReason → tool_calls; usageMetadata", async () => {
    globalThis.fetch = (async () =>
      fakeSse([
        { candidates: [{ content: { parts: [{ text: "membuat" }], role: "model" } }] },
        { candidates: [{ content: { parts: [{ functionCall: { name: "write_file", args: { path: "c.txt" } } }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 21, candidatesTokenCount: 9 } },
      ])) as typeof fetch;
    const p = new GeminiProvider({ baseUrl: "https://gem.test", apiKey: "k" });
    const done = await p.chatStream(req(), () => undefined);
    expect(done.text).toBe("membuat");
    expect(done.finishReason).toBe("tool_calls"); // functionCall hadir → tool loop lanjut
    expect(done.toolCalls[0]!.name).toBe("write_file");
    expect(done.toolCalls[0]!.args).toEqual({ path: "c.txt" });
    expect(done.usage).toEqual({ inputTokens: 21, outputTokens: 9 });
  });

  it("tool result non-JSON dibungkus { result } (Gemini butuh object)", () => {
    const m: InternalMessage[] = [
      { role: "assistant", toolCalls: [{ id: "c9", name: "run_cmd", args: {} }], content: "" },
      { role: "tool", content: "plain text output", toolCallId: "c9" },
    ];
    const { contents } = toGeminiRequest(m);
    expect(contents[1]).toEqual({ role: "user", parts: [{ functionResponse: { name: "run_cmd", response: { result: "plain text output" } } }] });
  });
});
