// @yui/contracts — MCP (P1-MCP-3, PLAN D17/MCP): trust gate per-workspace,
// izin granular per tool, audit log panggilan. Default = UNTRUSTED (fail-closed).
import { z } from "zod";

/** Kepercayaan satu server MCP di workspace ini (file `workspace/mcp-trust.json`). */
export const McpTrustEntry = z.object({
  server: z.string().min(1),
  trusted: z.boolean().default(false),
  /** Nama tool (tanpa prefix `mcp__<srv>__`) yang DILARANG dipanggil di workspace. */
  denyTools: z.array(z.string()).default([]),
});
export type McpTrustEntry = z.infer<typeof McpTrustEntry>;

export const McpTrustConfig = z.object({
  servers: z.array(McpTrustEntry).default([]),
});
export type McpTrustConfig = z.infer<typeof McpTrustConfig>;

/** Status satu server untuk UI/REST (gabungan deklarasi mcp.json + trust + koneksi live). */
export const McpServerStatus = z.object({
  name: z.string(),
  declared: z.boolean(),
  trusted: z.boolean(),
  denyTools: z.array(z.string()),
  connected: z.boolean(),
  toolCount: z.number(),
  tools: z.array(z.string()),
  /** P0-MCP-1: siklus hidup — down → reconnecting (backoff) → parked (retry manual). */
  state: z.enum(["connected", "reconnecting", "parked", "off"]).default("off"),
  lastError: z.string().nullable().default(null),
  nextRetryAt: z.number().nullable().default(null),
});
export type McpServerStatus = z.infer<typeof McpServerStatus>;

/** Satu baris audit panggilan tool MCP (append-only). */
export const McpAuditEntry = z.object({
  id: z.number(),
  ts: z.number(),
  server: z.string(),
  tool: z.string(),
  sessionId: z.string().nullable(),
  ok: z.boolean(),
  error: z.string().nullable(),
  durationMs: z.number(),
});
export type McpAuditEntry = z.infer<typeof McpAuditEntry>;

// PUT /api/mcp/trust
export const SetMcpTrustRequest = z.object({
  server: z.string().min(1).max(200),
  trusted: z.boolean(),
  denyTools: z.array(z.string().max(200)).max(500).default([]),
});

// ── Katalog MCP (P1-MCP-1) ─────────────────────────────────────────
/** Satu env key yang diminta server katalog (label untuk UI form). */
export const McpCatalogEnvKey = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().default(false),
});
export type McpCatalogEnvKey = z.infer<typeof McpCatalogEnvKey>;

/** Entri katalog server MCP kurasi (install = tulis deklarasi ke mcp.json). */
export const McpCatalogEntry = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  /** Risiko akses: rendah = lokal/aman, sedang = data luar, tinggi = tulis akun pihak ketiga. */
  risk: z.enum(["rendah", "sedang", "tinggi"]),
  command: z.string().min(1),
  args: z.array(z.string()),
  envKeys: z.array(McpCatalogEnvKey),
  docsUrl: z.string().optional(),
  /** Runtime proses: node (npx) atau python (uvx — butuh uv terpasang). */
  runtime: z.enum(["node", "python"]).optional(),
  /** Hint pemasangan bila ada prasyarat (mis. uv). Ditampilkan UI sebelum install. */
  setupNote: z.string().optional(),
});
export type McpCatalogEntry = z.infer<typeof McpCatalogEntry>;

// POST /api/mcp/install
export const InstallMcpRequest = z.object({
  catalogId: z.string().min(1).max(200),
  /** Nilai env dari form UI — hanya value non-kosong yang ditulis ke mcp.json. */
  env: z.record(z.string(), z.string().max(2_000)).refine((o) => Object.keys(o).length <= 50, "maks 50 env key").default({}),
});
export type InstallMcpRequest = z.infer<typeof InstallMcpRequest>;
