// P0-MCP-2: tool MCP memakai JSON Schema ASLI dari server (t.inputSchema) —
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

describe("registry: dua jalur schema (P0-MCP-2)", () => {
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
