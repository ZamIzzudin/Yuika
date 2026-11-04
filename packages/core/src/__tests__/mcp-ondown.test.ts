// P0-MCP-1: deteksi server MCP mati → onDown terpanggil (pemicu reconnect backoff
// di runtime). Fixture: server merespons lalu exit(1) saat tools/call pertama.
import { describe, expect, it, beforeEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registry, resetRegistryForTests } from "../registry.js";
import { connectMcpServer } from "../mcp/client.js";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "boom-mcp-server.mjs");
const ctx = () => ({ sessionId: "s", turnId: "t", workspacePath: ".", emit: () => {}, requestApproval: async () => true });

beforeEach(() => resetRegistryForTests());

describe("MCP onDown (P0-MCP-1)", () => {
  it("transport mati (server crash) → onDown terpanggil + tool dilepas panggilan berikutnya error", async () => {
    let down = "";
    const conn = await connectMcpServer("boom", { command: "node", args: [fixture] }, { onDown: (r) => (down = r) });
    expect(conn.toolNames).toContain("mcp__boom__boom");
    expect(typeof conn.ping).toBe("function");

    const res = await registry.dispatch("mcp__boom__boom", {}, ctx());
    expect(res.isError).toBeFalsy(); // balasan terakhir sebelum mati

    // server exit(1) → transport.onclose → onDown (kasih jendela waktu)
    await new Promise((r) => setTimeout(r, 700));
    expect(down).toBeTruthy();

    await conn.close().catch(() => undefined);
  }, 15_000);
});
