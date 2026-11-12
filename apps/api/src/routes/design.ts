// @yuika/api, P3-CANVAS: CRUD file desain untuk tab Design (embedded editor).
// Persona menulis via tools design_* (core store yang sama); UI membaca via
// GET dan menyimpan hasil edit user via PUT. D91: file diikat per-project
// (?project=<id> pada list/create; PUT menjaga ikatan yang tersimpan).
import type { FastifyInstance } from "fastify";
import {
  addDesignPage,
  createDesignFile,
  deleteDesignFile,
  deleteDesignPage,
  listDesignFiles,
  saveDesignFile,
  getDesignFile,
} from "@yuika/core/design";
import type { DesignFile } from "@yuika/core/design";
import type { YuiRuntime } from "@yuika/core";

export function registerDesignRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  const ws = () => getRt().paths.workspacePath;

  // D91: tanpa ?project= → semua file (dipakai persona/tools & view global);
  // dengan ?project= → file milik project itu + file legacy (projectId null).
  app.get("/api/design/files", async (req) => {
    const q = req.query as { project?: string } | undefined;
    return { files: listDesignFiles(ws(), q?.project ?? null) };
  });

  app.post("/api/design/files", async (req, reply) => {
    const body = req.body as { name?: string; projectId?: string | null } | undefined;
    if (!body?.name || typeof body.name !== "string") return reply.code(400).send({ error: "name required" });
    const f = createDesignFile(ws(), body.name, body.projectId ?? null);
    return reply.code(201).send({ id: f.id, name: f.name, projectId: f.projectId ?? null });
  });

  app.get("/api/design/files/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const f = getDesignFile(ws(), id);
    if (!f) return reply.code(404).send({ error: "not found" });
    return { file: f };
  });

  app.post("/api/design/files/:id/pages", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const p = addDesignPage(ws(), id);
      return reply.code(201).send({ pageId: p.id, name: p.name });
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : "bad request" });
    }
  });

  // D91: hapus halaman (guard minimal satu tersisa ada di core store)
  app.delete("/api/design/files/:id/pages/:pageId", async (req, reply) => {
    const { id, pageId } = req.params as { id: string; pageId: string };
    try {
      const r = deleteDesignPage(ws(), id, pageId);
      return { pages: r.pages };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "bad request";
      return reply.code(400).send({ error: msg });
    }
  });

  // D95: hapus SELURUH file desain (backlog D94: selama ini tidak ada cara
  // menghapus file — file probe verifikasi menumpuk di workspace/design).
  app.delete("/api/design/files/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const cur = getDesignFile(ws(), id);
    if (!cur) return reply.code(404).send({ error: "not found" });
    return deleteDesignFile(ws(), id);
  });

  app.put("/api/design/files/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { file?: DesignFile } | undefined;
    const incoming = body?.file;
    if (!incoming || incoming.id !== id) return reply.code(400).send({ error: "file body with matching id required" });
    const cur = getDesignFile(ws(), id);
    if (!cur) return reply.code(404).send({ error: "not found" });
    // last-write-wins dengan guard ringan: revn masuk harus >= revn tersimpan
    if (incoming.revn < cur.revn) {
      return reply.code(409).send({ error: "stale revn; reload the file (persona may have edited it)", revn: cur.revn });
    }
    // D91: jangan lepas ikatan project saat UI (yang bisa memuat file lama
    // tanpa projectId) menyimpan kembali — ikatan tersimpan menang.
    if (cur.projectId && !incoming.projectId) incoming.projectId = cur.projectId;
    incoming.revn = cur.revn + 1;
    incoming.updatedAt = Date.now();
    saveDesignFile(ws(), incoming);
    return { revn: incoming.revn };
  });
}
