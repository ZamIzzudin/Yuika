import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { findUvx, invalidateUvxCache, uvxCandidates } from "../mcp/uv.js";

describe("uv/uvx (runtime Python untuk server MCP)", () => {
  it("kandidat path absolut sesuai OS (default installer uv)", () => {
    const c = uvxCandidates();
    if (process.platform === "win32") {
      expect(c[0]).toBe(path.join(os.homedir(), ".local", "bin", "uvx.exe"));
    } else {
      expect(c[0]).toBe(path.join(os.homedir(), ".local", "bin", "uvx"));
      expect(c).toContain("/opt/homebrew/bin/uvx");
    }
  });

  it("findUvx: string (PATH/absolut) atau null — tak melempar", async () => {
    invalidateUvxCache();
    const r = await findUvx();
    expect(r === null || typeof r === "string").toBe(true);
  });
});
