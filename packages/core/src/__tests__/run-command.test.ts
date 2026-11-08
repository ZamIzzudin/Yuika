// W3-A2 (TASKS.md): run_command, ls/echo internal bebas-approval; node = execFile
// dengan cwd = workspace proyek + approval.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registry, resetRegistryForTests } from "../registry.js";
import { registerRunCommandTool } from "../tools/run-command.js";

let dir: string;
const SAVED_SB = process.env.YUI_SANDBOX;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-run-"));
  fs.writeFileSync(path.join(dir, "a.md"), "x");
  fs.mkdirSync(path.join(dir, "sub"));
  // eksekusi lokal deterministik (jalur sandbox diuji sandbox.test.ts dengan mock)
  process.env.YUI_SANDBOX = "off";
  resetRegistryForTests();
  registerRunCommandTool();
});

afterEach(() => {
  if (SAVED_SB === undefined) delete process.env.YUI_SANDBOX;
  else process.env.YUI_SANDBOX = SAVED_SB;
});

const ctx = () => ({ sessionId: "s1", turnId: "t1", workspacePath: dir, emit: () => {} });

describe("run_command", () => {
  it("node: SELALU minta approval, reason menyertakan argumen", async () => {
    const requestApproval = vi.fn(async (_t: string, _a: unknown, reason: string) => {
      expect(reason).toContain("node -v");
      return true;
    });
    const res = await registry.dispatch("run_command", { command: "node", args: ["-v"] }, { ...ctx(), requestApproval });
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(res.isError).toBeFalsy();
  });

  it("ls: INTERNAL tanpa approval, folder dulu-AZ, cwd = workspace proyek", async () => {
    const requestApproval = vi.fn(async () => true);
    const res = await registry.dispatch("run_command", { command: "ls", args: [] }, { ...ctx(), requestApproval });
    expect(requestApproval).not.toHaveBeenCalled();
    expect(res.isError).toBeFalsy();
    if (!res.isError) {
      const r = res.result as { cwd: string; entries: string[] };
      expect(r.cwd).toBe(path.resolve(dir));
      expect(r.entries).toEqual(["sub/", "a.md"]);
    }
  });

  it("echo: internal, tanpa approval", async () => {
    const requestApproval = vi.fn(async () => true);
    const res = await registry.dispatch("run_command", { command: "echo", args: ["hai"] }, { ...ctx(), requestApproval });
    expect(requestApproval).not.toHaveBeenCalled();
    if (!res.isError) expect((res.result as { stdout: string }).stdout).toBe("hai");
  });

  it("node: cwd tool = root proyek (bukan cwd proses)", async () => {
    const res = await registry.dispatch(
      "run_command",
      { command: "node", args: ["-e", "console.log(process.cwd())"] },
      { ...ctx(), requestApproval: async () => true },
    );
    expect(res.isError).toBeFalsy();
    if (!res.isError) expect((res.result as { stdout: string }).stdout.trim()).toBe(path.resolve(dir));
  });

  it("command di luar allowlist DITOLAK oleh schema zod", async () => {
    const res = await registry.dispatch("run_command", { command: "powershell", args: [] }, { ...ctx(), requestApproval: async () => true });
    expect(res.isError).toBe(true);
    const res2 = await registry.dispatch("run_command", { command: "rm", args: ["-rf", "/"] }, { ...ctx(), requestApproval: async () => true });
    expect(res2.isError).toBe(true);
  });

  it("approval node ditolak → command tidak jalan", async () => {
    const res = await registry.dispatch("run_command", { command: "node", args: ["-v"] }, { ...ctx(), requestApproval: async () => false });
    expect(res.isError).toBe(true);
    if (res.isError) expect(JSON.stringify(res.result)).toContain("denied");
  });
});

// FLOW user 2026-11 (#7): eksekusi run_command tercatat di log terminal
// (view "Commands" panel terminal, tanpa membuka sesi shell).
describe("run_command → terminal command log", () => {
  it("node -v tercatat (command, args, exitCode, output) di listCommandLog", async () => {
    const { listCommandLog } = await import("../terminal/manager.js");
    const before = listCommandLog(dir).length;
    await registry.dispatch("run_command", { command: "node", args: ["-v"] }, { ...ctx(), requestApproval: async () => true });
    const log = listCommandLog(dir);
    expect(log.length).toBe(before + 1);
    const e = log[log.length - 1]!;
    expect(e.command).toBe("node");
    expect(e.args).toEqual(["-v"]);
    expect(e.exitCode).not.toBe(null);
    expect((e.stdout + e.stderr).length).toBeGreaterThan(0); // output terlihat
  });

  it("ls/echo internal TIDAK menambah log (bukan eksekusi proses)", async () => {
    const { listCommandLog } = await import("../terminal/manager.js");
    const before = listCommandLog(dir).length;
    await registry.dispatch("run_command", { command: "ls", args: [] }, { ...ctx(), requestApproval: async () => true });
    await registry.dispatch("run_command", { command: "echo", args: ["x"] }, { ...ctx(), requestApproval: async () => true });
    expect(listCommandLog(dir).length).toBe(before);
  });
});
