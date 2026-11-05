// @yuika/core — Google Gemini adapter (P1-INF-2): streamGenerateContent (alt=sse)
// via fetch. Perbedaan besar vs OpenAI: functionCall TANPA id (nama fungsi =
// identitas) & hasil tool dikirim sebagai functionResponse di role user —
// mapping id→nama dibangun saat konversi (urutan pesan internal tetap).
import { randomUUID } from "node:crypto";
import type { ChatRequest, InternalMessage, ProviderAdapter, ProviderChunk, ProviderDone, ToolCallRequest } from "./adapter.js";
import { parseSse } from "./anthropic.js";
import { env } from "../env.js";

export interface GeminiConfig {
  baseUrl: string; // default https://generativelanguage.googleapis.com
  apiKey: string;
  timeoutMs?: number;
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
}

export function toGeminiRequest(messages: InternalMessage[]): { systemInstruction: string | undefined; contents: { role: "user" | "model"; parts: GeminiPart[] }[] } {
  const system: string[] = [];
  const contents: { role: "user" | "model"; parts: GeminiPart[] }[] = [];
  const idToName = new Map<string, string>(); // toolCallId internal → nama fn Gemini
  let pendingResponses: GeminiPart[] = [];
  const flush = () => {
    if (pendingResponses.length) {
      contents.push({ role: "user", parts: pendingResponses });
      pendingResponses = [];
    }
  };
  for (const m of messages) {
    if (m.role === "system") {
      system.push(m.content);
      continue;
    }
    if (m.role === "tool") {
      const name = idToName.get(m.toolCallId ?? "") ?? "unknown_tool";
      pendingResponses.push({ functionResponse: { name, response: safeJson(m.content) } });
      continue;
    }
    flush();
    if (m.role === "assistant") {
      const parts: GeminiPart[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.toolCalls ?? []) {
        idToName.set(tc.id, tc.name);
        parts.push({ functionCall: { name: tc.name, args: tc.args } });
      }
      contents.push({ role: "model", parts: parts.length ? parts : [{ text: "" }] });
    } else {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    }
  }
  flush();
  return { systemInstruction: system.length ? system.join("\n\n") : undefined, contents };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { result: text }; // Gemini butuh object — teks non-JSON dibungkus
  }
}

export class GeminiProvider implements ProviderAdapter {
  readonly id = "gemini";
  constructor(private readonly cfg: GeminiConfig) {}

  async chatStream(req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
    const { systemInstruction, contents } = toGeminiRequest(req.messages);
    const timeoutMs = this.cfg.timeoutMs ?? Number(process.env.YUI_PROVIDER_TIMEOUT_MS ?? env.providerTimeoutMs);
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(timeoutMs)].filter(Boolean) as AbortSignal[]);
    const url = `${this.cfg.baseUrl.replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`;
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-goog-api-key": this.cfg.apiKey },
      body: JSON.stringify({
        ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
        contents,
        ...(req.tools.length
          ? { tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }] }
          : {}),
      }),
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini API ${res.status}: ${detail.slice(0, 300)}`);
    }

    let text = "";
    let finishReason: ProviderDone["finishReason"] = "stop";
    const toolCalls: ToolCallRequest[] = [];
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    await parseSse(res.body, (data) => {
      const r = data as {
        candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      const cand = r.candidates?.[0];
      for (const p of cand?.content?.parts ?? []) {
        if (p.text) {
          text += p.text;
          onChunk({ type: "text_delta", delta: p.text });
        }
        if (p.functionCall) {
          toolCalls.push({ id: `call_${randomUUID()}`, name: p.functionCall.name, args: p.functionCall.args ?? {} });
        }
      }
      if (cand?.finishReason) {
        finishReason =
          cand.finishReason === "MAX_TOKENS" ? "length" : cand.finishReason === "STOP" ? "stop" : "stop";
      }
      if (r.usageMetadata) {
        inputTokens = r.usageMetadata.promptTokenCount;
        outputTokens = r.usageMetadata.candidatesTokenCount;
      }
    });

    return {
      type: "done",
      finishReason: toolCalls.length ? "tool_calls" : finishReason, // Gemini: fnCall datang tanpa marker khusus
      text,
      toolCalls,
      usage: inputTokens !== undefined || outputTokens !== undefined ? { inputTokens, outputTokens } : undefined,
    };
  }
}
