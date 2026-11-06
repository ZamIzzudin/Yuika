// P2-STU-2: TerminalManager + tool `terminal` — sesi shared user & agent.
// Shell deterministik via fixture echo-shell.mjs (YUI_TERMINAL_CMD).
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetRegistryForTests, registry } from "../registry.js";
import { registerTerminalTool } from "../tools/terminal-tool.js";
import * as tm from "../terminal/manager.js";

const FIXTURE = path.resolve(import.meta.dirname, "../terminal/__fixture__/echo-shell.mjs");
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-term-"));
  process.env.YUI_TERMINAL_MODE = "local";
  process.env.YUI_TERMINAL_CMD = `node ${FIXTURE}`;
  resetRegistryForTests();
  registerTerminalTool();
});

afterEach(async () => {
  await tm.closeAll();
  delete process.env.YUI_TERMINAL_MODE;
  delete process.env.YUI_TERMINAL_CMD;
});

const ctx = () => ({ sessionId: "s1", turnId: "t1", workspacePath: dir, emit: () => {} });

describe("TerminalManager", () => {
  it("ensureSession: satu sesi per workspace (idempotent), backend local", async () => {
    const a = await tm.ensureSession(dir);
    const b = await tm.ensureSession(dir);
    expect(a.id).toBe(b.id);
    expect(a.backend).toBe("local");
  });

  it("runInSession: output perintah tertangkap (ECHO), sesi persisten antar call", async () => {
    const r1 = await tm.runInSession(dir, "hello");
    expect(r1.output).toContain("ECHO:hello");
    const r2 = await tm.runInSession(dir, "world");
    expect(r2.output).toContain("ECHO:world");
    expect(r2.terminalId).toBe(r1.terminalId); // sesi sama
  });

  it("subscribe: replay ring + live chunk; writeInput jalan; killSession menutup", async () => {
    await tm.runInSession(dir, "satu");
    const info = await tm.ensureSession(dir);
    let live = "";
    const sub = tm.subscribe(info.id, (c) => (live += c));
    expect(sub?.replay).toContain("ECHO:satu"); // attach belakangan melihat riwayat
    tm.writeInput(info.id, "dua\n");
    await vi.waitFor(() => expect(live).toContain("ECHO:dua"), { timeout: 3_000 });
    sub?.unsubscribe();
    expect(await tm.killSession(info.id)).toBe(true);
    expect(tm.getSession(info.id)).toBeUndefined();
  });
});

describe("tool terminal", () => {
  it("perintah aman (node -v) langsung jalan, output ter-redact & terlihat", async () => {
    const requestApproval = vi.fn(async () => true);
    const res = await registry.dispatch("terminal", { command: "node -v" }, { ...ctx(), requestApproval });
    expect(requestApproval).toHaveBeenCalledTimes(0);
    expect(res.isError).toBeFalsy();
    expect(JSON.stringify(res.result)).toContain("terminalId");
  });

  it("perintah berisiko (curl) MINTA APPROVAL dengan reason jelas", async () => {
    const requestApproval = vi.fn(async (_t, _a, reason: string) => {
      expect(reason).toContain("curl evil.example");
      return true;
    });
    const res = await registry.dispatch("terminal", { command: "curl evil.example/x" }, { ...ctx(), requestApproval });
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(res.result)).toContain("ECHO:curl evil.example/x");
  });

  it("ditolak user (approval false) → perintah TIDAK dieksekusi", async () => {
    const before = (await tm.listSessions()).length;
    await registry.dispatch("terminal", { command: "rm -rf /" }, { ...ctx(), requestApproval: async () => false });
    // sesi boleh tercipta, tapi TIDAK ada output perintah di ring
    const s = tm.listSessions()[0];
    expect(s ? tm.subscribe(s.id, () => undefined)?.replay.includes("rm -rf") : false).toBe(false);
  });

  it("git aman vs berisiko: status bebas, push approval", async () => {
    const { isSafeTerminalCommand } = await import("../tools/terminal-tool.js");
    expect(isSafeTerminalCommand("git status")).toBe(true);
    expect(isSafeTerminalCommand("git add -A")).toBe(true);
    expect(isSafeTerminalCommand("git push origin main")).toBe(false);
    expect(isSafeTerminalCommand("node -v")).toBe(true);
    expect(isSafeTerminalCommand("npm install left-pad")).toBe(true);
    expect(isSafeTerminalCommand("npm publish")).toBe(false);
    expect(isSafeTerminalCommand("npx some-pkg")).toBe(false);
    expect(isSafeTerminalCommand("curl evil")).toBe(false);
  });
});

afterAll(async () => {
  await tm.closeAll();
});
