// @yuika/api — P2-STU-2: routes terminal — sesi shell shared user & agent.
//   POST   /api/terminal/sessions        {projectId} → mulai/ambil sesi
//   GET    /api/terminal/sessions        → daftar
//   GET    /api/terminal/sessions/:id/stream → SSE (replay ring + live)
//   POST   /api/terminal/sessions/:id/input  {data} → tulis stdin
//   DELETE /api/terminal/sessions/:id    → matikan sesi
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";
import {
  ensureTerminalSession,
  writeTerminalInput,
  subscribeTerminal,
  listTerminalSessions,
  killTerminalSession,
} from "@yuika/core";
import { moduleLogger } from "@yuika/core";

const log = moduleLogger("api:terminal");

export function registerTerminalRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  /** Mulai/ambil sesi terminal project (satu per project — shared dengan agent). */
  app.post("/api/terminal/sessions", async (req, reply) => {
    const { projectId } = (req.body ?? {}) as { projectId?: string };
    if (!projectId) return reply.code(400).send({ error: "projectId wajib" });
    const rt = getRt();
    let ws: string;
    try {
      ws = rt.projectWorkspacePath(projectId);
    } catch {
      return reply.code(404).send({ error: "project tidak ditemukan" });
    }
    const info = await ensureTerminalSession(ws);
    log.info({ projectId, terminalId: info.id, backend: info.backend }, "sesi terminal siap");
    return info;
  });

  app.get("/api/terminal/sessions", async () => ({ sessions: listTerminalSessions() }));

  /** Log eksekusi run_command project (view "Commands" panel terminal —
   *  FLOW user 2026-11 #7: run_command terlihat tanpa membuka sesi shell). */
  app.get("/api/projects/:id/terminal/commands", async (req, reply) => {
    const { id } = req.params as { id: string };
    let ws: string;
    try {
      ws = getRt().projectWorkspacePath(id);
    } catch {
      return reply.code(404).send({ error: "project tidak ditemukan" });
    }
    const limit = Math.min(Number((req.query as Record<string, string | undefined>).limit ?? 50) || 50, 200);
    const { listTerminalCommandLog } = await import("@yuika/core");
    return { commands: listTerminalCommandLog(ws, limit).slice().reverse() }; // terbaru dulu
  });

  /** SSE stream: replay ring penuh (event `replay`) lalu chunk live (`data`). */
  app.get("/api/terminal/sessions/:id/stream", async (req, reply) => {
    const { id } = req.params as { id: string };
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
      // multi-baris → beberapa `data:` per SSE spec
      const lines = data.split("\n").map((l) => `data: ${l}`).join("\n");
      reply.raw.write(`event: ${event}\n${lines}\n\n`);
    };
    const sub = subscribeTerminal(id, (chunk) => writeSse("data", chunk), (code) => {
      writeSse("exit", String(code));
      reply.raw.end();
    });
    if (!sub) {
      reply.raw.write(`event: error\ndata: session not found\n\n`);
      reply.raw.end();
      return;
    }
    writeSse("replay", sub.replay);
    req.raw.on("close", () => {
      closed = true;
      sub.unsubscribe();
    });
    // keepalive comment tiap 20 dtk — proxy/dev-server tak memotong idle.
    const ka = setInterval(() => {
      if (closed) return clearInterval(ka);
      reply.raw.write(": ka\n\n");
    }, 20_000);
  });

  /** Ring buffer sesi (JSON) — alternatif SSE utk test/klien ringan. */
  app.get("/api/terminal/sessions/:id/buffer", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { getTerminalSession } = await import("@yuika/core");
    const info = getTerminalSession(id);
    if (!info) return reply.code(404).send({ error: "sesi tidak ditemukan" });
    const sub = subscribeTerminal(id, () => undefined);
    const buffer = sub?.replay ?? "";
    sub?.unsubscribe();
    return { info, buffer };
  });

  app.post("/api/terminal/sessions/:id/input", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { data } = (req.body ?? {}) as { data?: string };
    if (typeof data !== "string") return reply.code(400).send({ error: "data (string) wajib" });
    const ok = writeTerminalInput(id, data);
    return ok ? { ok: true } : reply.code(410).send({ error: "sesi tidak aktif" });
  });

  app.delete("/api/terminal/sessions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = await killTerminalSession(id);
    return ok ? { ok: true } : reply.code(404).send({ error: "sesi tidak ditemukan" });
  });
}
