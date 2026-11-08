import { describe, expect, it, vi } from "vitest";
import { registry, resetRegistryForTests, normalizeToolSchema } from "../registry.js";
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

  it("schema tool tidak memancarkan exclusiveMinimum/Maximum boolean (GLM 1210)", () => {
    resetRegistryForTests();
    registry.register({
      name: "schema_test",
      description: "uji normalisasi",
      parameters: z.object({
        n: z.number().int().positive().max(100).default(5), // zod → exclusiveMinimum/Maximum: true
        nested: z.object({ m: z.number().positive() }).optional(),
      }),
      handler: async () => ({ result: null }),
    });
    const dump = JSON.stringify(registry.toolSchemas());
    // bentuk boolean draft-04 dilarang (GLM menolak dengan 400/1210)
    expect(dump).not.toContain('"exclusiveMinimum":true');
    expect(dump).not.toContain('"exclusiveMaximum":true');
    // zod v4 z.toJSONSchema(draft-7): .positive() → exclusiveMinimum ANGKA (bukan
    // boolean); .max() inklusif → maximum biasa. Guard utama = tidak ada bentuk
    // boolean; bentuk angka dicek apa adanya.
    const n = (registry.toolSchemas()[0]!.parameters as any).properties.n;
    expect(n.exclusiveMinimum).toBe(0);
    expect(n.maximum).toBe(100); // .max() inklusif, tetap maximum biasa
    expect(n.exclusiveMaximum).toBeUndefined();
    // cabang exclusiveMaximum/exclusiveMinimum bentuk angka & nested, diuji langsung
    const norm = normalizeToolSchema({
      a: { minimum: 5, exclusiveMinimum: true },
      b: { maximum: 9, exclusiveMaximum: true },
      c: { exclusiveMinimum: false },
      nested: { items: { minimum: 1, exclusiveMinimum: true } },
    }) as any;
    expect(norm.a).toEqual({ exclusiveMinimum: 5 });
    expect(norm.b).toEqual({ exclusiveMaximum: 9 });
    expect(norm.c).toEqual({});
    expect(norm.nested.items).toEqual({ exclusiveMinimum: 1 });
  });
});
