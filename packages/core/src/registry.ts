// @yui/core — tool registry (pola registry Hermes §4.2)
// register() → dispatch() dengan validasi zod + gerbang approval. Semua tool return JSON.
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { EventDraft } from "@yui/contracts";

export interface ToolContext {
  sessionId: string;
  turnId: string;
  workspacePath: string;
  emit: (draft: EventDraft) => void;
  requestApproval: (tool: string, args: Record<string, unknown>, reason: string) => Promise<boolean>;
}

export interface ToolResult {
  result: unknown;
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
  handler: (args: any, ctx: ToolContext) => Promise<ToolResult>;
  /** Return alasan (string) bila panggilan ini butuh approval manusia; null = langsung jalan. */
  approvalPolicy?: (args: any) => string | null;
}

const tools = new Map<string, ToolDefinition>();

export const registry = {
  register(def: ToolDefinition): void {
    if (tools.has(def.name)) throw new Error(`tool duplikat: ${def.name}`);
    tools.set(def.name, def);
  },
  registerMany(defs: ToolDefinition[]): void {
    defs.forEach((d) => registry.register(d));
  },
  has(name: string): boolean {
    return tools.has(name);
  },
  /** Filter toolset persona; dukung wildcard prefix `mcp__*`. */
  toolSchemas(filter?: string[]): { name: string; description: string; parameters: Record<string, unknown> }[] {
    const allow = (name: string) => {
      if (!filter?.length) return true;
      return filter.some((f) => (f.endsWith("*") ? name.startsWith(f.slice(0, -1)) : f === name));
    };
    return [...tools.values()]
      .filter((t) => allow(t.name))
      .map((t) => ({
        name: t.name,
        description: t.description,
        parameters: zodToJsonSchema(t.parameters, { target: "openApi3" }) as Record<string, unknown>,
      }));
  },
  async dispatch(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
    const def = tools.get(name);
    if (!def) return { result: { error: `unknown tool: ${name}` }, isError: true };

    const parsed = def.parameters.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      return { result: { error: "invalid args", issues: parsed.error.issues }, isError: true };
    }
    const args = parsed.data as Record<string, unknown>;

    const reason = def.approvalPolicy?.(args) ?? null;
    if (reason) {
      const approved = await ctx.requestApproval(name, args, reason);
      if (!approved) return { result: { error: "denied by user" }, isError: true };
    }

    try {
      return await def.handler(args, ctx);
    } catch (err) {
      // Error handler TIDAK pernah dilempar ke loop — selalu JSON terstruktur.
      return { result: { error: err instanceof Error ? err.message : String(err) }, isError: true };
    }
  },
};

/** Reset untuk tests. */
export function resetRegistryForTests(): void {
  tools.clear();
}
