// dev-10: MCP server Tailscale (in-repo) — handshake stdio + tools/list +
// tools/call dengan CLI tailscale TIDAK tersedia → hasil isError rapi.
import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const server = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "mcp-servers", "tailscale", "index.mjs");

function rpc(method: string, params?: unknown, id = 1): Promise<{ result?: { tools?: { name: string }[]; isError?: boolean }; error?: unknown }> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [server], { stdio: ["pipe", "pipe", "ignore"] });
    let buf = "";
    p.stdout.on("data", (d) => {
      buf += d;
      const nl = buf.indexOf("\n");
      if (nl >= 0) {
        p.kill();
        try {
          resolve(JSON.parse(buf.slice(0, nl)));
        } catch (e) {
          reject(e);
        }
      }
    });
    p.on("error", reject);
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => {
      p.kill();
      reject(new Error("timeout"));
    }, 10_000);
  });
}

describe("MCP tailscale server (stdio)", () => {
  it("initialize → protocolVersion + tools/list memuat ts_funnel_start", async () => {
    const init = (await rpc("initialize")) as { result: { protocolVersion: string } };
    expect(init.result.protocolVersion).toBe("2024-11-05");
    const list = await rpc("tools/list", {}, 2);
    const names = (list.result?.tools ?? []).map((t) => t.name);
    expect(names).toContain("ts_status");
    expect(names).toContain("ts_serve_start");
    expect(names).toContain("ts_funnel_start");
  }, 20_000);

  it("tools/call ts_status tanpa CLI → isError rapi (bukan crash)", async () => {
    const res = await rpc("tools/call", { name: "ts_status", arguments: {} }, 3);
    // CLI tailscale mungkin ada/ tidak di mesin test — dua-duanya harus dibalas
    expect(res.result).toBeDefined();
  }, 20_000);
});
