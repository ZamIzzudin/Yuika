import { describe, expect, it, vi } from "vitest";
import { registry, resetRegistryForTests } from "../registry.js";
import { z } from "zod";

const echoSchema = z.object({ text: z.string() });

function registerEcho(approval?: (args: { text: string }) => string | null) {
  registry.register({
    name: "echo_test",
    description: "test tool",
    parameters: echoSchema,
    approvalPolicy: approval,
    handler: async (args: { text: string }) => ({ result: { echoed: args.text } }),
  });
}

const ctx = {
  sessionId: "s1",
  turnId: "t1",
  workspacePath: "/tmp",
  emit: () => {},
  requestApproval: async () => true,
};

describe("registry", () => {
  it("dispatch valid + invalid args", async () => {
    resetRegistryForTests();
    registerEcho();
    const ok = await registry.dispatch("echo_test", { text: "halo" }, ctx);
    expect(ok).toEqual({ result: { echoed: "halo" } });
    const bad = await registry.dispatch("echo_test", { text: 123 }, ctx);
    expect(bad.isError).toBe(true);
  });

  it("approval denied → isError tanpa handler jalan", async () => {
    resetRegistryForTests();
    const handler = vi.fn(async () => ({ result: {} }));
    registry.register({
      name: "danger_test",
      description: "needs approval",
      parameters: z.object({}),
      approvalPolicy: () => "selalu",
      handler,
    });
    const res = await registry.dispatch("danger_test", {}, { ...ctx, requestApproval: async () => false });
    expect(res.isError).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it("toolset filter dengan wildcard mcp__*", () => {
    resetRegistryForTests();
    registerEcho();
    const schemas = registry.toolSchemas(["mcp__*", "echo_test"]);
    expect(schemas.map((s) => s.name)).toContain("echo_test");
    expect(registry.toolSchemas(["mcp__*"]).map((s) => s.name)).not.toContain("echo_test");
  });
});
