// @yui/core — mapping skill → persona manual (feedback user dev-10: "di menu
// dungeon, pilih persona lalu attach skill yang sudah ada secara mandiri").
// Sumber binding TIGA lapis: (1) bawaan persona `skills.yaml` (bundled),
// (2) lampiran manual user di `skill-bindings.json` (attached), (3) lepas
// manual (detached — bisa melepas bawaan juga).
//   effective = (bundled ∪ attached ∪ global) \ detached
// Persist file JSON di data/ (pola model-prices/approval-mode) — survive
// restart. Dipakai createSessionWithPrompt: skill attached masuk INDEX prompt
// sesi baru (progressive disclosure — tetap bukan tool; skill_view tetap bisa
// membaca skill apa pun tanpa binding).
import fs from "node:fs";
import path from "node:path";

export interface SkillBinding {
  attached: string[];
  detached: string[];
}
export type SkillBindingsFile = Record<string, SkillBinding>;

export function loadSkillBindings(file: string): SkillBindingsFile {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as SkillBindingsFile;
    const out: SkillBindingsFile = {};
    for (const [pid, b] of Object.entries(raw)) {
      if (b && Array.isArray(b.attached) && Array.isArray(b.detached)) out[pid] = { attached: b.attached, detached: b.detached };
    }
    return out;
  } catch {
    return {}; // belum ada / rusak → kosong (bundled tetap jalan)
  }
}

export function saveSkillBindings(file: string, data: SkillBindingsFile): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

/** Nama skill efektif untuk satu persona (dipakai membangun index prompt). */
export function effectiveSkillNames(
  bundled: string[],
  binding: SkillBinding | undefined,
  globalSkillName: string | undefined,
): Set<string> {
  const names = new Set(bundled);
  if (globalSkillName) names.add(globalSkillName);
  for (const s of binding?.attached ?? []) names.add(s);
  for (const s of binding?.detached ?? []) names.delete(s);
  return names;
}

/** Toggle satu skill utk persona → binding baru (pure; persist oleh caller). */
export function applyBindingAction(
  binding: SkillBinding | undefined,
  skillName: string,
  bundled: string[],
  action: "attach" | "detach",
): SkillBinding {
  const b: SkillBinding = {
    attached: [...(binding?.attached ?? [])],
    detached: [...(binding?.detached ?? [])],
  };
  if (action === "attach") {
    b.attached = [...new Set([...b.attached, skillName])];
    b.detached = b.detached.filter((s) => s !== skillName); // attach batalkan detach bawaan
  } else {
    b.detached = [...new Set([...b.detached, skillName])];
    b.attached = b.attached.filter((s) => s !== skillName);
    if (!bundled.includes(skillName) && b.detached.length === 1 && b.detached[0] === skillName) {
      // detach skill non-bawaan satu-satunya → binding jadi no-op, bersihkan
      // (file tetap rapi seiring waktu).
      b.detached = [];
    }
  }
  return b;
}
