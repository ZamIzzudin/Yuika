// @yuika/core, F2 Persona Forge: persona custom clone-template.
// Persona custom = direktori file di `workspace/personas/custom-*/` dengan
// struktur SAMA seperti built-in (persona.yaml + PERSONA.md + toolsets.yaml +
// skills.yaml + delegation.yaml), jadi loader/prompt/delegation polos tanpa
// jalur khusus. Plafon kekuatan by-construction:
//   - tools = salinan PERSIS toolsets.yaml basis saat forge, jalur update
//     TIDAK menyentuhnya -> custom tidak pernah lebih kuang dari template;
//   - delegation dikunci: can_spawn [] (bukan orchestrator), spawnable_by
//     [user] (hanya user yang bisa memilihnya, Maestro tidak).
// Yang dibentuk user: nama, deskripsi, lapisan prompt (PERSONA.md), pilihan
// skill dari bank (subset nama skill yang valid).
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { CUSTOM_PERSONA_ID_RE, type CreateCustomPersonaRequest, type UpdateCustomPersonaRequest } from "@yuika/contracts";
import { listPersonas, loadPersona, type Persona } from "./loader.js";
import { listSkills } from "../skills/loader.js";
import { clearPersonaRename } from "./rename.js";
import { clearPersonaShape } from "./shapes.js";

/** Direktori persona custom (data user, di dalam workspace). */
export function customPersonasDir(workspacePath: string): string {
  return path.join(workspacePath, "personas");
}

/** Slug id dari nama: "My Coder 2" -> "my-coder-2". */
export function slugifyPersonaName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
  return slug || "persona";
}

function dirOf(workspacePath: string, id: string): string {
  return path.join(customPersonasDir(workspacePath), id);
}

function assertCustomId(id: string): void {
  if (!CUSTOM_PERSONA_ID_RE.test(id)) {
    throw new Error(`bukan id persona custom: ${id} (id custom harus berawalan 'custom-')`);
  }
}

function validateSkills(skillsDir: string, skills: readonly string[]): string[] {
  const trimmed = skills.map((s) => s.trim());
  if (trimmed.some((s) => !s)) throw new Error("skills: empty entry");
  const unique = [...new Set(trimmed)];
  if (unique.length !== trimmed.length) throw new Error("skills: duplicate entry");
  const bank = new Set(listSkills(skillsDir).map((s) => s.name));
  const missing = unique.filter((s) => !bank.has(s));
  if (missing.length > 0) {
    throw new Error(`skill tidak dikenal: ${missing.join(", ")}`);
  }
  return unique;
}

/** Id unik: custom-<slug>, konflik -> custom-<slug>-2, -3, ... */
function uniqueId(workspacePath: string, name: string): string {
  const base = `custom-${slugifyPersonaName(name)}`;
  if (!fs.existsSync(dirOf(workspacePath, base))) return base;
  for (let i = 2; i < 100; i++) {
    const cand = `${base}-${i}`;
    if (!fs.existsSync(dirOf(workspacePath, cand))) return cand;
  }
  throw new Error(`name sudah terpakai terlalu banyak kali: ${name}`);
}

export interface ForgePaths {
  personasDir: string;
  skillsDir: string;
  workspacePath: string;
}

/** Forge persona baru: clone template basis + lapisan user. Return persona
 *  ter-load (manifest tervalidasi). Error EN-friendly via zod + eksplisit. */
export function createCustomPersona(paths: ForgePaths, input: CreateCustomPersonaRequest): Persona {
  const base = listPersonas(paths.personasDir).find((p) => p.manifest.id === input.baseId);
  if (!base) throw new Error(`persona basis tidak dikenal: ${input.baseId}`);
  if (base.manifest.custom) throw new Error("persona basis harus built-in, bukan custom");
  const skills = validateSkills(paths.skillsDir, input.skills);

  const id = uniqueId(paths.workspacePath, input.name);
  const dir = dirOf(paths.workspacePath, id);
  fs.mkdirSync(dir, { recursive: true });

  const manifest = {
    id,
    name: input.name.trim(),
    version: "0.1.0",
    expertise: base.manifest.expertise,
    tags: [...new Set(["custom", ...base.manifest.tags])],
    description: input.description.trim(),
    assets: base.manifest.assets,
    model: base.manifest.model,
    memory: base.manifest.memory,
    custom: true,
    base: base.manifest.id,
  };
  fs.writeFileSync(path.join(dir, "persona.yaml"), YAML.stringify(manifest), "utf-8");
  // Tools terkunci: salinan persis basis. Jalur update tidak menulis file ini.
  fs.writeFileSync(
    path.join(dir, "toolsets.yaml"),
    YAML.stringify({ tools: base.manifest.tools }),
    "utf-8",
  );
  fs.writeFileSync(path.join(dir, "skills.yaml"), YAML.stringify({ bundled: skills, recommended: [] }), "utf-8");
  // Delegation dikunci: bukan orchestrator; hanya user yang bisa memilih.
  fs.writeFileSync(path.join(dir, "delegation.yaml"), YAML.stringify({ can_spawn: [], spawnable_by: ["user"] }), "utf-8");
  fs.writeFileSync(path.join(dir, "PERSONA.md"), input.personaMd, "utf-8");
  return loadPersona(dir);
}

/** Ubah lapisan user (nama/deskripsi/prompt/skills). Tools, basis, id, dan
 *  delegation tidak tersentuh. */
export function updateCustomPersona(paths: ForgePaths, id: string, input: UpdateCustomPersonaRequest): Persona {
  assertCustomId(id);
  const dir = dirOf(paths.workspacePath, id);
  if (!fs.existsSync(dir)) throw new Error(`persona custom tidak ditemukan: ${id}`);
  const skills = validateSkills(paths.skillsDir, input.skills);

  const file = path.join(dir, "persona.yaml");
  const manifest = YAML.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
  manifest.name = input.name.trim();
  manifest.description = input.description.trim();
  fs.writeFileSync(file, YAML.stringify(manifest), "utf-8");
  fs.writeFileSync(path.join(dir, "skills.yaml"), YAML.stringify({ bundled: skills, recommended: [] }), "utf-8");
  fs.writeFileSync(path.join(dir, "PERSONA.md"), input.personaMd, "utf-8");
  return loadPersona(dir);
}

/** Hapus persona custom (built-in ditolak lewat assertCustomId). Override
 *  rename/shape milik id ikut dibersihkan (best-effort). Idempoten. */
export function deleteCustomPersona(paths: ForgePaths, id: string): boolean {
  assertCustomId(id);
  const dir = dirOf(paths.workspacePath, id);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  try {
    clearPersonaRename(paths.workspacePath, id);
    clearPersonaShape(paths.workspacePath, id);
  } catch {
    /* best-effort: override yatim tidak fatal */
  }
  return true;
}
