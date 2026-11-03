// @yui/core — MCP client (DEMO): stdio via SDK resmi, register tools ke registry.
// DEMO-SHORTCUT: tanpa health check / reconnect / park / sandbox per-tenant / trust gate —
// semuanya P1 (TASKS.md §MCP). Jangan pernah resolve tool MCP di import-time.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import { registry } from "../registry.js";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpRegistry {
  mcpServers: Record<string, McpServerConfig>;
}

/** Passthrough schema: parameter MCP sudah JSON Schema dari server. */
const passthrough = z.object({}).passthrough();

export async function connectMcpServer(
  serverName: string,
  cfg: McpServerConfig,
): Promise<{ close: () => Promise<void>; toolCount: number }> {
  const client = new Client({ name: "your-yui", version: "0.1.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: cfg.command,
    args: cfg.args ?? [],
    env: cfg.env as Record<string, string> | undefined,
  });
  await client.connect(transport);

  const { tools } = await client.listTools();
  for (const t of tools) {
    registry.register({
      name: `mcp__${serverName}__${t.name}`,
      description: `[MCP:${serverName}] ${t.description ?? t.name}`,
      parameters: passthrough, // TODO(P1): schema nyata dari t.inputSchema
      handler: async (args: Record<string, unknown>) => {
        const res = await client.callTool({ name: t.name, arguments: args });
        return { result: { content: res.content, isError: res.isError ?? false } };
      },
    });
  }
  return {
    close: () => client.close(),
    toolCount: tools.length,
  };
}

export async function connectMcpFromConfig(
  config: McpRegistry | null,
  log: (msg: string) => void = console.warn,
): Promise<{ name: string; close: () => Promise<void>; toolCount: number }[]> {
  const out: { name: string; close: () => Promise<void>; toolCount: number }[] = [];
  if (!config) return out;
  for (const [name, cfg] of Object.entries(config.mcpServers)) {
    try {
      out.push({ name, ...(await connectMcpServer(name, cfg)) });
    } catch (err) {
      log(`MCP server '${name}' gagal connect (demo: lanjut tanpa itu): ${err instanceof Error ? err.message : err}`);
    }
  }
  return out;
}
