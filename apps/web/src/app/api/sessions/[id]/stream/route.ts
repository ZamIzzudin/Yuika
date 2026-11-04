import { NextRequest } from "next/server";
import type { YuiEvent } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** SSE stream: replay dari store (since) lalu live via EventBus.
 *  - `id: <eventId>` dikirim agar auto-reconnect browser membawa Last-Event-Id
 *    (replay reconnect mulai dari titik yang benar, bukan since awal URL).
 *  - `?snapshot=1` = replay lalu TUTUP (sekali baca — dipakai client resync
 *    saat window fokus: menutup celah event yang terlewat, tanpa SSE ganda). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const headerSince = Number(req.headers.get("last-event-id") ?? 0) || 0;
  const since = Math.max(Number(q.get("since") ?? 0) || 0, headerSince);
  const snapshot = q.get("snapshot") === "1";
  const rt = getRuntime();

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const send = (e: YuiEvent) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true; // controller closed
        }
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
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      const unsub = rt.subscribe(id, (e) => {
        if (flushing) buffer.push(e);
        else if (e.id > lastSent) {
          lastSent = e.id;
          send(e);
          if (snapshot) finish(); // mode sekali-baca: cukup satu event terbaru
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
      req.signal.addEventListener("abort", () => {
        closed = true;
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
