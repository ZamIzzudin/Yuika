// @yuika/core, Install/uninstall server MCP : tulis deklarasi ke
// `mcp.user.json` DI DALAM WORKSPACE (volume persist). Base `mcp.json`
// (YUI_MCP_CONFIG, layer image) hanya-baca dari sisi user: redeploy
// deployment mengganti image — token/instalasi user yang ditulis ke sana
// hilang bersama kontainer. Config efektif = base ∪ user overlay
// (overlay menimpa per-server; `removed` = tombstone uninstall server
// base). Tidak ada auto-connect, fail-closed tetap berlaku: setelah
// install, user harus Trust server di panel MCP sebelum runtime
// menghubungkannya. Placeholder `{workspace}` disimpan apa adanya;
// substitusi path absolut dilakukan runtime saat load (lihat runtime.ts).
import fs from "node:fs";
import path from "node:path";
import { catalogById } from "./catalog.js";
import type { McpRegistry, McpServerConfig } from "./client.js";
import type { McpServerStatus } from "@yuika/contracts";

/** Overlay user: server yang di-install user + tombstone uninstall base. */
export interface UserMcpConfig {
  mcpServers: Record<string, McpServerConfig>;
  removed?: string[];
}

export function userConfigPath(workspacePath: string): string {
  return path.join(workspacePath, "mcp.user.json");
}

export function readUserConfig(workspacePath: string): UserMcpConfig {
  const file = userConfigPath(workspacePath);
  if (!fs.existsSync(file)) return { mcpServers: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as UserMcpConfig;
    return {
      mcpServers: raw.mcpServers ?? {},
      removed: Array.isArray(raw.removed) ? raw.removed : [],
    };
  } catch {
    return { mcpServers: {} };
  }
}

function writeUserConfig(workspacePath: string, user: UserMcpConfig): void {
  fs.mkdirSync(workspacePath, { recursive: true });
  const removed = user.removed?.length ? { removed: user.removed } : {};
  fs.writeFileSync(
    userConfigPath(workspacePath),
    JSON.stringify({ mcpServers: user.mcpServers, ...removed }, null, 2) + "\n",
    "utf-8",
  );
}

/** Config efektif: base (mcp.json image) minus tombstone, lalu overlay
 *  user menimpa/menambah per server. */
export function mergeMcpConfig(base: McpRegistry | null, user: UserMcpConfig): McpRegistry {
  const servers: Record<string, McpServerConfig> = {};
  for (const [k, v] of Object.entries(base?.mcpServers ?? {})) servers[k] = v;
  for (const r of user.removed ?? []) delete servers[r];
  for (const [k, v] of Object.entries(user.mcpServers)) servers[k] = v;
  return { mcpServers: servers };
}

export function readMcpConfig(mcpConfigPath: string): McpRegistry {
  if (!fs.existsSync(mcpConfigPath)) return { mcpServers: {} };
  try {
    return JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8")) as McpRegistry;
  } catch {
    return { mcpServers: {} };
  }
}

/**
 * Pasang entri katalog ke OVERLAY user (workspace/mcp.user.json — persist
 * lintas redeploy). Env kosong tidak ditulis.
 * Return deklarasi final. Throw bila catalogId tak dikenal atau env required kosong.
 */
export function installFromCatalog(
  workspacePath: string,
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
  const user = readUserConfig(workspacePath);
  user.mcpServers = { ...user.mcpServers, [catalogId]: decl };
  user.removed = (user.removed ?? []).filter((r) => r !== catalogId); // re-install menghidupkan kembali
  writeUserConfig(workspacePath, user);
  return { name: catalogId, decl };
}

/** Lepas server dari config efektif: hapus dari overlay; bila server base,
 *  tulis tombstone `removed` (base tak bisa dimodifikasi, layer image).
 * Return true bila ada yang dihapus. */
export function uninstallFromConfig(workspacePath: string, name: string, basePath: string | null): boolean {
  const base = basePath && fs.existsSync(basePath) ? readMcpConfig(basePath) : { mcpServers: {} };
  const effective = mergeMcpConfig(base, readUserConfig(workspacePath));
  if (!(name in effective.mcpServers)) return false;
  const user = readUserConfig(workspacePath);
  delete user.mcpServers[name];
  if (name in base.mcpServers) {
    user.removed = [...new Set([...(user.removed ?? []), name])];
  } else {
    user.removed = (user.removed ?? []).filter((r) => r !== name);
  }
  writeUserConfig(workspacePath, user);
  return true;
}

/** Status ringkas untuk UI setelah install (tanpa koneksi, belum di-trust). */
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
