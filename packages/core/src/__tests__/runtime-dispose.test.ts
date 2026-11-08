// Runtime dispose (dev-HMR): runtime yang di-replace HARUS mematikan armada MCP
// lama (proses stdio anak + timer retry + health ping), tanpa itu tiap
// recompile melahirkan ±N proses zombie (feedback user dev-10: reconnect penuh
// berulang). Store sqlite sengaja TIDAK ditutup (turn in-flight masih memakai).
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createYuiRuntime } from "../runtime.js";

let dir: string;
beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-dispose-"))));
afterEach(() => {
  // Store sqlite sengaja tidak ditutup dispose (turn in-flight) → Windows lock;
  // folder temp dibiarkan (OS membersihkan), bukan kegagalan.
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* locked, OK */ }
});

function makeRuntime() {
  return createYuiRuntime({
    provider: { baseUrl: "http://localhost:1", apiKey: "dummy", model: "dummy" },
    paths: { workspacePath: dir, dbPath: path.join(dir, "t.db"), mcpConfigPath: null },
  });
}

describe("runtime.dispose (HMR replace)", () => {
  it("resolve bersih; health timer & retry berhenti (tak ada proses MCP, config null)", async () => {
    const rt = makeRuntime();
    expect(typeof rt.dispose).toBe("function");
    await expect(rt.dispose()).resolves.toBeUndefined();
    // idempoten (dispose kedua saat runtime sudah di-replace tak boleh melempar)
    await expect(rt.dispose()).resolves.toBeUndefined();
  });
});
