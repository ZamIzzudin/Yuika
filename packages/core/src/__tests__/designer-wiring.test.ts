// Verifikasi wiring skill+tools designer (bug user: "tidak ada skill penpot").
import { it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { listSkills } from "../skills/loader.js";
import { loadPersona } from "../personas/loader.js";

it("skill penpot-designer-basics ter-load (frontmatter valid)", () => {
  const skills = listSkills(path.join(process.cwd(), "..", "skills"));
  const names = skills.map((s) => s.name);
  expect(names).toContain("penpot-designer-basics");
  const sk = skills.find((s) => s.name === "penpot-designer-basics")!;
  expect(sk.status).toBe("ready");
  expect(sk.personas).toContain("yui-designer");
});

it("persona designer: bundled skills + toolset penpot_* terpasang", () => {
  const p = loadPersona(path.join(process.cwd(), "..", "personas", "yui-designer"));
  expect([...p.manifest.skills.bundled]).toEqual(
    expect.arrayContaining(["penpot-designer-basics", "design-system-basics", "design-to-code-handoff"]),
  );
  expect(p.manifest.tools).toEqual(
    expect.arrayContaining(["penpot_status", "penpot_setup_project", "penpot_create_file", "penpot_update_file", "penpot_get_file"]),
  );
  // template shape live ada di body skill
  expect(sk(p).body).toContain("transformInverse");
  function sk(_p: unknown) {
    const dir = path.join(process.cwd(), "..", "skills", "penpot-designer-basics");
    return { body: fs.readFileSync(path.join(dir, "SKILL.md"), "utf8") };
  }
});
