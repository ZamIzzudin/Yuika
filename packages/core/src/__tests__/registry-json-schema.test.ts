// tool MCP memakai JSON Schema ASLI dari server (t.inputSchema),
// bukan passthrough kosong. Validasi dispatch via ajv (compile-cache);
// toolSchemas meneruskan schema asli ke provider.
import { describe, expect, it, beforeEach } from "vitest";
import { z } from "zod";
import { resetRegistryForTests, registry } from "../registry.js";

const ctx = { sessionId: "s", turnId: "t", workspacePath: "/", emit: () => {}, requestApproval: async () => true } as never;

const WEATHER_SCHEMA = {
  type: "object",
  properties: { city: { type: "string" }, days: { type: "number" } },
  required: ["city"],
  additionalProperties: false,
} as const;

beforeEach(() => {
  resetRegistryForTests();
  registry.register({
    name: "mcp__demo__weather",
    description: "JSON Schema mentah ala MCP",
    parameters: WEATHER_SCHEMA as unknown as Record<string, unknown>,
    handler: async (args: { city: string; days?: number }) => ({ result: `cuaca ${args.city} ${args.days ?? 1} hari` }),
  });
  registry.register({
    name: "internal_zod",
    description: "tool internal tetap zod",
    parameters: z.object({ q: z.string().min(1) }),
    handler: async (args: { q: string }) => ({ result: args.q }),
  });
});

describe("registry: dua jalur schema ()", () => {
  it("dispatch JSON Schema: arg valid lolos, arg tidak valid ditolak dengan issues", async () => {
    const ok = await registry.dispatch("mcp__demo__weather", { city: "Bandung", days: 3 }, ctx);
    expect(ok.isError).toBeFalsy();
    expect(ok.result).toContain("Bandung");

    const bad = await registry.dispatch("mcp__demo__weather", { days: 3 }, ctx); // city wajib hilang
    expect(bad.isError).toBe(true);
    expect(JSON.stringify(bad.result)).toContain("invalid args");

    const badType = await registry.dispatch("mcp__demo__weather", { city: 123 }, ctx); // type salah
    expect(badType.isError).toBe(true);
  });

  it("toolSchemas meneruskan JSON Schema asli (bukan passthrough kosong)", () => {
    const schemas = registry.toolSchemas();
    const mcp = schemas.find((s) => s.name === "mcp__demo__weather")!;
    expect(mcp.parameters).toEqual({ ...WEATHER_SCHEMA }); // bentuk asli sampai ke provider
    const internal = schemas.find((s) => s.name === "internal_zod")!;
    expect(internal.parameters).toHaveProperty("properties", { q: expect.anything() }); // zod → dikonversi
  });

  it("validasi dispatch zod tetap jalan untuk tool internal", async () => {
    const ok = await registry.dispatch("internal_zod", { q: "halo" }, ctx);
    expect(ok.result).toBe("halo");
    const bad = await registry.dispatch("internal_zod", { q: "" }, ctx);
    expect(bad.isError).toBe(true);
  });
});

describe("registry: draft 2020-12 (fix iterasi putus)", () => {
  // Bug berulang: schema MCP zod v4 menyatakan $schema 2020-12 (numeric
  // exclusiveMinimum) → ajv draft-07 "no schema with key or ref". REGRESI.
  const SCHEMA_2020 = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      n: { type: "number", exclusiveMinimum: 0 },
      mode: { const: "fast" },
    },
    required: ["n"],
    additionalProperties: false,
  } as const;

  const SCHEMA_07 = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: { n: { type: "number", minimum: 1, exclusiveMinimum: true } },
    required: ["n"],
  } as const;

  beforeEach(() => {
    registry.register({
      name: "mcp__mod__d2020",
      description: "schema 2020-12",
      parameters: SCHEMA_2020 as unknown as Record<string, unknown>,
      handler: async (args: { n: number }) => ({ result: args.n }),
    });
    registry.register({
      name: "mcp__mod__d07",
      description: "schema draft-07 boolean exclusiveMinimum",
      parameters: SCHEMA_07 as unknown as Record<string, unknown>,
      handler: async (args: { n: number }) => ({ result: args.n }),
    });
  });

  it("schema $schema 2020-12: compile & validasi benar (angka valid lolos, tidak valid ditolak)", async () => {
    const ok = await registry.dispatch("mcp__mod__d2020", { n: 5, mode: "fast" }, ctx);
    expect(ok.isError).toBeFalsy();
    expect(ok.result).toBe(5);

    const bad = await registry.dispatch("mcp__mod__d2020", { n: 0 }, ctx); // exclusiveMinimum 0
    expect(bad.isError).toBe(true);
    const badConst = await registry.dispatch("mcp__mod__d2020", { n: 1, mode: "slow" }, ctx);
    expect(badConst.isError).toBe(true);
  });

  it("schema draft-07 (exclusiveMinimum boolean) tetap jalan", async () => {
    const ok = await registry.dispatch("mcp__mod__d07", { n: 2 }, ctx);
    expect(ok.isError).toBeFalsy();
    const bad = await registry.dispatch("mcp__mod__d07", { n: 1 }, ctx); // exclusiveMinimum true
    expect(bad.isError).toBe(true);
  });

  it("schema tanpa $schema (hybrid) tetap aman", async () => {
    registry.register({
      name: "mcp__mod__noschema",
      description: "tanpa $schema",
      parameters: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
      handler: async (args: { x: string }) => ({ result: args.x }),
    });
    const ok = await registry.dispatch("mcp__mod__noschema", { x: "hi" }, ctx);
    expect(ok.result).toBe("hi");
    const bad = await registry.dispatch("mcp__mod__noschema", {}, ctx);
    expect(bad.isError).toBe(true);
  });
});
