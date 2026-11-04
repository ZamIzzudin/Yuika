// @yui/core — skills loader: format SKILL.md agentskills.io-compatible (PLAN §4.4).
// Progressive disclosure: index hanya {name, description}; isi penuh via skill_view.
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

export interface SkillFrontmatter {
  name: string;
  description: string;
  version?: string;
  author?: string;
  platforms?: string[];
  metadata?: { yui?: { tags?: string[]; category?: string; personas?: string[]; status?: string } };
  [k: string]: unknown;
}

export interface SkillIndexEntry {
  name: string;
  description: string;
}

export interface Skill extends SkillIndexEntry {
  frontmatter: SkillFrontmatter;
  body: string;
  dir: string;
  /** P1-DUN-2 lifecycle: draft (hasil sesi) → tested (direview) → ready (siap assign).
   *  Skill seed tanpa status eksplisit = ready. */
  status: "draft" | "tested" | "ready";
  /** Persona pemilik (metadata.yui.personas) — inventory “apa yang persona bisa”. */
  personas: string[];
}

function parseSkillMd(text: string): { frontmatter: SkillFrontmatter; body: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error("SKILL.md tanpa frontmatter");
  const frontmatter = YAML.parse(m[1]!) as SkillFrontmatter;
  if (!frontmatter.name || !frontmatter.description) {
    throw new Error("SKILL.md frontmatter butuh name & description");
  }
  return { frontmatter, body: m[2]!.trim() };
}

export function loadSkill(dir: string): Skill {
  const raw = fs.readFileSync(path.join(dir, "SKILL.md"), "utf-8");
  const { frontmatter, body } = parseSkillMd(raw);
  const rawStatus = frontmatter.metadata?.yui?.status;
  const status = rawStatus === "draft" || rawStatus === "tested" ? rawStatus : "ready";
  return {
    name: frontmatter.name,
    description: frontmatter.description,
    frontmatter,
    body,
    dir,
    status,
    personas: frontmatter.metadata?.yui?.personas ?? [],
  };
}

export function listSkills(skillsDir: string): Skill[] {
  if (!fs.existsSync(skillsDir)) return [];
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    // "drafts" = area antrean P1-MEM-3, bukan skill aktif.
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "drafts")
    .map((d) => path.join(skillsDir, d.name))
    .map(loadSkill)
    .sort((a, b) => a.name.localeCompare(b.name));
}
