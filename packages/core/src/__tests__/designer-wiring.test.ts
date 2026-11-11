// Verifikasi wiring skill+tools designer (P3-CANVAS: jalur embedded).
import { it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { listSkills } from "../skills/loader.js";
import { loadPersona } from "../personas/loader.js";

const root = (rel: string) => path.join(process.cwd(), "..", rel);

it("skill design-canvas-basics ter-load (frontmatter valid)", () => {
  const skills = listSkills(root("skills"));
  const names = skills.map((s) => s.name);
  expect(names).toContain("design-canvas-basics");
  expect(names).not.toContain("penpot-designer-basics");
  const sk = skills.find((s) => s.name === "design-canvas-basics")!;
  expect(sk.status).toBe("ready");
  expect(sk.personas).toContain("yui-designer");
});

it("persona designer: bundled skills + toolset design_* terpasang", () => {
  const p = loadPersona(root("personas/yui-designer"));
  expect([...p.manifest.skills.bundled]).toEqual(
    expect.arrayContaining(["design-canvas-basics", "design-system-basics", "design-to-code-handoff"]),
  );
  expect(p.manifest.tools).toEqual(
    expect.arrayContaining([
      "design_list",
      "design_create_file",
      "design_add_page",
      "design_add_shape",
      "design_update_shape",
      "design_delete_shape",
      "design_get_file",
    ]),
  );
  expect(p.manifest.tools).not.toContain("penpot_status");
  const body = fs.readFileSync(root("skills/design-canvas-basics/SKILL.md"), "utf8");
  expect(body).toContain("parentId");
  expect(body).toContain("design_update_shape");
});
