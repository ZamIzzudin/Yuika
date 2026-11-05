// P0-SEC-1 — sandbox container run_command:
//  1. kontrak flag `docker run` (network none, cap, ro-rootfs, mount) — tanpa spawn
//  2. mode routing: docker fail-closed / auto fallback lokal + catatan / off
//  3. timeout → docker kill (bukan cuma CLI)
//  4. redaction tetap jalan di jalur sandbox
// Integrasi Docker NYATA: sandbox-integration.test.ts (gate YUI_SANDBOX_IT=1).
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registry, resetRegistryForTests } from "../registry.js";
import { registerRunCommandTool } from "../tools/run-command.js";
import { sandboxArgv } from "../tools/sandbox.js";
import * as sandboxMod from "../tools/sandbox.js";

let dir: string;
const SAVED = { ...process.env };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-sb-"));
  fs.writeFileSync(path.join(dir, "a.md"), "x");
  resetRegistryForTests();
  registerRunCommandTool();
});

afterEach(() => {
  process.env = { ...SAVED };
  vi.restoreAllMocks();
});

const ctx = () => ({ sessionId: "s1", turnId: "t1", workspacePath: dir, emit: () => {} });
const approve = () => ({ ...ctx(), requestApproval: vi.fn(async () => true) });

describe("P0-SEC-1 sandboxArgv — kontrak flag docker run", () => {
  const argv = sandboxArgv("n1", "node", ["x.js"], "/tmp/ws");

  it("network default-deny", () => {
    expect(argv).toContain("--network");
    expect(argv[argv.indexOf("--network") + 1]).toBe("none");
  });

  it("resource caps: memory / cpus / pids-limit", () => {
    expect(argv[argv.indexOf("--memory") + 1]).toBe("512m");
    expect(argv[argv.indexOf("--cpus") + 1]).toBe("1");
    expect(argv[argv.indexOf("--pids-limit") + 1]).toBe("128");
  });

  it("least privilege: cap-drop ALL + no-new-privileges + rootfs ro + tmpfs noexec", () => {
    expect(argv).toContain("--cap-drop");
    expect(argv[argv.indexOf("--cap-drop") + 1]).toBe("ALL");
    expect(argv).toContain("no-new-privileges");
    expect(argv).toContain("--read-only");
    const t = argv[argv.indexOf("--tmpfs") + 1]!;
    expect(t).toContain("/tmp");
    expect(t).toContain("noexec");
  });

  it("workspace mount rw + workdir /workspace; arg perintah setelah image", () => {
    const m = argv[argv.indexOf("-v") + 1]!;
    expect(m.endsWith(":/workspace:rw")).toBe(true);
    expect(argv[argv.indexOf("-w") + 1]).toBe("/workspace");
    const img = argv.indexOf("node:24-bookworm-slim");
    expect(argv.slice(img)).toEqual(["node:24-bookworm-slim", "node", "x.js"]);
  });

  it("mount path Windows dinormalkan ke forward-slash (execFile tanpa shell)", () => {
    const a2 = sandboxArgv("n2", "node", [], "D:\\proj\\x");
    expect(a2[a2.indexOf("-v") + 1]!.startsWith("D:/proj/x:")).toBe(true);
  });

  it("YUI_SANDBOX_IMAGE menimpa image default", () => {
    process.env.YUI_SANDBOX_IMAGE = "my-sb:latest";
    const a3 = sandboxArgv("n3", "node", [], "/w");
    expect(a3).toContain("my-sb:latest");
    expect(a3).not.toContain("node:24-bookworm-slim");
  });
});

describe("P0-SEC-1 mode routing", () => {
  it("YUI_SANDBOX=off → eksekusi lokal + catatan eksplisit non-isolasi", async () => {
    process.env.YUI_SANDBOX = "off";
    const res = await registry.dispatch("run_command", { command: "node", args: ["-v"] }, approve());
    expect(res.isError).toBeFalsy();
    expect((res.result as Record<string, unknown>).sandbox).toBe(false);
    expect((res.result as Record<string, unknown>).note).toContain("TANPA isolasi");
  });

  it("YUI_SANDBOX=docker + docker tak tersedia → FAIL-CLOSED (error jelas)", async () => {
    process.env.YUI_SANDBOX = "docker";
    vi.spyOn(sandboxMod, "dockerAvailable").mockResolvedValue(false);
    // spawn ENOENT dari mesin tanpa docker CLI (mode docker tak pernah fallback)
    vi.spyOn(sandboxMod, "runInSandbox").mockResolvedValue({
      exitCode: null,
      stdout: "",
      stderr: "[docker] spawn docker ENOENT",
      timedOut: false,
    });
    const res = await registry.dispatch("run_command", { command: "node", args: ["x.js"] }, approve());
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.result)).toContain("sandbox docker gagal");
  });

  it("auto + docker tersedia → jalur sandbox (runInSandbox dipanggil)", async () => {
    process.env.YUI_SANDBOX = "auto";
    vi.spyOn(sandboxMod, "dockerAvailable").mockResolvedValue(true);
    const run = vi
      .spyOn(sandboxMod, "runInSandbox")
      .mockResolvedValue({ exitCode: 0, stdout: "v24.0.0", stderr: "", timedOut: false });
    const res = await registry.dispatch("run_command", { command: "node", args: ["-v"] }, approve());
    expect(run).toHaveBeenCalledOnce();
    expect(res.isError).toBeFalsy();
    expect((res.result as Record<string, unknown>).sandbox).toBe(true);
    expect((res.result as Record<string, unknown>).stdout).toContain("v24.0.0");
  });

  it("sandbox timeout → isError + stderr bertanda timeout", async () => {
    process.env.YUI_SANDBOX = "auto";
    vi.spyOn(sandboxMod, "dockerAvailable").mockResolvedValue(true);
    vi.spyOn(sandboxMod, "runInSandbox").mockResolvedValue({
      exitCode: null,
      stdout: "",
      stderr: "",
      timedOut: true,
    });
    const res = await registry.dispatch("run_command", { command: "node", args: ["loop.js"] }, approve());
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.result)).toContain("timeout");
  });

  it("redaction tetap jalan di jalur sandbox (stdout bocor → disamarkan)", async () => {
    process.env.YUI_SANDBOX = "auto";
    vi.spyOn(sandboxMod, "dockerAvailable").mockResolvedValue(true);
    vi.spyOn(sandboxMod, "runInSandbox").mockResolvedValue({
      exitCode: 0,
      stdout: "token sk-abcdef1234567890abcdef1234567890",
      stderr: "",
      timedOut: false,
    });
    const res = await registry.dispatch("run_command", { command: "node", args: ["x.js"] }, approve());
    expect(JSON.stringify(res.result)).not.toContain("sk-abcdef1234567890");
    expect(JSON.stringify(res.result)).toContain("«redacted»");
  });

  it("approval tetap diminta di jalur sandbox (defense-in-depth)", async () => {
    process.env.YUI_SANDBOX = "auto";
    vi.spyOn(sandboxMod, "dockerAvailable").mockResolvedValue(true);
    vi.spyOn(sandboxMod, "runInSandbox").mockResolvedValue({ exitCode: 0, stdout: "", stderr: "", timedOut: false });
    const requestApproval = vi.fn(async (_t: string, _a: unknown, reason: string) => {
      expect(reason).toContain("sandbox");
      return true;
    });
    await registry.dispatch("run_command", { command: "node", args: ["x.js"] }, { ...ctx(), requestApproval });
    expect(requestApproval).toHaveBeenCalledOnce();
  });

  it("ls/echo tak tersentuh perubahan sandbox (internal, bebas approval)", async () => {
    process.env.YUI_SANDBOX = "docker";
    vi.spyOn(sandboxMod, "dockerAvailable").mockResolvedValue(false);
    const requestApproval = vi.fn(async () => true);
    const ls = await registry.dispatch("run_command", { command: "ls", args: [] }, { ...ctx(), requestApproval });
    const echo = await registry.dispatch("run_command", { command: "echo", args: ["hi"] }, { ...ctx(), requestApproval });
    expect(ls.isError).toBeFalsy();
    expect(echo.isError).toBeFalsy();
    expect(requestApproval).not.toHaveBeenCalled();
  });
});
