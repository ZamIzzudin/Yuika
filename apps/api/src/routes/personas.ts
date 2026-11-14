// @yuika/api, daftar persona + growth + bentuk maskot + Persona Forge (F2).
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";
import {
  CreateCustomPersonaRequest,
  CUSTOM_PERSONA_ID_RE,
  ForgeKit,
  PersonaGrowth,
  PersonaRename,
  PersonaRenamesResponse,
  PersonaShapesResponse,
  SetPersonaRenameRequest,
  SetPersonaShapeRequest,
  UpdateCustomPersonaRequest,
} from "@yuika/contracts";

export function registerPersonaRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  app.get("/api/personas", async () => ({ personas: getRt().listPersonas() }));

  /** GET /api/personas/forge-kit — bahan baku wizard Persona Forge (F2):
   *  persona lengkap (lapisan prompt + skills) + bank skill. */
  app.get("/api/personas/forge-kit", async () => ForgeKit.parse(getRt().forgeKit()));

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

  // ── F2 Persona Forge ───────────────────────────────────────────────────
  /** POST /api/personas/custom — buat persona custom baru (mandiri, bukan clone).
   *  Lapisan user: name/description/PERSONA.md/skills (+shape opsional);
   *  tools & delegation dikunci dari basis. */
  app.post("/api/personas/custom", async (req, reply) => {
    const parsed = CreateCustomPersonaRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid payload (name 1-40, description 1-120, personaMd, tools, skills)" });
    }
    try {
      return { persona: getRt().createCustomPersona(parsed.data) };
    } catch (e) {
      return reply.status(400).send({ error: e instanceof Error ? e.message : "failed to forge the persona" });
    }
  });

  /** PUT /api/personas/custom/:id — ubah lapisan user persona custom. */
  app.put("/api/personas/custom/:id", async (req, reply) => {
    const parsed = UpdateCustomPersonaRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid payload (name 1-40, description 1-120, personaMd, tools, skills)" });
    }
    try {
      return { persona: getRt().updateCustomPersona(String((req.params as { id?: string }).id ?? ""), parsed.data) };
    } catch (e) {
      return reply.status(400).send({ error: e instanceof Error ? e.message : "failed to update the persona" });
    }
  });

  /** GET /api/personas/custom/:id/export — file share persona (JSON). */
  app.get("/api/personas/custom/:id/export", async (req, reply) => {
    const id = String((req.params as { id?: string }).id ?? "");
    try {
      return getRt().exportPersona(id);
    } catch (e) {
      return reply.status(404).send({ error: e instanceof Error ? e.message : "persona not found" });
    }
  });

  /** POST /api/personas/custom/import — pasang file share jadi persona
   *  custom baru (semua validasi create dijalankan ulang). */
  app.post("/api/personas/custom/import", async (req, reply) => {
    try {
      return { persona: getRt().importPersona(req.body as never) };
    } catch (e) {
      return reply.status(400).send({ error: e instanceof Error ? e.message : "failed to import the persona" });
    }
  });

  /** DELETE /api/personas/custom/:id — hapus persona custom (built-in
   *  ditolak lewat validasi id custom-*). */
  app.delete("/api/personas/custom/:id", async (req, reply) => {
    const id = String((req.params as { id?: string }).id ?? "");
    if (!CUSTOM_PERSONA_ID_RE.test(id)) {
      return reply.status(400).send({ error: "not a custom persona id (must start with 'custom-')" });
    }
    const removed = getRt().deleteCustomPersona(id);
    if (!removed) return reply.status(404).send({ error: "custom persona not found" });
    return { ok: true, id };
  });
}
