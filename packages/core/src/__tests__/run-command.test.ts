// W3-A2 (TASKS.md): run_command — allowlist ketat + SELALU approval.
import { describe, expect, it, beforeEach, vi } from "vitest";
import { registry, resetRegistryForTests } from "../registry.js";
import { registerRunCommandTool } from "../tools/run-command.js";

const baseCtx = {
  sessionId: "s1",
  turnId: "t1",
  workspacePath: "/tmp",
  emit: () => {},
};

beforeEach(() => {
  resetRegistryForTests();
  registerRunCommandTool();
});

describe("run_command", () => {
  it("SELALU minta approval — bahkan untuk command allowlist", async () => {
    const requestApproval = vi.fn(async () => true);
    const res = await registry.dispatch("run_command", { command: "node", args: ["-v"] }, { ...baseCtx, requestApproval });
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(res.isError).toBeFalsy();
    if (!res.isError) expect((res.result as { stdout: string }).stdout).toMatch(/v\d+/);
  });

  it("command di luar allowlist DITOLAK oleh schema zod", async () => {
    const res = await registry.dispatch("run_command", { command: "powershell", args: [] }, { ...baseCtx, requestApproval: async () => true });
    expect(res.isError).toBe(true);
    const res2 = await registry.dispatch("run_command", { command: "rm", args: ["-rf", "/"] }, { ...baseCtx, requestApproval: async () => true });
    expect(res2.isError).toBe(true);
  });

  it("approval ditolak → command tidak jalan", async () => {
    const res = await registry.dispatch("run_command", { command: "node", args: ["-v"] }, { ...baseCtx, requestApproval: async () => false });
    expect(res.isError).toBe(true);
    if (res.isError) expect(JSON.stringify(res.result)).toContain("denied");
  });
});
