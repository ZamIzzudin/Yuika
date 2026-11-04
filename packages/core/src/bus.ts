// @yui/core — in-process event bus (DEMO-SHORTCUT: P0 mengganti dengan Redis Streams
// saat worker pool terpisah; kontrak event TIDAK berubah).
// QUIRK dev (dipelajari dev-10): emitter HARUS di-cache di globalThis — HMR Next
// me-re-eval modul ini saat core berubah, dan turn yang masih berjalan di runtime
// LAMA akan publish ke instance emitter lama. Dua bus = "split brain": event masuk
// DB (trace jalan) tapi SSE route baru tak pernah menerima → UI diam sampai refresh
// manual. Dengan cache globalThis semua module-instance berbagi bus yang sama.
import type { YuiEvent } from "@yui/contracts";
import { EventEmitter } from "node:events";

const g = globalThis as unknown as { __yuiBusEmitter?: EventEmitter };
const bus = g.__yuiBusEmitter ?? new EventEmitter();
bus.setMaxListeners(1000);
g.__yuiBusEmitter = bus;

export const EventBus = {
  publish(sessionId: string, event: YuiEvent): void {
    bus.emit(sessionId, event);
  },
  subscribe(sessionId: string, listener: (e: YuiEvent) => void): () => void {
    bus.on(sessionId, listener);
    return () => bus.off(sessionId, listener);
  },
};
