// assign gating, readiness = inventory skill persona per fase.
import { describe, expect, it } from "vitest";
import { RosterEntry } from "@yuika/contracts";
import { computeReadiness, PHASE_CATEGORIES } from "../project/readiness.js";

const entry = (personaId: string, phases: RosterEntry["phases"]): RosterEntry => ({ personaId, role: "peran", phases, mcp: [] });

const SKILLS = [
  { name: "web-research", category: "research", personas: ["yui-scholar"], status: "ready" as const },
  { name: "design-system-basics", category: "design", personas: ["yui-designer"], status: "tested" as const }, // tested = siap
  { name: "report-writing", category: "productivity", personas: ["yui-scribe"], status: "ready" as const },
  { name: "draft-thing", category: "research", personas: ["yui-scholar"], status: "draft" as const }, // draft TIDAK dihitung
  { name: "phaser-basics", category: "research", personas: ["yui-scholar"], status: "tested" as const },
];

describe("computeReadiness ()", () => {
  it("persona siap bila tiap fase gated-nya punya skill tested/ready milik dia", () => {
    const scholar = computeReadiness([entry("yui-scholar", ["research", "documentation"])], SKILLS)[0]!;
    expect(scholar.ready).toBe(false); // documentation: tidak ada skill productivity milik scholar
    const research = scholar.phases.find((p) => p.phase === "research")!;
    expect(research.ready).toBe(true);
    expect(research.skills).toContain("web-research");
    expect(research.skills).not.toContain("draft-thing"); // draft tak dihitung
    expect(scholar.phases.find((p) => p.phase === "documentation")!.ready).toBe(false);
  });

  it("fase inti (planning/delivery) tanpa gating; tested dihitung siap; persona lain tak kebagian skill scholar", () => {
    const conductor = computeReadiness([entry("yui-conductor", ["planning", "delivery", "research"])], SKILLS)[0]!;
    expect(conductor.phases.find((p) => p.phase === "planning")!.ready).toBe(true); // inti
    expect(conductor.phases.find((p) => p.phase === "research")!.ready).toBe(false); // skill milik scholar
    expect(conductor.ready).toBe(false);
    const designer = computeReadiness([entry("yui-designer", ["design"])], SKILLS)[0]!;
    expect(designer.ready).toBe(true); // tested = siap
  });

  it("peta fase mencakup fase workflow; testing digating kategori qa/testing", () => {
    expect(Object.keys(PHASE_CATEGORIES).sort()).toEqual(["design", "develop", "documentation", "research", "testing"]);
  });
});
