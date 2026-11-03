// @yui/core — skill lifecycle manager (P1-MEM-3): pengalaman terbukti → skill.
// Alur: agent `skill_propose` → DRAFT di <skillsDir>/drafts/<slug>/SKILL.md
// (metadata.yui.status: draft) → user validasi di tab Skill (edit bebas) →
// Terima = lint (parse ulang frontmatter) + pindah ke <skillsDir>/<slug>/ =
// siap dipakai agent via skills_list/skill_view. Tolak = hapus.
// P1-MEM-4: usage tracking (`.usage.json` per skill: views/patches/used).
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { listSkills, loadSkill, type Skill } from "./loader.js";

export function draftsDir(skillsDir: string): string {
  return path.join(skillsDir, "drafts");
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function skillMd(name: string, description: string, body: string, status: "draft" | "ready", source?: string): string {
  const fm = [
    "---",
    `name: ${name}`,
    `description: ${description.replace(/\n/g, " ")}`,
    "metadata:",
    "  yui:",
    `    status: ${status}`,
    ...(source ? [`    source: "${source.replace(/"/g, "'").slice(0, 120)}"`] : []),
    "---",
    "",
  ].join("\n");
  return fm + body.trim() + "\n";
}

/** Draft baru dari agent. Tolak bila nama sudah dipakai (aktif maupun draft). */
export function proposeSkill(skillsDir: string, name: string, description: string, body: string, source?: string): { dir: string } {
  const slug = slugify(name);
  if (!slug) throw new Error("nama skill kosong setelah disanitasi");
  const taken = new Set([...listSkills(skillsDir).map((s) => slugify(s.name)), ...listDrafts(skillsDir).map((s) => slugify(s.name))]);
  if (taken.has(slug)) throw new Error(`skill '${slug}' sudah ada — usulkan nama lain atau minta user hapus dulu`);
  const dir = path.join(draftsDir(skillsDir), slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), skillMd(name, description, body, "draft", source), "utf-8");
  return { dir };
}

export function listDrafts(skillsDir: string): Skill[] {
  const dd = draftsDir(skillsDir);
  if (!fs.existsSync(dd)) return [];
  return fs
    .readdirSync(dd, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => path.join(dd, d.name))
    .map(loadSkill) // draft yang rusak frontmatter-nya → throw; list per-list (UI handle)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Edit draft (validasi user sebelum terima): tulis ulang SKILL.md dengan status draft. */
export function updateDraft(skillsDir: string, slug: string, name: string, description: string, body: string): void {
  const dir = path.join(draftsDir(skillsDir), slug);
  if (!fs.existsSync(dir)) throw new Error(`draft '${slug}' tidak ditemukan`);
  fs.writeFileSync(path.join(dir, "SKILL.md"), skillMd(name, description, body, "draft"), "utf-8");
  bumpUsage(dir, "patches"); // P1-MEM-4
}

/** Terima draft: lint (parse ulang) + pindah keluar drafts/ → siap dipakai. */
export function acceptDraft(skillsDir: string, slug: string): { name: string } {
  const from = path.join(draftsDir(skillsDir), slug);
  if (!fs.existsSync(from)) throw new Error(`draft '${slug}' tidak ditemukan`);
  const skill = loadSkill(from); // lint v0: frontmatter valid (throw → route 400)
  const to = path.join(skillsDir, slugify(skill.name));
  if (fs.existsSync(to)) throw new Error(`skill aktif '${slugify(skill.name)}' sudah ada`);
  bumpUsage(from, "patches"); // accept = patch final (P1-MEM-4) — ikut pindah folder
  fs.renameSync(from, to);
  // tulis ulang tanpa status draft (siap pakai murni)
  const fm = { ...skill.frontmatter };
  delete (fm.metadata as { yui?: { status?: string } } | undefined)?.yui?.status;
  const meta = fm.metadata as { yui?: Record<string, unknown> } | undefined;
  if (meta?.yui && Object.keys(meta.yui).length === 0) delete fm.metadata;
  const yamlFm = toYaml(fm);
  fs.writeFileSync(path.join(to, "SKILL.md"), `${yamlFm}---\n\n${skill.body}\n`, "utf-8");
  return { name: skill.name };
}

/** Tolak draft: hapus foldernya. */
export function rejectDraft(skillsDir: string, slug: string): void {
  fs.rmSync(path.join(draftsDir(skillsDir), slug), { recursive: true, force: true });
}

// ---- P1-MEM-4: usage tracking per skill (`.usage.json` di folder skill) ----
export interface SkillUsage {
  views: number;
  patches: number;
  used: number;
  updatedAt?: number;
}

function usageFile(dir: string): string {
  return path.join(dir, ".usage.json");
}

export function readUsage(dir: string): SkillUsage {
  try {
    const u = JSON.parse(fs.readFileSync(usageFile(dir), "utf-8")) as Partial<SkillUsage>;
    return { views: u.views ?? 0, patches: u.patches ?? 0, used: u.used ?? 0, updatedAt: u.updatedAt };
  } catch {
    return { views: 0, patches: 0, used: 0 };
  }
}

export function bumpUsage(dir: string, kind: "views" | "patches" | "used"): SkillUsage {
  const u = readUsage(dir);
  u[kind] += 1;
  u.updatedAt = Date.now();
  fs.writeFileSync(usageFile(dir), JSON.stringify(u), "utf-8");
  return u;
}

function toYaml(fm: Record<string, unknown>): string {
  const { name, description, ...rest } = fm as { name: string; description: string };
  const lines = [`name: ${name}`, `description: ${description.replace(/\n/g, " ")}`];
  // YAML.stringify({}) → "{}" (truthy!) — guard pakai jumlah key, bukan string.
  const restYaml = Object.keys(rest).length ? YAML.stringify(rest).trim() : "";
  return `---\n${lines.join("\n")}${restYaml ? `\n${restYaml}` : ""}\n`;
}
