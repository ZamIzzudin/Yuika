// P1 fix 2026-11 — MCP cold start:
// 1. connectTimeoutMs (default 150s) diteruskan ke handshake initialize + listTools
//    awal → server `uvx`/`npx` yang mengunduh paket tak lagi -32001 di 60s.
// 2. Handshake gagal → transport DITUTUP: proses anak benar-benar mati (bukan
//    zombie) — dibuktikan lewat pidfile + probe `kill(pid, 0)` yang portabel
//    (Windows: TerminateProcess tak menjalankan handler sinyal → tak bisa pakai marker).
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectMcpServer } from "../mcp/client.js";

const fixture = join(import.meta.dirname, "fixtures", "slow-mcp-server.mjs");

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate: () => boolean, ms = 5_000): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () =>
      predicate() || Date.now() - t0 > ms ? resolve(predicate()) : setTimeout(tick, 100);
    tick();
  });
}

describe("MCP cold-start timeout (fix -32001)", () => {
  it("initialize lambat < connectTimeoutMs → connect tetap sukses", async () => {
    // server menjawab initialize setelah 700ms — timeout longgar 5s harus lolos
    const conn = await connectMcpServer(
      "slow-ok",
      { command: process.execPath, args: [fixture, "700"] },
      { connectTimeoutMs: 5_000 },
    );
    expect(conn.toolNames).toEqual(["mcp__slow-ok__slow"]);
    await conn.close();
  });

  it("initialize lebih lambat dari connectTimeoutMs → reject -32001 DAN proses anak dimatikan", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-slow-"));
    const pidfile = join(dir, "child.pid");
    try {
      // server menjawab setelah 5s; timeout 600ms → SDK raise McpError -32001
      await expect(
        connectMcpServer(
          "slow-timeout",
          { command: process.execPath, args: [fixture, "5000", pidfile] },
          { connectTimeoutMs: 600 },
        ),
      ).rejects.toThrow(/timed out/i);

      // jalur gagal wajib menutup transport → child mati (bukan zombie).
      await waitFor(() => existsSync(pidfile));
      const pid = Number(readFileSync(pidfile, "utf8"));
      expect(Number.isFinite(pid)).toBe(true);
      const dead = await waitFor(() => !alive(pid));
      expect(dead).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 12_000);
});
