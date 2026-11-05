// @yuika/core — MCP trust gate (P1-MCP-3): fail-closed — server tanpa entri trust
// TIDAK dihubungkan. Sumber: `workspace/mcp-trust.json` (per-workspace, deklaratif).
import fs from "node:fs";
import path from "node:path";
import { McpTrustConfig, McpTrustEntry, type McpTrustConfig as Config } from "@yuika/contracts";

export function trustFilePath(workspacePath: string): string {
  return path.join(workspacePath, "mcp-trust.json");
}

/** Muat trust; file hilang/rusak → konfigurasi kosong = SEMUA server untrusted (fail-closed). */
export function loadTrust(workspacePath: string): Config {
  const file = trustFilePath(workspacePath);
  if (!fs.existsSync(file)) return { servers: [] };
  try {
    return McpTrustConfig.parse(JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch {
    return { servers: [] };
  }
}

export function saveTrust(workspacePath: string, config: Config): void {
  const parsed = McpTrustConfig.parse(config);
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.writeFileSync(trustFilePath(workspacePath), JSON.stringify(parsed, null, 2), "utf-8");
}

/** Upsert satu entri (replace bila ada), simpan utuh. */
export function upsertTrust(workspacePath: string, entry: McpTrustEntry): Config {
  const cur = loadTrust(workspacePath);
  const servers = [...cur.servers.filter((s) => s.server !== entry.server), McpTrustEntry.parse(entry)];
  const next = McpTrustConfig.parse({ servers });
  saveTrust(workspacePath, next);
  return next;
}

/** Entri trust server (undeclared → undefined = untrusted). */
export function trustOf(config: Config, server: string): McpTrustEntry | undefined {
  return config.servers.find((s) => s.server === server);
}

/** Tool diizinkan? true hanya bila server trusted dan tool tidak di-deny. */
export function isToolAllowed(entry: McpTrustEntry | undefined, tool: string): boolean {
  if (!entry?.trusted) return false;
  return !entry.denyTools.includes(tool);
}
