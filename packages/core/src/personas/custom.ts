// @yuika/core, F2 Persona Forge: persona custom - persona BARU di luar
// 9 built-in (Mary jadi persona ke-10). Bukan clone: user membentuk sendiri
// identitas, lapisan prompt (PERSONA.md), pilihan NATIVE FUNCTIONS (terminal,
// browser, design, dll - di luar workflow), dan skill dari bank.
// Struktur file SAMA seperti built-in (persona.yaml + PERSONA.md +
// toolsets.yaml + skills.yaml + delegation.yaml) di workspace/personas/,
// jadi loader/prompt/growth polos tanpa jalur khusus.
// Batas by-construction (persona custom = pelaksana mandiri, bukan
// orchestrator): tools HARUS dari CUSTOM_ALLOWED_TOOLS (delegate_task/
// consult/mcp__* tidak termasuk), delegation.yaml terkunci (can_spawn [],
// spawnable_by [user] - hanya user yang bisa memilihnya).
// Share: exportPersona/importPersona = file JSON divalidasi penuh ulang.
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  CUSTOM_ALLOWED_TOOLS,
  CUSTOM_PERSONA_ID_RE,
  PERSONA_SHARE_FORMAT,
  type CreateCustomPersonaRequest,
  type PersonaShareFile,
  type UpdateCustomPersonaRequest,
} from "@yuika/contracts";
import { loadPersona, type Persona } from "./loader.js";
import { listSkills } from "../skills/loader.js";
import { clearPersonaRename } from "./rename.js";
import { clearPersonaShape } from "./shapes.js";

/** Direktori persona custom (data user, di dalam workspace). */
export function customPersonasDir(workspacePath: string): string {
  return path.join(workspacePath, "personas");
}

/** Template ringan utk prompt layer baru (prefill UI; server tak memaksakan). */
export const NEW_PERSONA_MD_TEMPLATE = (name: string): string =>
  [
    `# ${name}, Persona Layer`,
    "",
    "## Who you are",
    "",
    `You are ${name}, a member of the Yui team. Describe your specialty, tone,`,
    "and how you prefer to work.",
    "",
    "## How you work",
    "",
    "1. First rule of how you operate.",
    "2. Second rule (files, tools, verification habits).",
    "3. How you report results back to the user.",
    "",
  ].join("\n");

/** Slug id dari nama: "Mary Stone" -> "mary-stone". */
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

/** Validasi + normalisasi skills: harus nama skill di bank, tanpa duplikat. */
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

/** Validasi + normalisasi native functions: hanya dari katalog yang diizinkan. */
function validateTools(tools: readonly string[]): string[] {
  const unique = [...new Set(tools.map((t) => t.trim()).filter(Boolean))];
  if (unique.length === 0) throw new Error("tools: pilih minimal satu native function");
  const allowed = new Set(CUSTOM_ALLOWED_TOOLS);
  const bad = unique.filter((t) => !allowed.has(t));
  if (bad.length > 0) {
    throw new Error(`tool tidak diizinkan untuk persona custom: ${bad.join(", ")}`);
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

function writePersonaFiles(
  dir: string,
  input: { name: string; description: string; personaMd: string; tools: string[]; skills: string[]; id: string },
  extra?: Record<string, unknown>,
): void {
  fs.mkdirSync(dir, { recursive: true });
  const manifest = {
    id: input.id,
    name: input.name.trim(),
    version: "0.1.0",
    expertise: "custom",
    tags: ["custom"],
    description: input.description.trim(),
    assets: {
      portrait: null,
      riv: null,
      expressions: ["idle", "thinking", "working", "awaiting_input", "done", "error", "celebrating"],
    },
    model: { primary: { quality: "high" }, aux: { quality: "low" } },
    memory: { domain: "custom", learn: true },
    custom: true,
    ...extra,
  };
  fs.writeFileSync(path.join(dir, "persona.yaml"), YAML.stringify(manifest), "utf-8");
  fs.writeFileSync(path.join(dir, "toolsets.yaml"), YAML.stringify({ tools: input.tools }), "utf-8");
  fs.writeFileSync(path.join(dir, "skills.yaml"), YAML.stringify({ bundled: input.skills, recommended: [] }), "utf-8");
  // Delegation DIKUNCI: persona custom bukan orchestrator; hanya user yang
  // bisa memilihnya (Maestro tidak melihatnya sebagai opsi spawn).
  fs.writeFileSync(path.join(dir, "delegation.yaml"), YAML.stringify({ can_spawn: [], spawnable_by: ["user"] }), "utf-8");
  fs.writeFileSync(path.join(dir, "PERSONA.md"), input.personaMd, "utf-8");
}

/** Buat persona custom baru. Return persona ter-load (manifest tervalidasi). */
export function createCustomPersona(paths: ForgePaths, input: CreateCustomPersonaRequest): Persona {
  const tools = validateTools(input.tools);
  const skills = validateSkills(paths.skillsDir, input.skills);
  const id = uniqueId(paths.workspacePath, input.name);
  const dir = dirOf(paths.workspacePath, id);
  writePersonaFiles(dir, { ...input, tools, skills, id });
  return loadPersona(dir);
}

/** Ubah semua lapisan user (identitas/prompt/tools/skills). Id & delegation
 *  tidak tersentuh. */
export function updateCustomPersona(paths: ForgePaths, id: string, input: UpdateCustomPersonaRequest): Persona {
  assertCustomId(id);
  const dir = dirOf(paths.workspacePath, id);
  if (!fs.existsSync(dir)) throw new Error(`persona custom tidak ditemukan: ${id}`);
  const tools = validateTools(input.tools);
  const skills = validateSkills(paths.skillsDir, input.skills);

  const file = path.join(dir, "persona.yaml");
  const manifest = YAML.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
  manifest.name = input.name.trim();
  manifest.description = input.description.trim();
  fs.writeFileSync(file, YAML.stringify(manifest), "utf-8");
  fs.writeFileSync(path.join(dir, "toolsets.yaml"), YAML.stringify({ tools }), "utf-8");
  fs.writeFileSync(path.join(dir, "skills.yaml"), YAML.stringify({ bundled: skills, recommended: [] }), "utf-8");
  fs.writeFileSync(path.join(dir, "PERSONA.md"), input.personaMd, "utf-8");
  return loadPersona(dir);
}

/** Export persona custom jadi file share (JSON, divalidasi penuh saat
 *  di-import di install lain). */
export function exportPersona(paths: ForgePaths, id: string): PersonaShareFile {
  assertCustomId(id);
  const dir = dirOf(paths.workspacePath, id);
  if (!fs.existsSync(dir)) throw new Error(`persona custom tidak ditemukan: ${id}`);
  const p = loadPersona(dir);
  return {
    format: PERSONA_SHARE_FORMAT,
    version: 1,
    name: p.manifest.name,
    description: p.manifest.description,
    personaMd: p.personaMd,
    tools: p.manifest.tools,
    skills: p.manifest.skills.bundled,
  };
}

/** Import file share persona -> persona custom baru (id baru dari nama;
 *  konflik -> suffix). Semua validasi create berlaku ulang. */
export function importPersona(paths: ForgePaths, file: PersonaShareFile): Persona {
  return createCustomPersona(paths, {
    name: file.name,
    description: file.description,
    personaMd: file.personaMd,
    tools: file.tools,
    skills: file.skills,
    ...(file.shape ? { shape: file.shape } : {}),
  });
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
