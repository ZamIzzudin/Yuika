// D104: kategori skill — semua SKILL.md bawaan wajib berkategori (kosakata
// tetap) dan loader memberi fallback "general" untuk draft tanpa kategori.
import { it, expect, describe } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { listSkills, loadSkill } from "../skills/loader.js";

const VOCAB = new Set([
  "design",
  "planning",
  "software-development",
  "research",
  "data",
  "documents",
  "orchestration",
  "qa",
  "general",
]);

describe("D104 kategori skill", () => {
  it("semua SKILL.md bawaan punya category yang valid", () => {
    const dir = path.join(process.cwd(), "..", "skills");
    const names = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "drafts");
    expect(names.length).toBeGreaterThanOrEqual(48);
    const bad: string[] = [];
    for (const d of names) {
      const s = loadSkill(path.join(dir, d.name));
      if (!VOCAB.has(s.category)) bad.push(`${d.name}: ${s.category}`);
    }
    expect(bad, `kategori di luar kosakata: ${bad.join(", ")}`).toEqual([]);
  });

  it("listSkills mengekspos category; draft tanpa kategori = general", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "yui-cat-"));
    // skill berkategori
    fs.mkdirSync(path.join(tmp, "alpha"));
    fs.writeFileSync(
      path.join(tmp, "alpha", "SKILL.md"),
      "---\nname: alpha\ndescription: \"one\"\nmetadata:\n  yui:\n    status: ready\n    category: design\n---\nbody\n",
    );
    // draft tanpa category (persis format skillMd skill_propose)
    fs.mkdirSync(path.join(tmp, "drafts", "beta"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "drafts", "beta", "SKILL.md"),
      "---\nname: beta\ndescription: \"two\"\nmetadata:\n  yui:\n    status: draft\n---\nbody\n",
    );
    const a = listSkills(tmp);
    expect(a.map((s) => s.category)).toEqual(["design"]);
    const b = loadSkill(path.join(tmp, "drafts", "beta"));
    expect(b.category).toBe("general");
    expect(b.status).toBe("draft");
  });
});
