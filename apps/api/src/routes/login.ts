// @yuika/api, VLT-4 fill_login (blok C): jawaban kartu login dari user.
//   POST /api/login/:requestId/fill  {user, pass, save?, submit?} → isi form
//   POST /api/login/:requestId/skip                              → tolak
//   GET  /api/login/pending                                      → replay kartu
//
// INVARIAN Batch 12/14: nilai user/pass HANYA hidup di request ini, masuk
// CDP fill (+ optional vault store), TIDAK PERNAH ke event/log/model.
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";
import { listPendingLogins, resolveLogin } from "@yuika/core";

export function registerLoginRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  app.get("/api/login/pending", async () => ({ requests: listPendingLogins() }));

  app.post("/api/login/:requestId/fill", async (req, reply) => {
    const { requestId } = req.params as { requestId: string };
    const b = (req.body ?? {}) as { user?: unknown; pass?: unknown; save?: unknown; submit?: unknown };
    if (typeof b.user !== "string" || !b.user.trim() || typeof b.pass !== "string" || !b.pass)
      return reply.code(400).send({ error: "user and pass (non-empty strings) required" });
    const save = b.save !== false; // default: simpan ke vault
    const submit = b.submit !== false; // default: submit form
    const pending = listPendingLogins().find((p: { requestId: string }) => p.requestId === requestId);
    if (!pending) return reply.code(404).send({ error: "request not found (expired or resolved)" });
    // Save to Vault dulu (nilainya sah apa pun hasil heuristik fill), record
    // kind=login scope persona, value JSON {user,pass} (dienkripsi AES-GCM).
    if (save) {
      try {
        getRt().vault.store.put({
          name: `login:${pending.origin}`,
          kind: "login",
          scope: "persona",
          projectId: pending.key.split("/")[0] ?? null,
          personaId: pending.personaId,
          runId: null,
          value: JSON.stringify({ user: b.user, pass: b.pass }),
        });
      } catch {
        /* vault gagal ≠ fill gagal, lanjut run-only */
      }
    }
    const ok = await resolveLogin(requestId, { user: b.user, pass: b.pass, save, submit });
    return ok ? { ok: true } : reply.code(404).send({ error: "request not found (expired or resolved)" });
  });

  app.post("/api/login/:requestId/skip", async (req, reply) => {
    const { requestId } = req.params as { requestId: string };
    const ok = await resolveLogin(requestId, null);
    return ok ? { ok: true } : reply.code(404).send({ error: "request not found (expired or resolved)" });
  });
}
