// D99: verifikasi pretrain docs/skills ter-bind bawaan per persona.
import { it, expect } from "vitest";
import path from "node:path";
import { listSkills } from "../skills/loader.js";
import { loadPersona } from "../personas/loader.js";

const root = (rel: string) => path.join(process.cwd(), "..", rel);

const BIND = {
  "yui-planner": ["product-manager-toolkit", "prd-writing", "issue-breakdown", "triage", "customer-journey-map", "wayfinder-planning", "workflow-grilling", "ai-product-strategy"],
  "yui-conductor": ["agent-handoff", "review-loop"],
  "yui-scribe": ["copywriting", "doc-coauthoring", "docx-documents", "pdf-documents"],
  "yui-analyst": ["xlsx-spreadsheets", "data-visualization", "diagram-design"],
  "yui-scholar": ["source-research", "user-research", "web-scraping"],
  "yui-coder": ["llm-product-engineering"],
  "yui-sherlock": ["eval-audit"],
} as const;

it("D99: skill pretrain docs/skills ter-load valid (frontmatter, tanpa em dash)", () => {
  const skills = listSkills(root("skills"));
  const byName = new Map(skills.map((s) => [s.name, s]));
  for (const list of Object.values(BIND)) {
    for (const name of list) {
      const sk = byName.get(name);
      expect(sk, name).toBeDefined();
      expect(sk!.status).toBe("ready");
      expect(sk!.body.length).toBeGreaterThan(500);
      expect(sk!.body).not.toMatch(/[\u2014\u2013]/);
    }
  }
});

it("D99: binding persona memuat pretrain dan tidak bocor antar persona", () => {
  for (const [persona, list] of Object.entries(BIND)) {
    const m = loadPersona(root("personas/" + persona)).manifest;
    for (const name of list) expect(m.skills.bundled, persona).toContain(name);
  }
  // pembagian sadar: skill dokumen milik scribe, bukan analyst; scraping milik scholar
  const scribe = loadPersona(root("personas/yui-scribe")).manifest.skills.bundled;
  expect(scribe).not.toContain("xlsx-spreadsheets");
  const scholar = loadPersona(root("personas/yui-scholar")).manifest.skills.bundled;
  expect(scholar).not.toContain("copywriting");
});
