// @yuika/core, tool registry (pola registry Hermes §4.2)
// register() → dispatch() dengan validasi zod + gerbang approval. Semua tool return JSON.
// P0-MCP-2: parameters boleh zod schema ATAU JSON Schema mentah (dari server MCP
// `t.inputSchema`), validasi JSON Schema via ajv (compile sekali, di-cache).
import { z } from "zod";
import Ajv, { type ValidateFunction } from "ajv";
import type { EventDraft } from "@yuika/contracts";

export interface ToolContext {
  sessionId: string;
  turnId: string;
  workspacePath: string;
  /** P2-VLT: persona/project pemanggil, utk scope visibility vault (D27).
   *  Opsional (tool lama tak peduli; test bisa omit). */
  personaId?: string;
  projectId?: string | null;
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
  /** zod schema (tool internal) ATAU JSON Schema object (tool MCP, P0-MCP-2). */
  parameters: z.ZodTypeAny | Record<string, unknown>;
  handler: (args: any, ctx: ToolContext) => Promise<ToolResult>;
  /** Return alasan (string) bila panggilan ini butuh approval manusia; null = langsung jalan. */
  approvalPolicy?: (args: any) => string | null;
}

const tools = new Map<string, ToolDefinition>();
const isZod = (p: ToolDefinition["parameters"]): p is z.ZodTypeAny => typeof (p as z.ZodTypeAny).safeParse === "function";

/** P0-MCP-2: validator ajv per tool (compile sekali, dispatch panas tidak re-compile). */
const ajv = new Ajv({ allErrors: true, strict: false });
const ajvCache = new Map<string, ValidateFunction>();
function jsonSchemaValidator(name: string, schema: Record<string, unknown>): ValidateFunction {
  let fn = ajvCache.get(name);
  if (!fn) {
    fn = ajv.compile(schema);
    ajvCache.set(name, fn);
  }
  return fn;
}

/**
 * Normalisasi JSON Schema untuk kompatibilitas provider OpenAI-compatible.
 * zodToJsonSchema memancarkan `exclusiveMinimum/Maximum: true|false` (bentuk boolean
 * draft-04), sebagian provider (mis. GLM, kode error 1210) memvalidasi draft 2020-12
 * yang mensyaratkan bentuk angka. Konversi: boolean true → ambil nilai minimum/maximum,
 * lalu hapus field aslinya; false → hapus (tidak bermakna di draft baru).
 */
export function normalizeToolSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalizeToolSchema);
  if (!node || typeof node !== "object") return node;
  const n = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n)) {
    if (k === "exclusiveMinimum") {
      if (v === true) out.exclusiveMinimum = n.minimum; // draft-04 boolean → angka
      else if (v !== false) out[k] = v; // bentuk angka (draft-7/2020-12, output zod v4), pertahankan
    } else if (k === "exclusiveMaximum") {
      if (v === true) out.exclusiveMaximum = n.maximum;
      else if (v !== false) out[k] = v;
    } else if (k === "minimum" && n.exclusiveMinimum === true) continue; // pindah ke exclusive
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
          // zod v4: konversi native (drop dep zod-to-json-schema), target
          // draft-7: exclusiveMinimum angka (bukan boolean draft-04) langsung
          // ramah provider; normalizeToolSchema tetap jaring-pengaman utk JSON
          // Schema mentah dari server MCP (bisa draft-04).
          isZod(t.parameters) ? z.toJSONSchema(t.parameters as z.ZodType, { target: "draft-7" }) : t.parameters,
        ) as Record<string, unknown>,
      }));
  },
  async dispatch(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
    const def = tools.get(name);
    if (!def) return { result: { error: `unknown tool: ${name}` }, isError: true };

    // P0-MCP-2: dua jalur validasi, zod (tool internal) atau ajv (JSON Schema MCP).
    let args: Record<string, unknown>;
    if (isZod(def.parameters)) {
      const parsed = def.parameters.safeParse(rawArgs ?? {});
      if (!parsed.success) {
        return { result: { error: "invalid args", issues: parsed.error.issues }, isError: true };
      }
      args = parsed.data as Record<string, unknown>;
    } else {
      const validate = jsonSchemaValidator(name, def.parameters);
      const obj = (rawArgs ?? {}) as Record<string, unknown>;
      if (!validate(obj)) {
        return {
          result: {
            error: "invalid args (json schema)",
            issues: (validate.errors ?? []).map((e) => ({ path: e.instancePath || e.params?.missingProperty || "", message: e.message ?? "invalid" })),
          },
          isError: true,
        };
      }
      args = obj;
    }

    const reason = def.approvalPolicy?.(args) ?? null;
    if (reason) {
      const approved = await ctx.requestApproval(name, args, reason);
      if (!approved) return { result: { error: "denied by user" }, isError: true };
    }

    try {
      return await def.handler(args, ctx);
    } catch (err) {
      // Error handler TIDAK pernah dilempar ke loop, selalu JSON terstruktur.
      return { result: { error: err instanceof Error ? err.message : String(err) }, isError: true };
    }
  },
};

/** Reset untuk tests. */
export function resetRegistryForTests(): void {
  tools.clear();
  ajvCache.clear(); // P0-MCP-2: validator ter-compile ikut reset (schema lama tak nyangkut)
}
