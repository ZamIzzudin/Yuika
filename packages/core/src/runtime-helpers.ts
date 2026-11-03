// @yui/core — runtime helpers (dipakai runtime.ts & delegation/runner.ts).
import type { Persona } from "./personas/loader.js";
import { listSkills } from "./skills/loader.js";
import { buildSystemPrompt } from "./prompt/builder.js";
import type { SessionStore } from "./session/store.js";
import { ApprovalEngine } from "./approval/engine.js";
import type { Emit } from "./session/emit.js";

/** Buat sesi dengan system prompt FROZEN (cache discipline) + toolset persona. */
export function createSessionWithPrompt(
  store: SessionStore,
  persona: Persona,
  sessionId: string,
  tools: string[],
  skillsDir: string,
  projectId?: string | null,
  extraPrompt = "",
): void {
  // Skills index = skill global + skill bundled persona (progressive disclosure: nama+deskripsi saja)
  const all = listSkills(skillsDir);
  const globalSkill = all.find((s) => s.frontmatter.metadata?.yui?.personas === undefined);
  const bundledNames = new Set(persona.manifest.skills.bundled);
  const index = all.filter((s) => bundledNames.has(s.name) || s.name === globalSkill?.name);
  store.createSession(sessionId, persona.manifest.id, buildSystemPrompt(persona, index) + extraPrompt, tools, projectId);
}

export function makeApprovalEngineForSession(emit: Emit): ApprovalEngine {
  return new ApprovalEngine(emit);
}
