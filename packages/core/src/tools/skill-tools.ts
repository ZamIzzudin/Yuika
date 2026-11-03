// @yui/core — skill tools: progressive disclosure (skills_list → skill_view).
// Index hanya nama+deskripsi; isi penuh dimuat on-demand (PLAN §4.4).
// Tanpa offset/limit: model harus membaca skill sepenuhnya (standar Hermes).
import { z } from "zod";
import { registry } from "../registry.js";
import { listSkills } from "../skills/loader.js";

export function registerSkillTools(skillsDir: string): void {
  registry.register({
    name: "skills_list",
    description: "Daftar skill yang tersedia (nama + deskripsi singkat).",
    parameters: z.object({}),
    handler: async () => {
      const skills = listSkills(skillsDir);
      return { result: { skills: skills.map((s) => ({ name: s.name, description: s.description })) } };
    },
  });

  registry.register({
    name: "skill_view",
    description: "Baca isi penuh satu skill (instruksi lengkap) berdasarkan nama.",
    parameters: z.object({ name: z.string().min(1) }),
    handler: async (args: { name: string }) => {
      const skill = listSkills(skillsDir).find((s) => s.name === args.name);
      if (!skill) return { result: { error: `skill tidak ditemukan: ${args.name}` }, isError: true };
      return { result: { name: skill.name, content: skill.body } };
    },
  });
}
