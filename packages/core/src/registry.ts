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

/**
 * Normalisasi JSON Schema untuk kompatibilitas provider OpenAI-compatible.
 * zodToJsonSchema memancarkan `exclusiveMinimum/Maximum: true|false` (bentuk boolean
 * draft-04) — sebagian provider (mis. GLM, kode error 1210) memvalidasi draft 2020-12
 * yang mensyaratkan bentuk angka. Konversi: boolean true → ambil nilai minimum/maximum,
 * lalu hapus field aslinya; false → hapus (tidak bermakna di draft baru).
 */
export function normalizeToolSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalizeToolSchema);
  if (!node || typeof node !== "object") return node;
  const n = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n)) {
    if (k === "exclusiveMinimum" && v === true) out.exclusiveMinimum = n.minimum;
    else if (k === "exclusiveMaximum" && v === true) out.exclusiveMaximum = n.maximum;
    else if (k === "exclusiveMinimum" || k === "exclusiveMaximum") continue; // false → hapus
    else if (k === "minimum" && n.exclusiveMinimum === true) continue; // pindah ke exclusive
    else if (k === "maximum" && n.exclusiveMaximum === true) continue;
    else out[k] = normalizeToolSchema(v);
  }
  return out;
}

export const registry = {
  register(def: ToolDefinition): void {
    if (tools.has(def.name)) throw new Error(`tool duplikat: ${def.name}`);
    tools.set(def.name, def);
  },
  registerMany(defs: ToolDefinition[]): void {
    defs.forEach((d) => registry.register(d));
  },
  /** Lepas tool (dipakai disconnect MCP dinamis, P1-MCP-3). */
  unregister(name: string): boolean {
    return tools.delete(name);
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
        parameters: normalizeToolSchema(
          zodToJsonSchema(t.parameters, { target: "openApi3" }),
        ) as Record<string, unknown>,
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
