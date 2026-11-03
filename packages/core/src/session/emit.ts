// @yui/core — emitter: append ke store (durable, id monotonic) LALU publish ke bus.
// Urutan ini penting: subscriber SSE yang datang belakangan tetap dapat replay dari store.
import type { YuiEvent, EventDraft } from "@yui/contracts";
import type { SessionStore } from "./store.js";
import type { EventBus } from "../bus.js";

export type Emit = (draft: EventDraft) => void;

export function makeEmitter(store: SessionStore, bus: typeof EventBus, sessionId: string): Emit {
  return (draft) => {
    const event: YuiEvent = store.appendEvent(sessionId, draft);
    bus.publish(sessionId, event);
  };
}
