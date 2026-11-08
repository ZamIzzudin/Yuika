// @yuika/core, assign gating (P1-DUN-5, PLAN §13.8): roster menampilkan skill
// readiness persona per fase, persona tanpa skill fase ditandai "belum siap"
// (hint: latih di Dungeon). Pure function, gampang dites, runtime tinggal
// memanggil dengan skills inventory.
import type { PhaseReadiness, RosterEntry, WorkflowPhase } from "@yuika/contracts";
import { WORKFLOW_PHASES } from "@yuika/contracts";

/** Kategori skill yang relevan per fase workflow (v0 heuristik, skill seed
 *  memakai category: research / design / software-development / productivity).
 *  planning & delivery tidak digating: kemampuan inti semua persona. */
export const PHASE_CATEGORIES: Partial<Record<WorkflowPhase, string[]>> = {
  research: ["research", "data"],
  design: ["design"],
  develop: ["software-development", "develop", "coding", "code"],
  testing: ["testing", "qa"],
  documentation: ["productivity", "writing", "docs"],
};

export interface ReadinessSkill {
  name: string;
  category?: string;
  personas: string[];
  /** tested/ready dihitung siap (draft tidak, belum tervalidasi). */
  status: "draft" | "tested" | "ready";
}

export interface PersonaReadiness {
  personaId: string;
  phases: PhaseReadiness[];
  /** true bila semua fase yang digating tercakup skill siap. */
  ready: boolean;
}

export function computeReadiness(roster: RosterEntry[], skills: ReadinessSkill[]): PersonaReadiness[] {
  return roster.map((entry) => {
    const phases = entry.phases.map<PhaseReadiness>((phase) => {
      const cats = PHASE_CATEGORIES[phase] ?? [];
      if (cats.length === 0) return { phase, ready: true, skills: [] }; // fase inti, tanpa gating
      const owned = skills.filter(
        (s) => s.personas.includes(entry.personaId) && s.category && cats.includes(s.category) && (s.status === "ready" || s.status === "tested"),
      );
      return { phase, ready: owned.length > 0, skills: owned.map((s) => s.name) };
    });
    return { personaId: entry.personaId, phases, ready: phases.every((p) => p.ready) };
  });
}

// guard tipologi: semua fase workflow harus dikenal peta kategori (opsional)
export const GATED_PHASES = WORKFLOW_PHASES.filter((p) => (PHASE_CATEGORIES[p] ?? []).length > 0);
