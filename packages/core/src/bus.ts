// @yui/core — in-process event bus (DEMO-SHORTCUT: P0 mengganti dengan Redis Streams
// saat worker pool terpisah; kontrak event TIDAK berubah).
import type { YuiEvent } from "@yui/contracts";
import { EventEmitter } from "node:events";

const bus = new EventEmitter();
bus.setMaxListeners(1000);

export const EventBus = {
  publish(sessionId: string, event: YuiEvent): void {
    bus.emit(sessionId, event);
  },
  subscribe(sessionId: string, listener: (e: YuiEvent) => void): () => void {
    bus.on(sessionId, listener);
    return () => bus.off(sessionId, listener);
  },
};
