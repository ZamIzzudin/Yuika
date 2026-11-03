import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installFromCatalog, readMcpConfig, uninstallFromConfig } from "../mcp/install.js";

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-mcp-"));
  return path.join(dir, "mcp.json");
}

describe("install MCP dari katalog (P1-MCP-1)", () => {
  it("install server tanpa env → tulis deklarasi ke mcp.json", () => {
    const file = tmpFile();
    const { name, decl } = installFromCatalog(file, "fetch", {});
    expect(name).toBe("fetch");
    expect(decl.command).toBe("npx");
    const cfg = readMcpConfig(file);
    expect(cfg.mcpServers.fetch?.args).toContain("@kazuph/mcp-fetch");
  });

  it("env required kosong → error; terisi → tertulis (tanpa nilai kosong)", () => {
    const file = tmpFile();
    expect(() => installFromCatalog(file, "github", {})).toThrow(/GITHUB_PERSONAL_ACCESS_TOKEN/);
    installFromCatalog(file, "github", { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_test", FIRECRAWL_API_KEY: "" });
    const cfg = readMcpConfig(file);
    expect(cfg.mcpServers.github?.env).toEqual({ GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_test" });
  });

  it("id tak dikenal → error; install ulang menimpa; uninstall menghapus", () => {
    const file = tmpFile();
    expect(() => installFromCatalog(file, "tidak-ada", {})).toThrow(/katalog/);
    installFromCatalog(file, "time", {});
    installFromCatalog(file, "time", {});
    expect(Object.keys(readMcpConfig(file).mcpServers)).toEqual(["time"]);
    expect(uninstallFromConfig(file, "time")).toBe(true);
    expect(readMcpConfig(file).mcpServers).toEqual({});
    expect(uninstallFromConfig(file, "time")).toBe(false);
  });

  it("entri existing di mcp.json tidak tersentuh saat install server lain", () => {
    const file = tmpFile();
    fs.writeFileSync(file, JSON.stringify({ mcpServers: { filesystem: { command: "npx", args: ["-y"] } } }));
    installFromCatalog(file, "fetch", {});
    const cfg = readMcpConfig(file);
    expect(cfg.mcpServers.filesystem?.args).toEqual(["-y"]);
    expect(cfg.mcpServers.fetch).toBeDefined();
  });
});
