// @yui/core — runtime helpers (dipakai runtime.ts & delegation/runner.ts).
import type { Persona } from "./personas/loader.js";
import { listSkills } from "./skills/loader.js";
import { buildSystemPrompt } from "./prompt/builder.js";
import type { ISessionStore } from "./session/store.js";
import { ApprovalEngine } from "./approval/engine.js";
import type { Emit } from "./session/emit.js";
import { effectiveSkillNames, type SkillBinding } from "./skills/bindings.js";

/** Buat sesi dengan system prompt FROZEN (cache discipline) + toolset persona. */
export function createSessionWithPrompt(
  store: ISessionStore,
  persona: Persona,
  sessionId: string,
  tools: string[],
  skillsDir: string,
  projectId?: string | null,
  extraPrompt = "",
  /** Mapping manual skill → persona (menu Dungeon; skill-bindings.json). */
  skillBindings?: SkillBinding,
): void {
  // Skills index = bawaan skills.yaml ∪ lampiran manual user ∪ skill global
  // (progressive disclosure: nama+deskripsi saja; isi via skill_view).
  const all = listSkills(skillsDir);
  const globalSkill = all.find((s) => s.frontmatter.metadata?.yui?.personas === undefined);
  const names = effectiveSkillNames(persona.manifest.skills.bundled, skillBindings, globalSkill?.name);
  const index = all.filter((s) => names.has(s.name));
  store.createSession(sessionId, persona.manifest.id, buildSystemPrompt(persona, index) + extraPrompt, tools, projectId);
}

export function makeApprovalEngineForSession(emit: Emit): ApprovalEngine {
  return new ApprovalEngine(emit);
}
