import { NextRequest } from "next/server";
import type { YuiEvent } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** SSE stream: replay dari store (since) lalu live via EventBus. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const since = Number(new URL(req.url).searchParams.get("since") ?? 0);
  const rt = getRuntime();

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (e: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* controller closed */
        }
      };
      // Anti-race & anti-duplikat: subscribe dulu (buffer), replay dari store, lalu
      // flush buffer — event hidup hanya dikirim bila id > lastSent (id monotonic).
      const buffer: YuiEvent[] = [];
      let flushing = true;
      let lastSent = since;
      const unsub = rt.subscribe(id, (e) => {
        if (flushing) buffer.push(e);
        else if (e.id > lastSent) {
          lastSent = e.id;
          send(e);
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
      flushing = false;
      req.signal.addEventListener("abort", () => {
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
