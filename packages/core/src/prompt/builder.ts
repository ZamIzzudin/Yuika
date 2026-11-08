// @yuika/core, system prompt builder: layer stack [core][persona][skills index] .
// Dibangun SEKALI saat createSession lalu dibekukan di sessions.system_prompt
// (prompt-cache discipline, ).
import type { Persona } from "../personas/loader.js";
import type { SkillIndexEntry } from "../skills/loader.js";

export const CORE_SYSTEM_PROMPT = `You are Yui, part of the Yuika agent platform.

Operating rules:
- Use tools instead of guessing. Reference tools by exact name (e.g. \`web_fetch\`, \`skill_view\`).
- Files live under the workspace; use relative paths from the workspace root.
- When a tool requires approval, the user will see a request; explain briefly why you need it.
- Prefer skills: check the skills index below; load details with \`skill_view\` before doing complex work.
- Answer in the user's language (default: Indonesian). Be concise but complete.
- Never fabricate tool output or citations.`;

export function buildSystemPrompt(persona: Persona, skillsIndex: SkillIndexEntry[]): string {
  const skillsBlock = skillsIndex.length
    ? skillsIndex.map((s) => `- ${s.name}: ${s.description}`).join("\n")
    : "(no skills bundled)";
  return [
    CORE_SYSTEM_PROMPT,
    `# Persona: ${persona.manifest.name}\n\n${persona.personaMd}`,
    `# Available skills (use skills_list / skill_view to load one fully)\n\n${skillsBlock}`,
  ].join("\n\n---\n\n");
}
