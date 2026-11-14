// @yuika/core, override nama tampilan persona (F1 "custom name").
// Persist: `workspace/persona-names.json`, peta personaId → {name, description}.
// Id internal TIDAK berubah - roster, delegation, growth, sesi tetap pakai
// personaId default; hanya manifest.name/description yang dioverride saat
// load. Fail-closed: file korup → {} (default manifest menang, bukan crash).
import fs from "node:fs";
import path from "node:path";
import { PersonaRename, type PersonaRename as Rename } from "@yuika/contracts";

export function personaNamesPath(workspacePath: string): string {
  return path.join(workspacePath, "persona-names.json");
}

/** Baca semua rename (file hilang/korup → {}). */
export function loadPersonaRenames(workspacePath: string): Record<string, Rename> {
  const file = personaNamesPath(workspacePath);
  if (!fs.existsSync(file)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as { renames?: unknown };
    const list = Array.isArray(raw.renames) ? raw.renames : [];
    const out: Record<string, Rename> = {};
    for (const r of list) {
      const parsed = PersonaRename.safeParse(r);
      if (parsed.success) out[parsed.data.personaId] = parsed.data;
    }
    return out;
  } catch {
    return {};
  }
}

function persist(workspacePath: string, map: Record<string, Rename>): Rename[] {
  const renames = Object.values(map)
    .map((r) => PersonaRename.parse(r))
    .sort((a, b) => a.personaId.localeCompare(b.personaId));
  fs.writeFileSync(personaNamesPath(workspacePath), JSON.stringify({ renames }, null, 2), "utf-8");
  return renames;
}

/** Set/ganti nama tampilan persona. Validasi: persona terdaftar (loader),
 *  name 1-40 chars, description ≤ 120. description null = kembali default. */
export function savePersonaRename(
  workspacePath: string,
  personaId: string,
  input: { name: string; description?: string | null },
  validPersonaIds: readonly string[],
): Rename {
  if (!validPersonaIds.includes(personaId)) {
    throw new Error(`persona tidak dikenal: ${personaId}`);
  }
  const entry = PersonaRename.parse({
    personaId,
    name: input.name.trim(),
    description: input.description?.trim() ? input.description.trim() : null,
  });
  const map = loadPersonaRenames(workspacePath);
  map[personaId] = entry;
  persist(workspacePath, map);
  return entry;
}

/** Hapus rename → kembali ke nama default manifest. Idempoten. */
export function clearPersonaRename(workspacePath: string, personaId: string): boolean {
  const map = loadPersonaRenames(workspacePath);
  if (!(personaId in map)) return false;
  delete map[personaId];
  persist(workspacePath, map);
  return true;
}
