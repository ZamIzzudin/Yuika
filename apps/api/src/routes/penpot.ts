// @yuika/api, P2-DSN-3: daftar file Penpot (untuk embed tab Design).
// Read-only dari state connector — semua mutasi tetap lewat persona/tools.
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";

export function registerPenpotRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  app.get("/api/penpot/files", async () => getRt().penpotFiles());
}
