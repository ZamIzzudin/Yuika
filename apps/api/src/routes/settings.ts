// @yuika/api, settings: approval mode, budget/admission, model routes & prices,
// provider (swap panas + persist .env), model smoke, host data reset (D70),
// update runner satu-klik (D71: ssh → scripts/update.sh di host).
import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";
import { resolvePaths } from "@yuika/core";
import { ApprovalModeSetting, UpdateBudgetRequest, UpdateModelPriceRequest, UpdateModelRouteRequest, UpdateProviderSettingsRequest } from "@yuika/contracts";
import { makeHostResetter, resetAlreadyPending } from "../reset-run.js";

/** Test seam: route reset/update-runner dapat disuntik implementasi. */
export interface SettingsDeps {
  isResetPending?: () => boolean;
  runReset?: (scope: "work" | "factory") => Promise<void>;
  updateRunnerConfigured?: () => boolean;
  startUpdate?: () => { ok: boolean; error?: string };
}

export function registerSettingsRoutes(
  app: FastifyInstance,
  getRt: () => YuiRuntime,
  deps: SettingsDeps = {},
): void {
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

 /** GET/PUT /api/settings/models, route model per persona . */
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

 /** GET/PUT /api/settings/models/prices, price book . */
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

 /** GET → hasil smoke terakhir . POST → jalankan smoke semua model
   *  aktif; gagal → router fallback otomatis. */
  app.get("/api/settings/provider/smoke", async () => getRt().getModelSmoke());

  app.post("/api/settings/provider/smoke", async () => {
    const results = await getRt().runModelSmoke();
    return { running: false, results };
  });

 /** jalankan housekeeping retention sekarang (manual/diagnosa,
   *  otomatis: boot + interval harian; retensi YUI_EVENTS_RETENTION_DAYS). */
  app.post("/api/settings/housekeeping", async () => getRt().housekeepEvents());

  // ── D70: host data reset ────────────────────────────────────────
  app.post("/api/settings/reset", async (req, reply) => {
    const body = (req.body ?? {}) as { scope?: unknown; confirm?: unknown };
    const scope = body.scope === "factory" ? "factory" : body.scope === "work" ? "work" : null;
    if (!scope) return reply.code(400).send({ error: "scope must be 'work' or 'factory'" });
    if (body.confirm !== "RESET") return reply.code(400).send({ error: "type RESET to confirm" });
    const isPending = deps.isResetPending ?? resetAlreadyPending;
    if (isPending()) return reply.code(409).send({ error: "reset already in progress" });
    const run = deps.runReset ?? makeHostResetter(getRt);
    await reply.code(202).send({ ok: true, scope, restarting: true });
    // Setelah reply terkirim: quiesce → marker → exit(87) (klien melihat
    // koneksi putus = diharapkan; boot baru menjalankan wipe).
    setTimeout(() => void run(scope).catch(() => process.exit(87)), 250);
  });

  // ── D71: update runner satu-klik (ssh → update.sh di host) ──────
  const updateConfigured = (): boolean =>
    deps.updateRunnerConfigured?.() ?? !!process.env.YUI_UPDATE_SSH_TARGET;

  app.post("/api/settings/update-run", async (_req, reply) => {
    if (!updateConfigured())
      return reply.code(400).send({ error: "update runner not configured (YUI_UPDATE_SSH_TARGET, see docs/DEPLOY.md)" });
    const run = deps.startUpdate ?? startHostUpdate;
    const r = run();
    if (!r.ok) return reply.code(502).send({ error: r.error ?? "failed to start update" });
    return reply.code(202).send({ ok: true, updating: true });
  });

  // ── F2 Backup: arsip data host + script restore (file yang dijalankan di
  //    host tujuan; api TIDAK pernah mengeksekusinya). ────────────────────
  app.get("/api/backup", async () => ({ bundle: await getRt().backupBundle() }));

  app.get("/api/backup/script", async (_req, reply) => {
    reply.header("content-type", "text/javascript; charset=utf-8");
    reply.header("content-disposition", 'attachment; filename="yuika-restore.mjs"');
    return await getRt().backupRestoreScript();
  });
}

/** SSH ke host VPS dan jalankan update.sh ter-detach. Container API akan
 * di-recreate oleh updater itu; koneksi request mati = diharapkan. */
function startHostUpdate(): { ok: boolean; error?: string } {
  const target = process.env.YUI_UPDATE_SSH_TARGET!; // divalidasi route
  const dir = process.env.YUI_UPDATE_DIR ?? "/opt/Yuika";
  const key = process.env.YUI_UPDATE_SSH_KEY ?? "/run/yuika-update-key";
  const port = process.env.YUI_UPDATE_SSH_PORT;
  if (!fs.existsSync(key))
    return { ok: false, error: `ssh key not found at ${key} (mount it read-only, see docs/DEPLOY.md)` };
  try {
    const flag = path.join(path.dirname(resolvePaths().dbPath), "update-in-progress");
    fs.writeFileSync(flag, JSON.stringify({ at: Date.now() }) + "\n");
  } catch {
    /* flag best-effort */
  }
  const cmd = `cd '${dir.replaceAll("'", "'\\''")}' && nohup ./scripts/update.sh > /tmp/yuika-update.log 2>&1 < /dev/null &`;
  const args = [
    "-i",
    key,
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "ConnectTimeout=10",
    ...(port ? ["-p", port] : []),
    target,
    cmd,
  ];
  try {
    // detached + ignore: ssh kembali cepat (perintah host di-background),
    // updater hidup sendiri di host meski container ini diganti.
    const child = spawn("ssh", args, { detached: true, stdio: "ignore" });
    child.unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

}
