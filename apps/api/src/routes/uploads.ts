// @yuika/api, ENDPOINT UPLOAD TUNGGAL (D89): POST /api/uploads.
// Sebelumnya terpecah dua (projects/:id/uploads + sessions/:id/uploads),
// kini satu route scope-optional:
//   ?session=<sessionId> → ikut scope sesi (proyek → <root>/uploads,
//                          global → workspace/uploads)
//   ?project=<projectId> → <root proyek>/uploads
//   (tanpa keduanya)     → workspace/uploads
// Respons { path, bytes }: path RELATIF workspace — persona membacanya via
// doc_read / read_file. Klien: ChatView (lampiran chat) + FileTab.
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";
import { MAX_UPLOAD, sanitizeUploadName } from "../upload-util.js";

export function registerUploadRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  app.post("/api/uploads", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const name = sanitizeUploadName(q.name);
    if ("error" in name) return reply.code(400).send({ error: name.error });
    const target: { sessionId?: string; projectId?: string } = {};
    if (q.session) target.sessionId = q.session;
    if (q.project) target.projectId = q.project;
    try {
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ""));
      if (buf.length === 0) return reply.code(400).send({ error: "empty file" });
      if (buf.length > MAX_UPLOAD) return reply.code(400).send({ error: "max 10 MB" });
      return await getRt().writeUpload(target, name.name, buf);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });
}
