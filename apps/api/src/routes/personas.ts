// @yui/api — daftar persona + growth (P1-PER-4) + bentuk maskot (menu Persona).
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yui/core";
import { PersonaGrowth, PersonaShapesResponse, SetPersonaShapeRequest } from "@yui/contracts";

export function registerPersonaRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  app.get("/api/personas", async () => ({ personas: getRt().listPersonas() }));

  /** GET /api/personas/growth — growth persona (level + statistik nyata). */
  app.get("/api/personas/growth", async () => PersonaGrowth.array().parse(getRt().personaGrowth()));

  /** GET /api/personas/shapes — override bentuk maskot (persona tanpa entri =
   *  default web PERSONA_SHAPE). */
  app.get("/api/personas/shapes", async () =>
    PersonaShapesResponse.parse({ shapes: getRt().personaShapes() }));

  /** PUT /api/personas/shapes — set/ganti bentuk persona (validasi: persona
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
}
