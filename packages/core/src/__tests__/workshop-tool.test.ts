// P2-WKS-4 — tool run_in_workshop: absent → error + hint (workshop dibuka
// user), running → exec by persona + output ter-redact.
import { beforeEach, describe, expect, it } from "vitest";
import { resetRegistryForTests, registry } from "../registry.js";
import { registerWorkshopTool } from "../tools/workshop-tool.js";
import type { WorkshopManager } from "../workshop/manager.js";

function ctx(projectId: string | null = "p_wt") {
  return {
    sessionId: "s1",
    turnId: "t1",
    workspacePath: "/tmp",
    personaId: "yui-coder",
    ...(projectId ? { projectId } : {}),
    emit: () => undefined,
    requestApproval: async () => true,
  };
}

let execCalls: Array<{ pid: string; by: string; cmd: string }> = [];

beforeEach(() => {
  execCalls = [];
  resetRegistryForTests();
});

function wireManager(state: "absent" | "running" | "asleep") {
  const m = {
    info: (pid: string) => ({
      projectId: pid, state, containerName: "yuika-ws-p_wt", volumeName: "vol",
      backend: "docker" as const, createdAt: 1, lastWakeAt: null, lastSleepAt: null,
      uptimeMs: 0, egressAllow: [], resourceCap: { memory: "2g", cpus: "2", pidsLimit: 512 },
    }),
    exec: async (pid: string, cmd: string, args: string[], opts: { by?: string }) => {
      execCalls.push({ pid, by: opts.by ?? "?", cmd: [cmd, ...args].join(" ") });
      return { exitCode: 0, stdout: `out ${cmd}`, stderr: "", durationMs: 3 };
    },
  } as unknown as WorkshopManager;
  registerWorkshopTool({ manager: () => m });
}

describe("run_in_workshop (P2-WKS-4)", () => {
  it("workshop absent → isError + hint minta user buka panel", async () => {
    wireManager("absent");
    const r = await registry.dispatch("run_in_workshop", { cmd: "node", args: ["-v"] }, ctx());
    expect(r.isError).toBe(true);
    expect((r.result as { hint: string }).hint).toContain("Workshop panel");
    expect(execCalls).toHaveLength(0);
  });

  it("workshop running → exec dengan by persona:<id> + state dikembalikan", async () => {
    wireManager("running");
    const r = await registry.dispatch("run_in_workshop", { cmd: "npm", args: ["ls"] }, ctx());
    expect(r.isError).toBeFalsy();
    expect(execCalls).toEqual([{ pid: "p_wt", by: "persona:yui-coder", cmd: "npm ls" }]);
    expect((r.result as { workshop: string }).workshop).toBe("running");
  });

  it("tanpa projectId → error jelas", async () => {
    wireManager("running");
    const r = await registry.dispatch("run_in_workshop", { cmd: "ls" }, ctx(null));
    expect(r.isError).toBe(true);
    expect((r.result as { error: string }).error).toContain("project");
  });
});
