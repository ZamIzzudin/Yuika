// @yuika/api — vault REST (Batch 12 / P2-VLT-1..2). METADATA-ONLY: nilai
// masuk SATU kali via POST fill (dari kartu protected web), tidak pernah
// dikembalikan / di-log / di-event.
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";
import { VaultFillSubmit } from "@yuika/contracts";

export function registerVaultRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  app.get("/api/vault", async () => {
    return { secrets: getRt().vault.list() };
  });

  /** Isi kartu protected — body {value, save}. Respons metadata saja. */
  app.post("/api/vault/fill/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = VaultFillSubmit.parse(req.body);
    const rt = getRt();
    const ok = rt.vault.resolveFill(id, body.value, body.save);
    if (!ok) return reply.code(404).send({ error: "request unknown or already completed" });
    return { ok: true as const };
  });

  /** Skip dari kartu (tombol Skip — agent menerima sinyal fallback). */
  app.post("/api/vault/fill/:id/skip", async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = getRt().vault.skipFill(id);
    if (!ok) return reply.code(404).send({ error: "request unknown or already completed" });
    return { ok: true as const };
  });

  app.delete("/api/vault/:name", async (req, reply) => {
    const { name } = req.params as { name: string };
    const ok = getRt().vault.forget(name);
    if (!ok) return reply.code(404).send({ error: "not found" });
    return { ok: true as const };
  });
}
