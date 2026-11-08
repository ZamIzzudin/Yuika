// @yuika/core, Anthropic adapter : Messages API streaming via fetch SSE.
// Konversi format internal (adapter.ts) → Anthropic: system terpisah, tool_use
// blocks, tool_result sebagai user message. Tanpa SDK, fetch + SSE manual.
import { randomUUID } from "node:crypto";
import { env } from "../env.js";
import type {
  ChatRequest,
  InternalMessage,
  ProviderAdapter,
  ProviderChunk,
  ProviderDone,
  ToolCallRequest,
} from "./adapter.js";

export interface AnthropicConfig {
  baseUrl: string; // default https://api.anthropic.com
  apiKey: string;
  maxTokens?: number;
  timeoutMs?: number;
}

interface AnthropicContent {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
}

/** Konversi internal → contents Anthropic. Tool result digabung ke user message
 *  (syarat API: tool_result HARUS di user role, setelah assistant tool_use). */
export function toAnthropicMessages(messages: InternalMessage[]): { system: string; contents: { role: "user" | "assistant"; content: AnthropicContent[] }[] } {
  const system: string[] = [];
  const contents: { role: "user" | "assistant"; content: AnthropicContent[] }[] = [];
  let pendingToolResults: AnthropicContent[] = [];
  const flushTools = () => {
    if (pendingToolResults.length) {
      contents.push({ role: "user", content: pendingToolResults });
      pendingToolResults = [];
    }
  };
  for (const m of messages) {
    if (m.role === "system") {
      system.push(m.content);
      continue;
    }
    if (m.role === "tool") {
      pendingToolResults.push({ type: "tool_result", tool_use_id: m.toolCallId ?? "", content: m.content });
      continue;
    }
    flushTools();
    if (m.role === "assistant") {
      const blocks: AnthropicContent[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls ?? []) blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args });
      contents.push({ role: "assistant", content: blocks.length ? blocks : [{ type: "text", text: "" }] });
    } else {
      contents.push({ role: "user", content: [{ type: "text", text: m.content }] });
    }
  }
  flushTools();
  return { system: system.join("\n\n"), contents };
}

export class AnthropicProvider implements ProviderAdapter {
  readonly id = "anthropic";
  constructor(private readonly cfg: AnthropicConfig) {}

  async chatStream(req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
    const { system, contents } = toAnthropicMessages(req.messages);
    const timeoutMs = this.cfg.timeoutMs ?? Number(process.env.YUI_PROVIDER_TIMEOUT_MS ?? env.providerTimeoutMs);
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(timeoutMs)].filter(Boolean) as AbortSignal[]);
    const res = await fetch(`${this.cfg.baseUrl.replace(/\/$/, "")}/v1/messages`, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.cfg.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: this.cfg.maxTokens ?? 8192,
        ...(system ? { system } : {}),
        messages: contents,
        ...(req.tools.length
          ? { tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) }
          : {}),
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`);
    }

    let text = "";
    let finishReason: ProviderDone["finishReason"] = "stop";
    const calls = new Map<number, { id: string; name: string; args: string }>();
    let openBlock = -1;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    await parseSse(res.body, (data) => {
      const e = data as {
        type?: string;
        delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
        content_block?: { type?: string; id?: string; name?: string };
        message?: { usage?: { input_tokens?: number; output_tokens?: number } };
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      switch (e.type) {
        case "message_start":
          inputTokens = e.message?.usage?.input_tokens;
          break;
        case "content_block_start":
          if (e.content_block?.type === "tool_use") {
            openBlock = calls.size;
            calls.set(openBlock, { id: e.content_block.id ?? `call_${randomUUID()}`, name: e.content_block.name ?? "", args: "" });
          } else {
            openBlock = -1;
          }
          break;
        case "content_block_delta":
          if (e.delta?.type === "text_delta" && e.delta.text) {
            text += e.delta.text;
            onChunk({ type: "text_delta", delta: e.delta.text });
          } else if (e.delta?.type === "input_json_delta" && openBlock >= 0) {
            const c = calls.get(openBlock);
            if (c) c.args += e.delta.partial_json ?? "";
          }
          break;
        case "message_delta":
          if (e.delta?.stop_reason) {
            finishReason =
              e.delta.stop_reason === "tool_use" ? "tool_calls" : e.delta.stop_reason === "max_tokens" ? "length" : "stop";
          }
          if (e.usage?.output_tokens !== undefined) outputTokens = e.usage.output_tokens;
          break;
        // ping / message_stop / error stream-level: diam (error → fetch !ok path)
      }
    });

    const toolCalls: ToolCallRequest[] = [...calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, c]) => {
        let args: Record<string, unknown> = {};
        try {
          args = c.args ? (JSON.parse(c.args) as Record<string, unknown>) : {};
        } catch {
          args = { _raw: c.args };
        }
        return { id: c.id, name: c.name, args };
      });

    return {
      type: "done",
      finishReason,
      text,
      toolCalls,
      usage: inputTokens !== undefined || outputTokens !== undefined ? { inputTokens, outputTokens } : undefined,
    };
  }
}

/** Parser SSE generik (dipakai adapter fetch-based): `data: {...}` per blok. */
export async function parseSse(
  body: ReadableStream<Uint8Array>,
  onData: (data: Record<string, unknown>) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        onData(JSON.parse(payload) as Record<string, unknown>);
      } catch {
        /* baris bukan JSON, abaikan */
      }
    }
  }
}
