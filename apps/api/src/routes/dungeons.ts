// @yuika/api — dungeon (latihan skill persona) + materials upload.
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { YuiRuntime } from "@yuika/core";
import { CreateMissionRequest } from "@yuika/contracts";

const MAX_UPLOAD = 10 * 1024 * 1024;
const OK_EXT = new Set([".pdf", ".xlsx", ".xls", ".csv", ".md", ".txt", ".json", ".html", ".htm", ".xml", ".yaml", ".yml"]);

export function registerDungeonRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  /** GET /api/dungeons — daftar misi + riwayat run (P1-DUN-1). */
  app.get("/api/dungeons", async () => ({ dungeons: getRt().listDungeons() }));

  /** POST /api/dungeons — jalankan misi ({missionId}) → run sandbox dimulai. */
  app.post("/api/dungeons", async (req, reply) => {
    const { missionId } = z.object({ missionId: z.string().min(1) }).parse(req.body);
    try {
      return getRt().startDungeonRun(missionId);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** POST /api/dungeons/mission — buat latihan buatan user (P1-DUN-4). */
  app.post("/api/dungeons/mission", async (req, reply) => {
    const input = CreateMissionRequest.parse(req.body);
    try {
      const mission = getRt().createDungeonMission({
        personaId: input.personaId,
        title: input.title,
        goal: input.goal,
        skillName: input.skillName,
        skillDescription: input.skillDescription,
        resources: input.resources,
        acceptance: input.acceptance,
      });
      return { mission };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** DELETE /api/dungeons/:slug — hapus latihan buatan user beserta foldernya. */
  app.delete("/api/dungeons/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    try {
      getRt().deleteDungeonMission(slug);
      return { ok: true };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** POST /api/dungeons/:slug/materials?name=… body = raw bytes — bahan ajar
   *  user untuk latihan (P1-DUN-4), disimpan <dungeon>/materials/. Mirror
   *  sanitasi upload proyek. */
  app.post("/api/dungeons/:slug/materials", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const name = ((req.query as Record<string, string | undefined>).name ?? "").replace(/[\\/:*?"<>|]/g, "_").trim();
    if (!name || name.includes("..")) return reply.code(400).send({ error: "nama file tidak valid" });
    const ext = path.extname(name).toLowerCase();
    if (!OK_EXT.has(ext)) return reply.code(400).send({ error: `format ${ext || "?"} tidak didukung (pdf/xlsx/xls/csv/md/txt/json/html/yaml)` });
    try {
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ""));
      if (buf.length === 0) return reply.code(400).send({ error: "file kosong" });
      if (buf.length > MAX_UPLOAD) return reply.code(400).send({ error: "maks 10 MB" });
      const rel = getRt().writeDungeonMaterial(slug, name, buf);
      return { path: rel, bytes: buf.length };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });
}
