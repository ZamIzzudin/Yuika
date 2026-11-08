// @yuika/core, MCP client (DEMO): stdio via SDK resmi, register tools ke registry.
// Health check, reconnect, park, per-tenant sandbox, and the trust gate
// are handled by the runtime. Never resolve MCP tools at import time.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { McpTrustConfig } from "@yuika/contracts";
import { registry } from "../registry.js";import { findUvx } from "./uv.js";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /** Run the server INSIDE a sandbox container (isolated worker,
   * not bare stdio). `true` = force; without the flag = plain stdio.
   * If Docker is unavailable with `true` -> a clear error (fail-closed),
   * except `"auto"` -> stdio fallback with a warning. */
  sandbox?: boolean | "auto";
  /** allowlist egress server ini (hanya relevan bila sandbox aktif). */
  egress?: string[];
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
    /** The server added or removed tools (tools/list_changed notification).
     *  Called AFTER re-registration; the runtime refreshes status/allowlist. */
    onToolsChanged?: (info: { toolNames: string[]; added: string[]; removed: string[] }) => void;
    /** Timeout handshake connect + listTools awal. Default 150 dtk, cold start
     *  `uvx`/`npx` mengunduh paket pertama kali (PyPI/npm bisa lambat); timeout
     *  SDK default 60 dtk terlalu ketat → -32001 "Request timed out". */
    connectTimeoutMs?: number;
    /** Workspace root to mount into the container when cfg.sandbox is on. */
    workspacePath?: string;
  } = {},
): Promise<{
  close: () => Promise<void>;
  toolCount: number;
  toolNames: string[];
  ping: () => Promise<boolean>;
  /** Re-pull the tool list (called on tools/list_changed). */
  refreshTools: () => Promise<{ toolNames: string[]; added: string[]; removed: string[] }>;
}> {
  const connectTimeoutMs = opts.connectTimeoutMs ?? 150_000;
  const client = new Client({ name: "yuika", version: "0.1.0" }, { capabilities: {} });
  // Server Python (uvx): bila uvx tak di PATH (mis. baru di-install via UI dan
  // PATH proses belum menyegarkan), pakai path absolut, tanpa restart server.
  let command = cfg.command;
  if (command === "uvx") {
    command = (await findUvx()) ?? "uvx"; // biarkan ENOENT natural bila tak ada
  }

  // Per-tenant sandboxed MCP worker: the stdio server is wrapped in
  // `docker run -i` (isolated container: caps dropped, default-deny network,
  // optional egress allowlist) instead of spawning bare on the host.
  let dockerArgv: string[] | null = null;
  if (cfg.sandbox && opts.workspacePath) {
    const forced = cfg.sandbox === true;
    const hasDocker = await (await import("../tools/sandbox.js")).dockerAvailable();
    if (hasDocker) {
      const sb = await import("../tools/sandbox.js");
      const egress = cfg.egress ?? [];
      let proxyPort: number | undefined;
      if (egress.length > 0) {
        const { getEgressProxy } = await import("../tools/egress.js");
        proxyPort = (await getEgressProxy(egress)).port;
      }
      const name = `yui-mcp-${serverName}-${Date.now().toString(36)}`;
      dockerArgv = sb.sandboxArgv(name, command, cfg.args ?? [], opts.workspacePath, { egress, mountMode: "ro", interactive: true }, proxyPort);
    } else if (forced) {
      throw new Error(
        `MCP server '${serverName}' menuntut sandbox (sandbox: true) tapi Docker tidak tersedia, YUI_SANDBOX gagal fail-closed`,
      );
    } else {
      opts.onDown?.("sandbox diminta tapi Docker tak tersedia, fallback stdio host (sandbox:auto)");
    }
  }

  const transport = new StdioClientTransport(
    dockerArgv
      ? { command: "docker", args: dockerArgv, env: cfg.env as Record<string, string> | undefined }
      : { command, args: cfg.args ?? [], env: cfg.env as Record<string, string> | undefined },
  );
  // Gagal handshake (timeout/initialize) → tutup transport agar proses anak
  // `uvx`/`npx` tak jadi zombie (unduhan lanjut di cache, retry berikutnya cepat).
  try {
    await client.connect(transport, { timeout: connectTimeoutMs });
  } catch (err) {
    try {
      await transport.close();
    } catch {
      /* proses anak mungkin sudah mati */
    }
    throw err;
  }
  // The server process died / crashed -> notify the runtime (reconnect backoff).
  // onclose also fires on deliberate shutdown; the runtime filters via a flag.
  transport.onclose = () => opts.onDown?.("transport closed");
  transport.onerror = (e) => opts.onDown?.(e instanceof Error ? e.message : String(e));

  // The server changed its tool list (e.g. tools added without a restart)
  // -> automatic re-fetch + re-register, no app restart needed.
  client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
    void syncTools().then((r) => {
      if (r.added.length || r.removed.length) opts.onToolsChanged?.(r);
    });
  });

  const { tools } = await client.listTools(undefined, { timeout: connectTimeoutMs });

  let current = new Set<string>();

  /** Daftar ulang tool server → register baru, unregister yang hilang.
   *  Used on first connect and on every tools/list_changed notification. */
  async function syncTools(): Promise<{ toolNames: string[]; added: string[]; removed: string[] }> {
    const { tools } = await client.listTools();
    const fresh = new Set<string>();
    for (const t of tools) {
      const fullName = `mcp__${serverName}__${t.name}`;
      registry.register({
        name: fullName,
      description: `[MCP:${serverName}] ${t.description ?? t.name}`,
      // The REAL schema from the server (JSON Schema `t.inputSchema`) so the
      // provider and dispatch validation use the actual shape (not an empty
      // passthrough); the provider sees real MCP parameters.
      parameters: (t.inputSchema && typeof t.inputSchema === "object" && Object.keys(t.inputSchema).length > 0
        ? (t.inputSchema as Record<string, unknown>)
        : passthrough),
      handler: async (args: Record<string, unknown>, ctx) => {
        // Granular permission (per-workspace deny list) + audited on every call.
        if (opts.denyTools?.includes(t.name)) {
          const err = `MCP tool '${serverName}.${t.name}' is blocked by workspace permissions (denyTools)`;
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

  await syncTools(); // initial sync, snapshot awal untuk return
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
      log(`MCP server '${name}' SKIPPED, not trusted in this workspace (fail-closed)`);
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
