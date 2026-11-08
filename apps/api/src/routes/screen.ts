// @yuika/api, Batch 14a (P2-SCR): routes shared live screen.
//   GET    /api/projects/:id/screens                       → daftar sesi (selector tab Browser)
//   POST   /api/projects/:id/screens                       {personaId} → start/ambil
//   DELETE /api/projects/:id/screens/:persona              → stop
//   GET    /api/projects/:id/screens/:persona/stream       → SSE (state + frame base64 jpeg)
//   POST   /api/projects/:id/screens/:persona/input        → input user (butuh lease user)
//   POST   /api/projects/:id/screens/:persona/take         → user ambil alih (fence)
//   POST   /api/projects/:id/screens/:persona/yield        → user melepas
//   POST   /api/takeover/:requestId/resolve                {grant} → jawab kartu persona
//   GET    /api/takeover/pending                           → kartu aktif (replay)
// Frame TIDAK lewat event bus sesi (bandwidth), SSE khusus ini.
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";
import {
  ensureScreen, stopScreen, listScreens, subscribeScreen, screenKey,
  screenNavigate, screenClick, screenType, screenPress, screenScroll,
  takeLease, yieldLease, leaseOwner, resolveTakeover, listPendingTakeovers,
} from "@yuika/core";
import { moduleLogger } from "@yuika/core";
import { z } from "zod";

const log = moduleLogger("api:screen");

const startBody = z.object({ personaId: z.string().min(1) });
const inputBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("navigate"), url: z.string().min(1).max(2000) }),
  z.object({ kind: z.literal("click"), x: z.number(), y: z.number(), dbl: z.boolean().optional() }),
  z.object({ kind: z.literal("type"), text: z.string().max(4000) }),
  z.object({ kind: z.literal("press"), key: z.string().min(1).max(32) }),
  z.object({ kind: z.literal("scroll"), deltaX: z.number().optional(), deltaY: z.number().optional() }),
]);

export function registerScreenRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  const dataDir = (): string => getRt().dataDir;

  app.get("/api/projects/:id/screens", async (req) => {
    const { id } = req.params as { id: string };
    return { screens: listScreens(id) };
  });

  app.post("/api/projects/:id/screens", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = startBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "personaId required" });
    if (!getRt().getProject(id)) return reply.code(404).send({ error: "project not found" });
    try {
      const st = await ensureScreen(dataDir(), id, parsed.data.personaId);
      log.info({ key: st.key, personaId: parsed.data.personaId }, "screen session started (user)");
      return st;
    } catch (e) {
      return reply.code(503).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.delete("/api/projects/:id/screens/:persona", async (req) => {
    const { id, persona } = req.params as { id: string; persona: string };
    const ok = await stopScreen(screenKey(id, persona), "user");
    return { ok };
  });

  /** SSE: `state` (replay + live) + `frame` (base64 jpeg). */
  app.get("/api/projects/:id/screens/:persona/stream", async (req, reply) => {
    const { id, persona } = req.params as { id: string; persona: string };
    reply.hijack();
    const origin = req.headers.origin;
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
    });
    let closed = false;
    const writeSse = (event: string, data: string): void => {
      if (closed) return;
      const lines = data.split("\n").map((l) => `data: ${l}`).join("\n");
      reply.raw.write(`event: ${event}\n${lines}\n\n`);
    };
    const sub = subscribeScreen(screenKey(id, persona), (f) => writeSse("frame", JSON.stringify(f)), (st) => writeSse("state", JSON.stringify(st)));
    if (!sub) {
      reply.raw.write(`event: error\ndata: session not active\n\n`);
      reply.raw.end();
      return;
    }
    writeSse("state", JSON.stringify(sub.state));
    if (sub.lastFrame) writeSse("frame", JSON.stringify(sub.lastFrame));
    req.raw.on("close", () => {
      closed = true;
      sub.unsubscribe();
    });
    const ka = setInterval(() => {
      if (closed) return clearInterval(ka);
      reply.raw.write(": ka\n\n");
    }, 20_000);
    ka.unref?.();
  });

  app.post("/api/projects/:id/screens/:persona/input", async (req, reply) => {
    const { id, persona } = req.params as { id: string; persona: string };
    const key = screenKey(id, persona);
    const parsed = inputBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "invalid input body" });
    // input user hanya bila user pegang lease (atau lease kosong → ambil otomatis)
    if (leaseOwner(key) !== "user") {
      const t = takeLease(key, "user");
      if (!t.ok) return reply.code(409).send({ error: `screen is controlled by ${leaseOwner(key)}, use Take control` });
    }
    try {
      const a = parsed.data;
      if (a.kind === "navigate") return await screenNavigate(key, "user", a.url);
      if (a.kind === "click") { await screenClick(key, "user", a.x, a.y, { dbl: a.dbl }); return { ok: true }; }
      if (a.kind === "type") { await screenType(key, "user", a.text); return { ok: true }; }
      if (a.kind === "press") { await screenPress(key, "user", a.key); return { ok: true }; }
      await screenScroll(key, "user", a.deltaX ?? 0, a.deltaY ?? 0);
      return { ok: true };
    } catch (e) {
      return reply.code(409).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/projects/:id/screens/:persona/take", async (req, reply) => {
    const { id, persona } = req.params as { id: string; persona: string };
    const key = screenKey(id, persona);
    const r = takeLease(key, "user");
    if (!r.ok) return reply.code(409).send({ error: `already controlled by ${leaseOwner(key)}` });
    return { ok: true, owner: "user" };
  });

  app.post("/api/projects/:id/screens/:persona/yield", async (req, reply) => {
    const { id, persona } = req.params as { id: string; persona: string };
    const key = screenKey(id, persona);
    const ok = yieldLease(key, "user");
    return ok ? { ok: true } : reply.code(409).send({ error: "you do not hold the lease" });
  });

  // ── SCR-4: jawaban kartu request_takeover ────────────────────────────────
  app.get("/api/takeover/pending", async () => ({ requests: listPendingTakeovers() }));

  app.post("/api/takeover/:requestId/resolve", async (req, reply) => {
    const { requestId } = req.params as { requestId: string };
    const { grant } = (req.body ?? {}) as { grant?: boolean };
    if (typeof grant !== "boolean") return reply.code(400).send({ error: "grant (boolean) required" });
    const ok = resolveTakeover(requestId, grant);
    return ok ? { ok: true } : reply.code(404).send({ error: "request not found (expired or resolved)" });
  });
}
