// @yuika/api, daftar persona + growth + bentuk maskot (menu Persona) + blind test.
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";
import {
  PersonaGrowth,
  PersonaRename,
  PersonaRenamesResponse,
  PersonaShapesResponse,
  SetPersonaRenameRequest,
  SetPersonaShapeRequest,
  StartBlindTestRequest,
  SubmitBlindGuessesRequest,
} from "@yuika/contracts";

export function registerPersonaRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  app.get("/api/personas", async () => ({ personas: getRt().listPersonas() }));

  /** GET /api/personas/blindtest — prompt uji + riwayat run (anon view). */
  app.get("/api/personas/blindtest", async () => ({
    prompts: getRt().blindPrompts,
    runs: getRt().blindTest.list(),
  }));

  /** POST /api/personas/blindtest — mulai run baru (2-6 persona × prompt). */
  app.post("/api/personas/blindtest", async (req, reply) => {
    const parsed = StartBlindTestRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "payload tidak valid (personaIds 2-6 + promptId)" });
    }
    try {
      return getRt().blindTest.start(parsed.data.personaIds, parsed.data.promptId);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET /api/personas/blindtest/:id — view run (mapping rahasia s.d. submit). */
  app.get("/api/personas/blindtest/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const run = getRt().blindTest.get(id);
    if (!run) return reply.code(404).send({ error: "run tidak ditemukan" });
    return run;
  });

  /** POST /api/personas/blindtest/:id/guesses — submit tebakan + skor + reveal. */
  app.post("/api/personas/blindtest/:id/guesses", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = SubmitBlindGuessesRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "payload tidak valid (guesses letter→personaId)" });
    }
    try {
      return getRt().blindTest.submit(id, parsed.data.guesses);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET /api/personas/growth, growth persona (level + statistik nyata). */
  app.get("/api/personas/growth", async () => PersonaGrowth.array().parse(getRt().personaGrowth()));

  /** GET /api/personas/shapes, override bentuk maskot (persona tanpa entri =
   *  default web PERSONA_SHAPE). */
  app.get("/api/personas/shapes", async () =>
    PersonaShapesResponse.parse({ shapes: getRt().personaShapes() }));

  /** PUT /api/personas/shapes, set/ganti bentuk persona (validasi: persona
   *  terdaftar + bentuk salah satu dari 15 → 400 bila tidak). */
  app.put("/api/personas/shapes", async (req, reply) => {
    const parsed = SetPersonaShapeRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "payload tidak valid (personaId + shape 0-14 kunci)" });
    }
    try {
      const entry = getRt().setPersonaShape(parsed.data.personaId, parsed.data.shape);
      return PersonaShapesResponse.parse({ shapes: getRt().personaShapes() });
    } catch (e) {
      return reply.status(400).send({ error: e instanceof Error ? e.message : "gagal menyimpan bentuk" });
    }
  });

  /** GET /api/personas/renames — override nama tampilan (F1). */
  app.get("/api/personas/renames", async () =>
    PersonaRenamesResponse.parse({ renames: getRt().personaRenames() }));

  /** PUT /api/personas/renames — set/ganti nama tampilan persona
   *  (id internal tetap; name 1-40, description ≤ 120 → 400 bila tidak). */
  app.put("/api/personas/renames", async (req, reply) => {
    const parsed = SetPersonaRenameRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid payload (personaId + name 1-40 chars, description ≤ 120)" });
    }
    try {
      getRt().setPersonaRename(parsed.data.personaId, parsed.data.name, parsed.data.description);
      return PersonaRenamesResponse.parse({ renames: getRt().personaRenames() });
    } catch (e) {
      return reply.status(400).send({ error: e instanceof Error ? e.message : "failed to save the name" });
    }
  });

  /** DELETE /api/personas/renames/:personaId — reset ke nama default manifest. */
  app.delete("/api/personas/renames/:personaId", async (req, reply) => {
    const { personaId } = PersonaRename.pick({ personaId: true }).parse(req.params);
    getRt().clearPersonaRename(personaId);
    return PersonaRenamesResponse.parse({ renames: getRt().personaRenames() });
  });
}
