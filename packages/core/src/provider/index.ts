// @yui/core — provider factory (P1-INF-2): pilih adapter per settings.
export type ProviderKind = "openai-compat" | "anthropic" | "gemini";

export const PROVIDER_KINDS: { kind: ProviderKind; label: string; defaultBaseUrl: string }[] = [
  { kind: "openai-compat", label: "OpenAI-compatible (GLM/OpenAI/OpenRouter/…)", defaultBaseUrl: "https://api.openai.com/v1" },
  { kind: "anthropic", label: "Anthropic (Claude)", defaultBaseUrl: "https://api.anthropic.com" },
  { kind: "gemini", label: "Google Gemini", defaultBaseUrl: "https://generativelanguage.googleapis.com" },
];
