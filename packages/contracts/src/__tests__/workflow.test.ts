// workflow.yaml: schema zod + normalisasi + lint + template 7 fase.
// Acceptance: template valid parse & lint (errors kosong); aturan struktural
// (id unik, depends_on valid, siklus, persona roster) teruji.
import { describe, expect, it } from "vitest";
import {
  lintWorkflow,
  loadWorkflowYaml,
  normalizeWorkflowDef,
  SEVEN_PHASE_TEMPLATE_YAML,
  WorkflowDef,
} from "../workflow.js";

const PERSONAS = [
  "yui-conductor", "yui-scholar", "yui-scribe", "yui-coder",
  "yui-designer", "yui-analyst", "yui-operator", "yui-planner",
];

describe(", template 7 fase", () => {
  it("parse & lint hijau (termasuk cek roster persona)", () => {
    const def = loadWorkflowYaml(SEVEN_PHASE_TEMPLATE_YAML);
    expect(def.phases.map((p) => p.id)).toEqual([
      "planning", "research", "design", "develop", "testing", "documentation", "delivery",
    ]);
    const lint = lintWorkflow(def, { personas: PERSONAS });
    expect(lint.errors).toEqual([]);
    expect(lint.warnings).toEqual([]); // gate fase terakhir = false → tanpa warning
  });
});

describe("normalisasi default", () => {
  it("step id & gate & depends_on terisi", () => {
    const def = WorkflowDef.parse({
      name: "x",
      phases: [{ id: "a", name: "A", mode: "sequential", steps: [{ persona: "yui-coder", task: "t" }] }],
    });
    const n = normalizeWorkflowDef(def);
    expect(n.phases[0]!.gate).toBe(true);
    expect(n.phases[0]!.steps[0]).toMatchObject({ id: "s1", depends_on: [] });
  });
});

describe("lint, aturan struktural", () => {
  const base = (phases: unknown[]) => WorkflowDef.parse({ name: "x", phases });

  it("phase id duplikat → error", () => {
    const lint = lintWorkflow(
      base([
        { id: "a", name: "A", mode: "sequential", steps: [{ persona: "yui-coder", task: "t" }] },
        { id: "a", name: "A2", mode: "sequential", steps: [{ persona: "yui-coder", task: "t" }] },
      ]),
    );
    expect(lint.errors).toContain('phase id duplikat: "a"');
  });

  it("depends_on tidak dikenal → error", () => {
    const lint = lintWorkflow(
      base([
        { id: "a", name: "A", mode: "parallel", steps: [
          { persona: "yui-coder", task: "t", depends_on: ["nope"] },
        ] }],
      ),
    );
    expect(lint.errors.some((e) => e.includes('depends_on "nope" tidak dikenal'))).toBe(true);
  });

  it("siklus depends_on → error (A→B→A dan self-loop)", () => {
    const lint = lintWorkflow(
      base([
        { id: "a", name: "A", mode: "parallel", steps: [
          { id: "A", persona: "yui-coder", task: "t", depends_on: ["B"] },
          { id: "B", persona: "yui-coder", task: "t", depends_on: ["A"] },
          { id: "C", persona: "yui-coder", task: "t", depends_on: ["C"] },
        ] }],
      ),
    );
    expect(lint.errors.some((e) => e.includes("siklus depends_on"))).toBe(true);
    expect(lint.errors.some((e) => e.includes("depends_on diri sendiri"))).toBe(true);
  });

  it("persona di luar roster → error (bila roster diberikan)", () => {
    const lint = lintWorkflow(
      base([{ id: "a", name: "A", mode: "sequential", steps: [{ persona: "stranger", task: "t" }] }]),
      { personas: PERSONAS },
    );
    expect(lint.errors.some((e) => e.includes('persona "stranger" tidak ada di roster'))).toBe(true);
    expect(lintWorkflow(base([{ id: "a", name: "A", mode: "sequential", steps: [{ persona: "stranger", task: "t" }] }])).errors).toEqual([]);
  });

  it("max_concurrent di fase sequential → warning; gate fase terakhir → warning", () => {
    const lint = lintWorkflow(
      base([{ id: "a", name: "A", mode: "sequential", steps: [{ persona: "yui-coder", task: "t", max_concurrent: 2 }] }]),
    );
    expect(lint.warnings.some((w) => w.includes("max_concurrent diabaikan"))).toBe(true);
    const lint2 = lintWorkflow(
      base([{ id: "a", name: "A", mode: "sequential", steps: [{ persona: "yui-coder", task: "t" }], gate: true }]),
    );
    expect(lint2.warnings.some((w) => w.includes("gate fase terakhir tidak berpengaruh"))).toBe(true);
  });
});

describe("loader YAML", () => {
  it("YAML cacat → pesan error memuat path field", () => {
    expect(() => loadWorkflowYaml("name: x\nphases:\n  - id: A\n    mode: parallel\n    steps: []")).toThrow(/workflow\.yaml tidak valid/);
  });
  it("YAML non-object → error", () => {
    expect(() => loadWorkflowYaml("- a\n- b")).toThrow(/workflow\.yaml tidak valid/);
  });
});
