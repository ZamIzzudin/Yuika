// P1 fix 2026-11, kegagalan connect MCP saat STARTUP kini masuk reconnect
// backoff (scheduleMcpRetry), bukan mati permanen sampai restart proses.
// Sebelum fix: satu warn log → state "off" selamanya (cold start `uvx` yang
// timeout -32001 tak pernah dicoba ulang walau cache paket sudah terisi).
import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createYuiRuntime } from "../runtime.js";

let rt: ReturnType<typeof createYuiRuntime> | null = null;
afterEach(async () => {
  await rt?.dispose();
  rt = null;
});

function makeRuntime(dir: string, mcp: Record<string, unknown>) {
  fs.writeFileSync(path.join(dir, "mcp.json"), JSON.stringify({ mcpServers: mcp }));
  fs.writeFileSync(path.join(dir, "mcp-trust.json"), JSON.stringify({ servers: [{ server: "broken", trusted: true, denyTools: [] }] }));
  rt = createYuiRuntime({
    provider: { baseUrl: "http://localhost:1", apiKey: "dummy", model: "dummy" },
    paths: { workspacePath: dir, dbPath: path.join(dir, "t.db"), mcpConfigPath: path.join(dir, "mcp.json") },
  });
  return rt;
}

describe("MCP startup failure → reconnect backoff (fix 2026-11)", () => {
  it("command tidak ada (ENOENT) → state reconnecting + nextRetryAt terjadwal (bukan off permanen)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-mcpretry-"));
    const runtime = makeRuntime(dir, { broken: { command: "yui-definitely-missing-cmd", args: [] } });

    // startup connect async, beri jendela untuk ENOENT + scheduleMcpRetry
    await new Promise((r) => setTimeout(r, 800));
    const st = runtime.mcpServerStatuses().find((s) => s.name === "broken");
    expect(st?.state).toBe("reconnecting");
    expect(st?.nextRetryAt).not.toBeNull();
    expect(st?.lastError).toBeTruthy();
  }, 10_000);
});
