// @yuika/core — path resolution (repo root dicari dengan berjalan naik sampai
// turbo.json — tahan terhadap cwd Next.js/vitest/berbagai entrypoint).
import fs from "node:fs";
import path from "node:path";

export function resolveRepoRoot(from: string = process.cwd()): string {
  let dir = path.resolve(from);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "turbo.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(from);
}

export interface YuiPaths {
  dbPath: string;
  workspacePath: string;
  personasDir: string;
  skillsDir: string;
  mcpConfigPath: string | null;
}

export function resolvePaths(root: string = resolveRepoRoot()): YuiPaths {
  const env = process.env;
  return {
    dbPath: env.YUI_DB_PATH || path.join(root, "demo.db"),
    workspacePath: env.YUI_WORKSPACE_DIR || path.join(root, "workspace"),
    personasDir: env.YUI_PERSONAS_DIR || path.join(root, "packages", "personas"),
    skillsDir: env.YUI_SKILLS_DIR || path.join(root, "packages", "skills"),
    mcpConfigPath: env.YUI_MCP_CONFIG ? path.resolve(root, env.YUI_MCP_CONFIG) : null,
  };
}
