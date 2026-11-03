// @yui/core — skill tools: progressive disclosure (skills_list → skill_view)
// + skill_propose (P1-MEM-3: pengalaman → draf skill → validasi user).
// Index hanya nama+deskripsi; isi penuh dimuat on-demand (PLAN §4.4).
// Tanpa offset/limit: model harus membaca skill sepenuhnya (standar Hermes).
import { z } from "zod";
import { registry } from "../registry.js";
import { listSkills } from "../skills/loader.js";
import { bumpUsage, proposeSkill } from "../skills/manager.js";

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
      bumpUsage(skill.dir, "views"); // P1-MEM-4
      return { result: { name: skill.name, content: skill.body } };
    },
  });

  // P1-MEM-3: usulkan skill dari pengalaman — masuk DRAFT, user validasi di tab
  // Skill (edit → Terima/Tolak). Bar tinggi seperti memory_append: hanya bila
  // alur kerja terbukti efektif & reusable; bukan catatan biasa (itu memory_append).
  registry.register({
    name: "skill_propose",
    description:
      "Usulkan SKILL baru dari pengalaman/pola kerja yang terbukti berhasil & reusable (bukan preferensi — itu memory_append). Isi: nama singkat, deskripsi kapan dipakai, body = instruksi langkah demi langkah yang bisa diikuti agent lain. Masuk draf untuk validasi user.",
    parameters: z.object({
      name: z.string().min(3).max(64),
      description: z.string().min(10).max(200),
      body: z.string().min(20),
      source: z.string().optional(),
    }),
    handler: async (args, ctx) => {
      try {
        proposeSkill(skillsDir, args.name, args.description, args.body, args.source);
        ctx.emit({
          type: "skill.proposed",
          turnId: ctx.turnId,
          name: args.name,
          description: args.description.slice(0, 160),
        });
        return {
          result: {
            ok: true,
            name: args.name,
            note: "draf tersimpan — menunggu validasi user di tab Skill (terima → langsung bisa dipakai via skills_list)",
          },
        };
      } catch (e) {
        return { result: { error: e instanceof Error ? e.message : String(e) }, isError: true };
      }
    },
  });
}
