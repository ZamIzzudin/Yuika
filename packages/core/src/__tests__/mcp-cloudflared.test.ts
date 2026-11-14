// D106: MCP server cloudflared (quick tunnel, in-repo). Handshake stdio +
// tools/list + tools/call. cf_quick_status/cf_quick_stop harus rapi walau
// CLI cloudflared tidak terpasang; cf_quick_start tanpa CLI = isError EN
// berisi hint instalasi (bukan crash).
import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const server = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "mcp-servers",
  "cloudflared",
  "index.mjs",
);

interface RpcResult {
  result?: {
    tools?: { name: string }[];
    content?: { type: string; text: string }[];
    isError?: boolean;
    protocolVersion?: string;
  };
  error?: unknown;
}

function rpc(method: string, params?: unknown, id = 1): Promise<RpcResult> {
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
    }, 15_000);
  });
}

function textOf(res: RpcResult): string {
  return res.result?.content?.[0]?.text ?? "";
}

describe("MCP cloudflared server (stdio)", () => {
  it("initialize + tools/list memuat cf_quick_start/status/stop", async () => {
    const init = (await rpc("initialize")) as {
      result: { protocolVersion: string };
    };
    expect(init.result.protocolVersion).toBe("2024-11-05");
    const list = await rpc("tools/list", {}, 2);
    const names = (list.result?.tools ?? []).map((t) => t.name);
    expect(names).toContain("cf_quick_start");
    expect(names).toContain("cf_quick_status");
    expect(names).toContain("cf_quick_stop");
  }, 20_000);

  it("cf_quick_status tanpa tunnel aktif = stopped, bukan error", async () => {
    const res = await rpc("tools/call", { name: "cf_quick_status", arguments: {} }, 3);
    expect(res.result?.isError).toBeFalsy();
    expect(textOf(res)).toMatch(/"running": false/);
  }, 20_000);

  it("cf_quick_stop idempotent + cf_quick_start port invalid = isError EN", async () => {
    const stop = await rpc("tools/call", { name: "cf_quick_stop", arguments: {} }, 4);
    expect(res_ok(stop)).toBe(true);
    const bad = await rpc("tools/call", { name: "cf_quick_start", arguments: { port: 0 } }, 5);
    expect(bad.result?.isError).toBe(true);
    expect(textOf(bad)).toMatch(/port must be an integer/);
  }, 20_000);
});

function res_ok(res: RpcResult): boolean {
  return res.result?.isError !== true;
}
