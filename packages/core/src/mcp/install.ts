// @yui/core — Install/uninstall server MCP (P1-MCP-1): tulis deklarasi ke
// `mcp.json` (root repo). Tidak ada auto-connect — fail-closed tetap berlaku:
// setelah install, user harus Trust server di panel MCP (P1-MCP-3) sebelum
// runtime menghubungkannya. Placeholder `{workspace}` disimpan apa adanya;
// substitusi path absolut dilakukan runtime saat load (lihat runtime.ts).
import fs from "node:fs";
import path from "node:path";
import { catalogById } from "./catalog.js";
import type { McpRegistry, McpServerConfig } from "./client.js";
import type { McpServerStatus } from "@yui/contracts";

export function readMcpConfig(mcpConfigPath: string): McpRegistry {
  if (!fs.existsSync(mcpConfigPath)) return { mcpServers: {} };
  try {
    return JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8")) as McpRegistry;
  } catch {
    return { mcpServers: {} };
  }
}

function writeMcpConfig(mcpConfigPath: string, config: McpRegistry): void {
  fs.mkdirSync(path.dirname(mcpConfigPath), { recursive: true });
  fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/**
 * Pasang entri katalog ke mcp.json. Env kosong tidak ditulis.
 * Return deklarasi final. Throw bila catalogId tak dikenal atau env required kosong.
 */
export function installFromCatalog(
  mcpConfigPath: string,
  catalogId: string,
  env: Record<string, string>,
): { name: string; decl: McpServerConfig } {
  const entry = catalogById(catalogId);
  if (!entry) throw new Error(`entri katalog tidak dikenal: ${catalogId}`);
  for (const k of entry.envKeys) {
    if (k.required && !env[k.key]?.trim()) throw new Error(`env ${k.key} wajib diisi untuk ${entry.name}`);
  }
  const cleanEnv = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ""),
  ) as Record<string, string>;
  const decl: McpServerConfig = {
    command: entry.command,
    ...(entry.args.length > 0 ? { args: entry.args } : {}),
    ...(Object.keys(cleanEnv).length > 0 ? { env: cleanEnv } : {}),
  };
  const config = readMcpConfig(mcpConfigPath);
  config.mcpServers = { ...config.mcpServers, [catalogId]: decl };
  writeMcpConfig(mcpConfigPath, config);
  return { name: catalogId, decl };
}

/** Lepas server dari mcp.json. Return true bila ada yang dihapus. */
export function uninstallFromConfig(mcpConfigPath: string, name: string): boolean {
  const config = readMcpConfig(mcpConfigPath);
  if (!(name in config.mcpServers)) return false;
  const { [name]: _gone, ...rest } = config.mcpServers;
  writeMcpConfig(mcpConfigPath, { mcpServers: rest });
  return true;
}

/** Status ringkas untuk UI setelah install (tanpa koneksi — belum di-trust). */
export function statusOfDecl(name: string, _decl: McpServerConfig): McpServerStatus {
  return {
    name,
    declared: true,
    trusted: false,
    denyTools: [],
    connected: false,
    toolCount: 0,
    tools: [],
    state: "off" as const,
    lastError: null,
    nextRetryAt: null,
  };
}
