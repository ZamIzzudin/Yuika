// @yui/core — MCP client (DEMO): stdio via SDK resmi, register tools ke registry.
// DEMO-SHORTCUT: tanpa health check / reconnect / park / sandbox per-tenant / trust gate —
// semuanya P1 (TASKS.md §MCP). Jangan pernah resolve tool MCP di import-time.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { McpTrustConfig } from "@yui/contracts";
import { registry } from "../registry.js";import { findUvx } from "./uv.js";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpRegistry {
  mcpServers: Record<string, McpServerConfig>;
}

/** Passthrough schema: parameter MCP sudah JSON Schema dari server. */
const passthrough = z.object({}).passthrough(); // fallback bila server tak menyertakan inputSchema

export interface McpCallInfo {
  server: string;
  tool: string;
  sessionId: string | null;
  ok: boolean;
  error: string | null;
  durationMs: number;
}

export async function connectMcpServer(
  serverName: string,
  cfg: McpServerConfig,
  opts: {
    denyTools?: string[];
    onCall?: (info: McpCallInfo) => void;
    onDown?: (reason: string) => void;
    /** P1-MCP-6: server menambah/menghapus tool (notifikasi tools/list_changed).
     *  Dipanggil SETELAH re-register selesai — runtime memperbarui status/allowlist. */
    onToolsChanged?: (info: { toolNames: string[]; added: string[]; removed: string[] }) => void;
  } = {},
): Promise<{
  close: () => Promise<void>;
  toolCount: number;
  toolNames: string[];
  ping: () => Promise<boolean>;
  /** P1-MCP-6: tarik ulang daftar tool (dipanggil saat notifikasi list_changed). */
  refreshTools: () => Promise<{ toolNames: string[]; added: string[]; removed: string[] }>;
}> {
  const client = new Client({ name: "yuika", version: "0.1.0" }, { capabilities: {} });
  // Server Python (uvx): bila uvx tak di PATH (mis. baru di-install via UI dan
  // PATH proses belum menyegarkan), pakai path absolut — tanpa restart server.
  let command = cfg.command;
  if (command === "uvx") {
    command = (await findUvx()) ?? "uvx"; // biarkan ENOENT natural bila tak ada
  }
  const transport = new StdioClientTransport({
    command,
    args: cfg.args ?? [],
    env: cfg.env as Record<string, string> | undefined,
  });
  await client.connect(transport);
  // P0-MCP-1: proses server mati / crash → beri tahu runtime (reconnect backoff).
  // onclose juga terpicu saat penutupan disengaja — runtime memfilter lewat flag.
  transport.onclose = () => opts.onDown?.("transport closed");
  transport.onerror = (e) => opts.onDown?.(e instanceof Error ? e.message : String(e));

  // P1-MCP-6: server mengubah daftar tool (mis. dev tambah tool tanpa restart)
  // → re-fetch + re-register otomatis — TIDAK perlu restart app.
  client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
    void syncTools().then((r) => {
      if (r.added.length || r.removed.length) opts.onToolsChanged?.(r);
    });
  });

  const { tools } = await client.listTools();
  let current = new Set<string>();

  /** Daftar ulang tool server → register baru, unregister yang hilang.
   *  Dipakai saat connect PERTAMA dan setiap notifikasi tools/list_changed (P1-MCP-6). */
  async function syncTools(): Promise<{ toolNames: string[]; added: string[]; removed: string[] }> {
    const { tools } = await client.listTools();
    const fresh = new Set<string>();
    for (const t of tools) {
      const fullName = `mcp__${serverName}__${t.name}`;
      registry.register({
        name: fullName,
      description: `[MCP:${serverName}] ${t.description ?? t.name}`,
      // P0-MCP-2: schema NYATA dari server (JSON Schema `t.inputSchema`) — provider
      // & validasi dispatch memakai bentuk asli (bukan passthrough kosong). Provider
      // jadi tahu parameter tool MCP → tool-call lebih akurat.
      parameters: (t.inputSchema && typeof t.inputSchema === "object" && Object.keys(t.inputSchema).length > 0
        ? (t.inputSchema as Record<string, unknown>)
        : passthrough),
      handler: async (args: Record<string, unknown>, ctx) => {
        // P1-MCP-3: izin granular (deny list per workspace) + audit tiap panggilan.
        if (opts.denyTools?.includes(t.name)) {
          const err = `tool MCP '${serverName}.${t.name}' diblokir izin workspace (denyTools)`;
          opts.onCall?.({ server: serverName, tool: t.name, sessionId: ctx?.sessionId ?? null, ok: false, error: err, durationMs: 0 });
          throw new Error(err);
        }
        const t0 = Date.now();
        try {
          const res = await client.callTool({ name: t.name, arguments: args });
          const ok = !(res.isError ?? false);
          opts.onCall?.({
            server: serverName,
            tool: t.name,
            sessionId: ctx?.sessionId ?? null,
            ok,
            error: ok ? null : `server error: ${t.name}`,
            durationMs: Date.now() - t0,
          });
          return { result: { content: res.content, isError: res.isError ?? false } };
        } catch (err) {
          opts.onCall?.({
            server: serverName,
            tool: t.name,
            sessionId: ctx?.sessionId ?? null,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - t0,
          });
          throw err;
        }
      },
    });
      fresh.add(fullName);
    }
    const added = [...fresh].filter((n) => !current.has(n));
    const removed = [...current].filter((n) => !fresh.has(n));
    for (const n of removed) registry.unregister(n); // tool hilang → tidak bisa dipanggil lagi
    current = fresh;
    return { toolNames: [...fresh], added, removed };
  }

  await syncTools(); // initial sync — snapshot awal untuk return
  const initial = [...current];
  return {
    close: () => client.close(),
    toolCount: initial.length,
    toolNames: initial,
    ping: () => client.ping().then(() => true).catch(() => false),
    refreshTools: syncTools,
  };
}

export async function connectMcpFromConfig(
  config: McpRegistry | null,
  log: (msg: string) => void = console.warn,
  opts: { trust?: McpTrustConfig; onCall?: (info: McpCallInfo) => void } = {},
): Promise<{ name: string; close: () => Promise<void>; toolCount: number }[]> {
  const out: { name: string; close: () => Promise<void>; toolCount: number }[] = [];
  if (!config) return out;
  for (const [name, cfg] of Object.entries(config.mcpServers)) {
    const entry = opts.trust?.servers.find((s) => s.server === name);
    if (!entry?.trusted) {
      log(`MCP server '${name}' SKIPPED — belum di-trust workspace ini (fail-closed, P1-MCP-3)`);
      continue;
    }
    try {
      out.push({ name, ...(await connectMcpServer(name, cfg, { denyTools: entry.denyTools, onCall: opts.onCall })) });
    } catch (err) {
      log(`MCP server '${name}' gagal connect (demo: lanjut tanpa itu): ${err instanceof Error ? err.message : err}`);
    }
  }
  return out;
}
