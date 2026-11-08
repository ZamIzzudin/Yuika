// P1-MCP-4: MCP worker sandbox, fail-closed bila `sandbox: true` tanpa
// Docker; `sandbox: "auto"` fallback stdio host; flag container benar.
import { afterEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import { connectMcpServer } from "../mcp/client.js";

// mock modul sandbox: dockerAvailable dikendalikan test; sandboxArgv asli.
vi.mock("../tools/sandbox.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../tools/sandbox.js")>();
  return {
    ...actual,
    dockerAvailable: vi.fn(async () => dockerUp),
  };
});
let dockerUp = false;

const fixture = path.resolve(import.meta.dirname, "fixtures/slow-mcp-server.mjs");
const ws = os.tmpdir();

afterEach(() => {
  dockerUp = false;
});

describe("MCP worker sandbox (P1-MCP-4)", () => {
  it("sandbox: true tanpa Docker → FAIL-CLOSED (bukan stdio bare diam-diam)", async () => {
    dockerUp = false;
    await expect(
      connectMcpServer("sb1", { command: "node", args: ["x.js"], sandbox: true }, { workspacePath: ws }),
    ).rejects.toThrow(/sandbox.*Docker|Docker.*sandbox/i);
  });

  it('sandbox: "auto" tanpa Docker → fallback stdio host + onDown peringatan', async () => {
    dockerUp = false;
    const warnings: string[] = [];
    const conn = await connectMcpServer(
      "sb2",
      { command: process.execPath, args: [fixture, "10"], sandbox: "auto" },
      { workspacePath: ws, onDown: (r) => warnings.push(r), connectTimeoutMs: 10_000 },
    );
    expect(conn.toolCount).toBeGreaterThanOrEqual(1);
    expect(warnings.some((w) => w.includes("fallback stdio"))).toBe(true);
    await conn.close();
  });

  it("argv worker: egress → proxy env; workspace mount ro; stdin -i", async () => {
    const { sandboxArgv } = await import("../tools/sandbox.js");
    const argv = sandboxArgv("yui-mcp-x", "node", ["srv.js"], ws, { egress: ["a.dev"], mountMode: "ro", interactive: true }, 9999);
    const s = argv.join(" ");
    expect(s).toContain("-i");
    expect(s).toContain(":ro");
    expect(s).toContain("HTTPS_PROXY=http://host.docker.internal:9999");
    expect(s).not.toContain("--network");
  });
});
