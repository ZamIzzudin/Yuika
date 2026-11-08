// @yuika/core, OpenAI-compatible streaming adapter (D12)
import OpenAI from "openai";
import { env } from "../env.js";
import type {
  ChatRequest,
  InternalMessage,
  ProviderAdapter,
  ProviderChunk,
  ProviderDone,
  ToolCallRequest,
} from "./adapter.js";

type ApiMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ApiTool = OpenAI.Chat.Completions.ChatCompletionTool;

function toApiMessages(messages: InternalMessage[]): ApiMessage[] {
  return messages.map((m): ApiMessage => {
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: "function" as const,
          function: { name: c.name, arguments: JSON.stringify(c.args) },
        })),
      };
    }
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId ?? "", content: m.content };
    }
    if (m.role === "assistant") return { role: "assistant", content: m.content };
    if (m.role === "system") return { role: "system", content: m.content };
    return { role: "user", content: m.content };
  });
}

function toApiTools(tools: ChatRequest["tools"]): ApiTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as Record<string, unknown>,
    },
  }));
}

export interface OpenAICompatConfig {
  baseUrl: string;
  apiKey: string;
}

export class OpenAICompatProvider implements ProviderAdapter {
  readonly id = "openai-compat";
  private client: OpenAI;

  constructor(cfg: OpenAICompatConfig) {
    this.client = new OpenAI({
      baseURL: cfg.baseUrl,
      apiKey: cfg.apiKey,
      // P0-CORE-2 (parsial): panggilan provider bisa menggantung menit-lamanya
      // (di test: 139 dtk dan 35 dtk), timeout per request + retry transien.
      timeout: Number(process.env.YUI_PROVIDER_TIMEOUT_MS ?? env.providerTimeoutMs),
      maxRetries: 2,
    });
  }

  async chatStream(req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
    const stream = await this.client.chat.completions.create(
      {
        model: req.model,
        messages: toApiMessages(req.messages),
        tools: req.tools.length ? toApiTools(req.tools) : undefined,
        stream: true,
      },
      // P0-CORE-1: abort HTTP in-flight saat user menekan Stop (tanpa menunggu timeout).
      { signal: req.signal },
    );

    let text = "";
    let finishReason: ProviderDone["finishReason"] = "stop";
    // Akumulasi fragment tool-call per index (provider mengirim delta per index);
    // args masih string mentah (fragmen JSON), baru di-parse jadi object di bawah.
    const calls = new Map<number, { id: string; name: string; args: string }>();
    let usage: ProviderDone["usage"];

    for await (const part of stream) {
      const choice = part.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta;
      // GLM/Anthropic-compat mengirim pikiran model di reasoning_content.
      // Fix dev-10: JANGAN dibuang, streaming "thinking" inilah yang membuat
      // panggilan menit-lamanya terasa hidup di UI (42k token reasoning pernah
      // hilang diam-diam → UI seolah hang).
      if ((delta as { reasoning_content?: string } | undefined)?.reasoning_content) {
        onChunk({ type: "reasoning_delta", delta: (delta as unknown as { reasoning_content: string }).reasoning_content });
      }
      if (delta?.content) {
        text += delta.content;
        onChunk({ type: "text_delta", delta: delta.content });
      }
      for (const tc of delta?.tool_calls ?? []) {
        const idx = tc.index ?? 0;
        const cur = calls.get(idx) ?? { id: "", name: "", args: "" };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name = cur.name + tc.function.name;
        if (tc.function?.arguments) cur.args = cur.args + tc.function.arguments;
        calls.set(idx, cur);
      }
      if (choice.finish_reason) {
        finishReason =
          choice.finish_reason === "tool_calls"
            ? "tool_calls"
            : choice.finish_reason === "length"
              ? "length"
              : "stop";
      }
      if (part.usage) {
        // usage hadir di chunk terakhir pada sebagian provider
        usage = { inputTokens: part.usage.prompt_tokens, outputTokens: part.usage.completion_tokens };
      }
    }

    const toolCalls = [...calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, c]) => {
        let args: Record<string, unknown> = {};
        try {
          args = c.args ? (JSON.parse(c.args) as Record<string, unknown>) : {};
        } catch {
          args = { _raw: c.args }; // TODO(P0): error surface utk malformed args
        }
        return { id: c.id || `call_${crypto.randomUUID()}`, name: c.name, args };
      });

    return { type: "done", finishReason, text, toolCalls, usage };
  }
}
