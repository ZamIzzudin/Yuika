// : install/uninstall MCP kini menulis OVERLAY user
// (workspace/mcp.user.json) — bukan mcp.json base. Base (layer image,
// default katalog) digabung dgn overlay saat load; uninstall server base
// menulis tombstone. Token/instalasi user selamat lintas redeploy.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  installFromCatalog,
  uninstallFromConfig,
  readUserConfig,
  readMcpConfig,
  mergeMcpConfig,
} from "../mcp/install.js";

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "yui-mcp-"));
}

function writeBase(dir: string, servers: Record<string, unknown>): string {
  const file = path.join(dir, "mcp.json");
  fs.writeFileSync(file, JSON.stringify({ mcpServers: servers }, null, 2));
  return file;
}

describe("install MCP dari katalog (overlay user)", () => {
  it("install server tanpa env → deklarasi tertulis ke mcp.user.json", () => {
    const ws = tmpWorkspace();
    const { name, decl } = installFromCatalog(ws, "fetch", {});
    expect(name).toBe("fetch");
    expect(decl.command).toBe("npx");
    const user = readUserConfig(ws);
    expect(user.mcpServers.fetch?.args).toContain("@kazuph/mcp-fetch");
  });

  it("env required kosong → error; terisi → tertulis (tanpa nilai kosong)", () => {
    const ws = tmpWorkspace();
    expect(() => installFromCatalog(ws, "github", {})).toThrow(/GITHUB_PERSONAL_ACCESS_TOKEN/);
    installFromCatalog(ws, "github", { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_test", FIRECRAWL_API_KEY: "" });
    const user = readUserConfig(ws);
    expect(user.mcpServers.github?.env).toEqual({ GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_test" });
  });

  it("id tak dikenal → error; install ulang menimpa; uninstall server user menghapus", () => {
    const ws = tmpWorkspace();
    expect(() => installFromCatalog(ws, "tidak-ada", {})).toThrow(/katalog/);
    installFromCatalog(ws, "time", {});
    installFromCatalog(ws, "time", {});
    expect(Object.keys(readUserConfig(ws).mcpServers)).toEqual(["time"]);
    expect(uninstallFromConfig(ws, "time", null)).toBe(true);
    expect(readUserConfig(ws).mcpServers).toEqual({});
    expect(uninstallFromConfig(ws, "time", null)).toBe(false);
  });

  it("semantik deployment: base ∪ overlay, tombstone uninstall base, overlay selamat saat image diganti", () => {
    const ws = tmpWorkspace();
    // "image v1": default katalog dari repo
    const base = writeBase(ws, { fetch: { command: "npx", args: ["-y", "@kazuph/mcp-fetch"] } });

    // user install github + uninstall server base "fetch"
    installFromCatalog(ws, "github", { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_secret" });
    expect(uninstallFromConfig(ws, "fetch", base)).toBe(true);

    const effective = mergeMcpConfig(readMcpConfig(base), readUserConfig(ws));
    expect(Object.keys(effective.mcpServers)).toEqual(["github"]); // fetch tombstoned
    expect(effective.mcpServers.github?.env?.GITHUB_PERSONAL_ACCESS_TOKEN).toBe("ghp_secret");

    // "redeploy": image diganti (base v2 = default segar, overlay di volume tetap)
    const base2 = writeBase(ws, {
      fetch: { command: "npx", args: ["-y", "@kazuph/mcp-fetch"] },
      time: { command: "uvx", args: ["mcp-server-time"] },
    });
    const after = mergeMcpConfig(readMcpConfig(base2), readUserConfig(ws));
    expect(Object.keys(after.mcpServers)).toEqual(["time", "github"]); // github + token selamat
    expect(after.mcpServers.github?.env?.GITHUB_PERSONAL_ACCESS_TOKEN).toBe("ghp_secret");

    // re-install "fetch" menghidupkan kembali (tombstone bersih)
    installFromCatalog(ws, "fetch", {});
    const revived = mergeMcpConfig(readMcpConfig(base2), readUserConfig(ws));
    expect(revived.mcpServers.fetch?.command).toBe("npx");
  });
});
