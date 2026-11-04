// Dev quirk dev-10 (bug "UI diam walau trace jalan"): HMR me-re-eval modul bus
// saat core berubah — emitter HARUS tetap satu (cache globalThis). Kalau pecah,
// turn lama publish ke bus lama, SSE route baru subscribe ke bus baru → event
// tak pernah sampai UI walau tersimpan di DB.
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../bus.js";
import type { YuiEvent } from "@yui/contracts";

const ev = (id: number): YuiEvent =>
  ({ type: "turn.started", turnId: `t${id}`, id, ts: id, sessionId: "s-hmr" }) as YuiEvent;

describe("EventBus singleton (tahan HMR)", () => {
  it("module re-eval (vi.resetModules) → emitter SAMA — subscriber lama tetap menerima publish dari instance baru", async () => {
    const seen: number[] = [];
    EventBus.subscribe("s-hmr", (e) => seen.push(e.id));
    expect((globalThis as { __yuiBusEmitter?: object }).__yuiBusEmitter).toBeDefined();

    vi.resetModules(); // simulasi HMR: modul dievaluasi ulang
    const { EventBus: EventBus2 } = await import("../bus.js");
    EventBus2.publish("s-hmr", ev(1)); // publisher = instance BARU…

    expect(seen).toEqual([1]); // …diterima subscriber instance LAMA
    expect((globalThis as { __yuiBusEmitter?: object }).__yuiBusEmitter).toBeDefined();
  });
});
