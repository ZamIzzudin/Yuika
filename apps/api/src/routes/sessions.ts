// @yuika/api — routes sesi (P0-INF-1, port 1:1 dari Next route handlers).
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";
import type { YuiEvent } from "@yuika/contracts";
import { CreateSessionRequest, SendMessageRequest } from "@yuika/contracts";

export function registerSessionRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  app.post("/api/sessions", async (req, reply) => {
    const body = CreateSessionRequest.parse(req.body);
    const { sessionId, persona, projectId } = getRt().createSession(body.personaId, body.projectId ?? null);
    return reply.code(200).send({ sessionId, persona, projectId });
  });

  /** Riwayat sesi sebuah project (terbaru dulu) — pintu resume percakapan. */
  app.get("/api/sessions", async (req) => {
    const projectId = (req.query as Record<string, string | undefined>).projectId;
    if (!projectId) return { sessions: [] };
    return { sessions: getRt().listProjectSessions(projectId) };
  });

  /** POST /api/sessions/:id/cancel — tombol Stop (P0-CORE-1).
   *  Abort HTTP provider + loop; progres tersimpan, turn berakhir graceful. */
  app.post("/api/sessions/:id/cancel", async (req) => ({ cancelled: getRt().cancelTurn((req.params as { id: string }).id) }));

  /** Replay event (resume/reconnect) — pola events.since Hermes. */
  app.get("/api/sessions/:id/events", async (req) => {
    const { id } = req.params as { id: string };
    const since = Number((req.query as Record<string, string | undefined>).since ?? 0);
    return { events: getRt().getEvents(id, since) };
  });

  app.post("/api/sessions/:id/message", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = SendMessageRequest.parse(req.body);
    const rt = getRt();
    // Fire-and-forget: turn jalan async; client menerima progres via SSE stream.
    void rt.runTurn(id, body.text).catch((err: unknown) => {
      console.error("[yui] turn gagal:", err);
      rt.emitSessionError(id, err instanceof Error ? err.message : String(err));
    });
    return reply.code(200).send({ accepted: true });
  });

  /** GET → trace per turn sesi ini (P1-INF-4): langkah kronologis (model/tool/
   *  delegasi/approval/error) + token per turn dari ledger. UI: panel Trace. */
  app.get("/api/sessions/:id/trace", async (req) => getRt().getTrace((req.params as { id: string }).id));

  /** SSE stream: replay dari store (since) lalu live via EventBus.
   *  - `id: <eventId>` dikirim agar auto-reconnect browser membawa Last-Event-Id
   *    (replay reconnect mulai dari titik yang benar, bukan since awal URL).
   *  - `?snapshot=1` = replay lalu TUTUP (sekali baca — dipakai client resync
   *    saat window fokus: menutup celah event yang terlewat, tanpa SSE ganda). */
  app.get("/api/sessions/:id/stream", (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as Record<string, string | undefined>;
    const headerSince = Number(req.headers["last-event-id"] ?? 0) || 0;
    const since = Math.max(Number(q.since ?? 0) || 0, headerSince);
    const snapshot = q.snapshot === "1";
    const rt = getRt();

    reply.hijack();
    // hijack() melewati pipeline reply Fastify — header @fastify/cors (onRequest)
    // tak pernah tersalin ke raw response. Browser (web:3000 → api:3211, atau
    // E2E :3990 → :3291) memblokir stream tanpa ACAO. Refleksikan origin manual,
    // selaras kebijakan cors { origin: true } app.ts.
    const origin = req.headers.origin;
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
    });

    let closed = false;
    const send = (e: YuiEvent) => {
      if (closed) return;
      reply.raw.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`);
    };
    // Anti-race & anti-duplikat: subscribe dulu (buffer), replay dari store, lalu
    // flush buffer — event hidup hanya dikirim bila id > lastSent (id monotonic).
    const buffer: YuiEvent[] = [];
    let flushing = true;
    let lastSent = since;
    const finish = () => {
      if (closed) return;
      closed = true;
      unsub();
      reply.raw.end();
    };
    const unsub = rt.subscribe(id, (e) => {
      if (flushing) buffer.push(e);
      else if (e.id > lastSent) {
        lastSent = e.id;
        send(e);
        if (snapshot) finish(); // mode sekali baca: cukup satu event terbaru
      }
    });
    for (const e of rt.getEvents(id, since)) {
      lastSent = Math.max(lastSent, e.id);
      send(e);
    }
    for (const e of buffer) {
      if (e.id > lastSent) {
        lastSent = e.id;
        send(e);
      }
    }
    buffer.length = 0;
    if (snapshot) {
      finish();
      return;
    }
    flushing = false;
    req.raw.on("close", () => {
      closed = true;
      unsub();
      reply.raw.end();
    });
  });
}
