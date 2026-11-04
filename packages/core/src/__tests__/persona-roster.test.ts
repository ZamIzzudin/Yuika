// P1-PER-6: roster D9 = 7 persona — manifest valid, delegation rules koheren
// (semua id yang dirujuk ada — mencegah typo seperti `yui_designer`), dan
// toolset persona baru (Analyst/Operator) ekspos tool yang terdaftar.
import { describe, expect, it } from "vitest";
import path from "node:path";
import { listPersonas } from "../personas/loader.js";
import { registry } from "../registry.js";

const personasDir = path.resolve(__dirname, "../../../../packages/personas");

describe("persona roster D9 (P1-PER-6)", () => {
  const personas = listPersonas(personasDir);
  const ids = personas.map((p) => p.manifest.id);

  it("7 persona ter-load: conductor + 6 spesialis (termasuk Analyst & Operator)", () => {
    expect(ids.sort()).toEqual(["yui-analyst", "yui-coder", "yui-conductor", "yui-designer", "yui-operator", "yui-scholar", "yui-scribe"]);
    expect(personas.every((p) => p.manifest.description.length <= 120)).toBe(true); // kontrak zod memaksa, guard tipologi
  });

  it("delegation rules koheren — semua id di can_spawn/spawnable_by dikenal (atau 'user')", () => {
    const known = new Set([...ids, "user"]);
    for (const p of personas) {
      for (const id of p.manifest.delegation.can_spawn) expect(known.has(id), `${p.manifest.id} can_spawn → ${id} tidak dikenal`).toBe(true);
      for (const id of p.manifest.delegation.spawnable_by) expect(known.has(id), `${p.manifest.id} spawnable_by → ${id} tidak dikenal`).toBe(true);
    }
    // conductor bisa mem-spawn SEMUA spesialis (orkestrator penuh)
    const conductor = personas.find((p) => p.manifest.id === "yui-conductor")!;
    for (const spec of ids.filter((i) => i !== "yui-conductor")) {
      expect(conductor.manifest.delegation.can_spawn).toContain(spec);
    }
  });

  it("Analyst: dokumen data + run_command; Operator: terminal + MCP wildcard", () => {
    const analyst = personas.find((p) => p.manifest.id === "yui-analyst")!;
    expect(analyst.manifest.tools).toContain("doc_read");
    expect(analyst.manifest.tools).toContain("run_command");
    const operator = personas.find((p) => p.manifest.id === "yui-operator")!;
    expect(operator.manifest.tools).toContain("run_command");
    expect(operator.manifest.tools).toContain("mcp__*");
  });
});
