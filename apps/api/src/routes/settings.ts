// @yui/api — settings: approval mode, budget/admission, model routes & prices,
// provider (swap panas + persist .env), model smoke.
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yui/core";
import { ApprovalModeSetting, UpdateBudgetRequest, UpdateModelPriceRequest, UpdateModelRouteRequest, UpdateProviderSettingsRequest } from "@yui/contracts";

export function registerSettingsRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  /** GET/PUT mode approval (fix dev-10): "auto" = write_file & run_command
   *  disetujui otomatis (mode cepat); "ask" = kartu persetujuan (default). */
  app.get("/api/settings/approval", async () => ({ mode: getRt().approvalMode() }));

  app.put("/api/settings/approval", async (req, reply) => {
    const parsed = ApprovalModeSetting.safeParse((req.body as { mode?: unknown }).mode);
    if (!parsed.success) return reply.code(400).send({ error: "mode harus 'ask' atau 'auto'" });
    getRt().setApprovalMode(parsed.data);
    return { mode: parsed.data };
  });

  /** GET → status saldo/budget (CRED-4). PUT → update budget/limit (CRED-2/3). */
  app.get("/api/settings/budget", async () => getRt().getBudgetStatus());

  app.put("/api/settings/budget", async (req) => getRt().updateBudget(UpdateBudgetRequest.parse(req.body)));

  /** GET/PUT /api/settings/models — route model per persona (P1-MDL-1). */
  app.get("/api/settings/models", async () => getRt().getModelRoutes());

  app.put("/api/settings/models", async (req, reply) => {
    const body = UpdateModelRouteRequest.parse(req.body);
    try {
      getRt().updateModelRoute(body.personaId, { model: body.model, fallback: body.fallback });
      return getRt().getModelRoutes();
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET/PUT /api/settings/models/prices — price book (P1-MDL-3). */
  app.get("/api/settings/models/prices", async () => getRt().getModelPrices());

  app.put("/api/settings/models/prices", async (req, reply) => {
    const body = UpdateModelPriceRequest.parse(req.body);
    try {
      getRt().updateModelPrice(body.model, body.price);
      return getRt().getModelPrices();
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET → config aktif (key disamarkan). PUT → swap panas + persist .env. */
  app.get("/api/settings/provider", async () => getRt().getProviderSettings());

  app.put("/api/settings/provider", async (req, reply) => {
    const body = UpdateProviderSettingsRequest.parse(req.body);
    try {
      return getRt().updateProviderSettings(body);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET → hasil smoke terakhir (P1-MDL-2). POST → jalankan smoke semua model
   *  aktif; gagal → router fallback otomatis. */
  app.get("/api/settings/provider/smoke", async () => getRt().getModelSmoke());

  app.post("/api/settings/provider/smoke", async () => {
    const results = await getRt().runModelSmoke();
    return { running: false, results };
  });

  /** P0-DATA-2: jalankan housekeeping retention sekarang (manual/diagnosa —
   *  otomatis: boot + interval harian; retensi YUI_EVENTS_RETENTION_DAYS). */
  app.post("/api/settings/housekeeping", async () => getRt().housekeepEvents());
}
