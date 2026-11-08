// @yuika/core, override bentuk geometri maskot persona (menu Persona).
// Persist: `workspace/persona-shapes.json`, peta personaId → OrinShapeKey.
// Tanpa entri = default (PERSONA_SHAPE web / manifest). Fail-closed: persona
// tak dikenal atau bentuk di luar 15 → error (jangan diam-diam fallback,
// UI harus tahu pilihan tidak valid).
import fs from "node:fs";
import path from "node:path";
import { ORIN_SHAPE_KEYS, OrinShapeKey, PersonaShapesResponse, PersonaShapeOverride } from "@yuika/contracts";

export function personaShapesPath(workspacePath: string): string {
  return path.join(workspacePath, "persona-shapes.json");
}

/** Baca semua override (file hilang/korup → {}, default manifest menang). */
export function loadPersonaShapes(workspacePath: string): Record<string, string> {
  const file = personaShapesPath(workspacePath);
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = PersonaShapesResponse.parse(JSON.parse(fs.readFileSync(file, "utf-8")));
    return Object.fromEntries(parsed.shapes.map((s) => [s.personaId, s.shape]));
  } catch {
    return {}; // korup → anggap tanpa override (bukan crash boot)
  }
}

function persist(workspacePath: string, map: Record<string, string>): PersonaShapeOverride[] {
  const shapes = Object.entries(map)
    .map(([personaId, shape]) => PersonaShapeOverride.parse({ personaId, shape: OrinShapeKey.parse(shape) }))
    .sort((a, b) => a.personaId.localeCompare(b.personaId));
  fs.writeFileSync(personaShapesPath(workspacePath), JSON.stringify({ shapes }, null, 2), "utf-8");
  return shapes;
}

/** Set/ganti bentuk persona. Validasi: persona harus terdaftar (loader) & bentuk
 *  salah satu dari 15. `shape === defaultShape` tetap ditulis (eksplisit),
 *  pemanggil boleh memilih untuk tidak menulis bila sama dengan default. */
export function savePersonaShape(
  workspacePath: string,
  personaId: string,
  shape: string,
  validPersonaIds: readonly string[],
): PersonaShapeOverride {
  if (!validPersonaIds.includes(personaId)) {
    throw new Error(`persona tidak dikenal: ${personaId}`);
  }
  const key = OrinShapeKey.parse(shape); // lempar bila bukan salah satu dari 15
  const map = loadPersonaShapes(workspacePath);
  map[personaId] = key;
  persist(workspacePath, map);
  return { personaId, shape: key };
}

/** Hapus override → kembali ke default manifest. Idempoten. */
export function clearPersonaShape(
  workspacePath: string,
  personaId: string,
): boolean {
  const map = loadPersonaShapes(workspacePath);
  if (!(personaId in map)) return false;
  delete map[personaId];
  persist(workspacePath, map);
  return true;
}

export function personaShapeOf(map: Record<string, string>, personaId: string): string | undefined {
  const v = map[personaId];
  return v && (ORIN_SHAPE_KEYS as readonly string[]).includes(v) ? v : undefined;
}
