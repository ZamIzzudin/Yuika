// @yuika/core, provider abstraction (OpenAI-compatible first; more adapters later).
// Invariant: ALL model access goes through this interface; loop.ts never imports a provider.

export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** Format pesan internal, konvergen dari/ke format provider apa pun (pola Hermes §4.1). */
export interface InternalMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCallRequest[];
  toolCallId?: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  /** JSON Schema object (bukan zod), bentuk yang dikirim ke provider. */
  parameters: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export type ProviderChunk =
  | { type: "text_delta"; delta: string }
  | { type: "reasoning_delta"; delta: string }
  | {
      type: "done";
      finishReason: "stop" | "tool_calls" | "length" | "error";
      text: string;
      toolCalls: ToolCallRequest[];
      usage?: TokenUsage;
    };

export interface ChatRequest {
  model: string;
  messages: InternalMessage[];
  tools: ToolSchema[];
  signal?: AbortSignal;
}

export type ProviderDone = Extract<ProviderChunk, { type: "done" }>;

export interface ProviderAdapter {
  readonly id: string;
  chatStream(req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone>;
}
