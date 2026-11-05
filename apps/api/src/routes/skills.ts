// @yuika/api — skills: draf/accept/reject + bindings (Dungeon) + eval buta.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { YuiRuntime } from "@yuika/core";

const DraftUpdate = z.object({ slug: z.string().min(1), name: z.string().min(3), description: z.string().min(10), body: z.string().min(20) });
const BindingUpdate = z.object({
  personaId: z.string().min(1),
  skill: z.string().min(1),
  action: z.enum(["attach", "detach"]),
});

export function registerSkillRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  /** GET /api/skills — draf (perlu validasi) + skill siap pakai. */
  app.get("/api/skills", async () => getRt().listSkillsWithDrafts());

  /** PUT /api/skills — edit draf (validasi user sebelum terima). */
  app.put("/api/skills", async (req, reply) => {
    const body = DraftUpdate.parse(req.body);
    try {
      getRt().updateSkillDraft(body);
      return { ok: true };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** POST /api/skills — terima draf ({slug}) → lint + pindah ke skill aktif. */
  app.post("/api/skills", async (req, reply) => {
    const { slug } = req.body as { slug: string };
    try {
      return getRt().acceptSkillDraft(slug);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** DELETE /api/skills?slug= — tolak draf (hapus). */
  app.delete("/api/skills", async (req, reply) => {
    const slug = (req.query as Record<string, string | undefined>).slug ?? "";
    try {
      getRt().rejectSkillDraft(slug);
      return { ok: true };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET — payload mapping skill↔persona (menu Dungeon tab "Mapping Skill"). */
  app.get("/api/skills/bindings", async () => getRt().getSkillBindings());

  /** PUT — toggle satu skill untuk satu persona (persist skill-bindings.json). */
  app.put("/api/skills/bindings", async (req, reply) => {
    const parsed = BindingUpdate.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "body: {personaId, skill, action: attach|detach}" });
    }
    try {
      const binding = getRt().setSkillBinding(parsed.data.personaId, parsed.data.skill, parsed.data.action);
      return { ok: true, binding };
    } catch (e) {
      return reply.code(404).send({ error: e instanceof Error ? e.message : "gagal menyimpan binding" });
    }
  });

  /** POST /api/skills/eval — P1-DUN-3: eval buta skill `tested` → lulus = ready.
   *  Async (sesi hakim jalan di background); hasil di-polling field `eval`. */
  app.post("/api/skills/eval", async (req, reply) => {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.body);
    try {
      return getRt().evalSkill(slug);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });
}
