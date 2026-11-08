// @yuika/core, growth tracking (P1-PER-4): persona "tumbuh" seiring pengalaman
// NYATA, sesi dibuat, turn selesai, task project yang dibereskan. BUKAN state
// gamifikasi palsu: semua angka dikurasi dari tabel yang sudah ada
// (sessions / events / project_tasks), jadi tidak bisa inflate tanpa kerja.
// Level dari jumlah `turns` (aktivitas paling jujur, sesi bisa kosong,
// task bisa di-reassign; turn selesai = persona benar-benar bekerja).
import type { PersonaGrowth } from "@yuika/contracts";
import type { ISessionStore } from "../session/store.js";
import type { ProjectStore } from "../project/store.js";

/** Kurva level: batas bawah `turns` → nama. Urutan naik; terakhir = maksimum. */
export const GROWTH_LEVELS: Array<{ at: number; name: string }> = [
  { at: 0, name: "Baru" },
  { at: 15, name: "Berkembang" },
  { at: 50, name: "Mahir" },
  { at: 150, name: "Ahli" },
];

export function buildPersonaGrowth(
  personas: Array<{ id: string; name: string; domain: string }>,
  store: ISessionStore,
  projects: ProjectStore,
): PersonaGrowth[] {
  const sessions = store.personaSessionCounts();
  const turns = store.personaDoneTurnCounts();
  const tasksDone = projects.taskDoneCountsByAssignee();
  return personas.map((p) => {
    const t = turns.get(p.id) ?? 0;
    let idx = 0;
    for (let i = 0; i < GROWTH_LEVELS.length; i++) if (t >= GROWTH_LEVELS[i]!.at) idx = i;
    const next = idx + 1 < GROWTH_LEVELS.length ? GROWTH_LEVELS[idx + 1]!.at : null;
    return {
      id: p.id,
      name: p.name,
      domain: p.domain,
      sessions: sessions.get(p.id) ?? 0,
      turns: t,
      tasksDone: tasksDone.get(p.id) ?? 0,
      level: GROWTH_LEVELS[idx]!.name,
      levelIndex: idx,
      levelCount: GROWTH_LEVELS.length,
      nextLevelAt: next,
    };
  });
}
