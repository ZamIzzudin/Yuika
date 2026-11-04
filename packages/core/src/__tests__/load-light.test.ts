// P0-QA-2: load ringan — 10 sesi paralel × 5 turn TANPA deadlock/leak.
// Provider fake instan; fokus: concurrency loop + store + cap delegasi konsisten,
// semua turn selesai dengan utuh & urutan history benar per sesi.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetRegistryForTests } from "../registry.js";
import { SessionStore } from "../session/store.js";
import { AgentLoop } from "../loop.js";
import type { ProviderAdapter, ProviderChunk, ChatRequest, ProviderDone } from "../provider/adapter.js";

/** Provider instan dengan jitter kecil — meniru I/O async tanpa I/O nyata. */
class JitterProvider implements ProviderAdapter {
  id = "fake";
  calls = 0;
  async chatStream(_req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
    this.calls++;
    await new Promise((r) => setTimeout(r, 1 + Math.floor(Math.random() * 5)));
    onChunk({ type: "text_delta", delta: "ok" });
    return { type: "done", finishReason: "stop", text: "ok", toolCalls: [] };
  }
}

let dir: string;
let store: SessionStore;

beforeEach(() => {
  resetRegistryForTests();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-load-"));
  store = new SessionStore(path.join(dir, "t.db"));
});
afterEach(() => {
  store.close();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* lenient */
  }
});

describe("load ringan 10 sesi × 5 turn (P0-QA-2)", () => {
  it("semua turn selesai; history sesi utuh & berurutan; tanpa kontaminasi antar-sesi", async () => {
    const provider = new JitterProvider();
    const ws = path.join(dir, "ws");
    fs.mkdirSync(ws, { recursive: true });
    const SESSIONS = 10;
    const TURNS = 5;

    const loops = Array.from({ length: SESSIONS }, (_, i) => {
      store.createSession(`s_load_${i}`, "yui-coder", `SYS-${i}`, []);
      return new AgentLoop({
        store,
        provider,
        model: "m",
        workspacePath: ws,
        approvals: { request: async () => true } as never,
        emit: () => {},
      });
    });

    // SEMUA sesi berjalan PARALEL, tiap sesi berurutan 5 turn.
    const t0 = Date.now();
    await Promise.all(
      loops.map((loop, i) =>
        (async () => {
          for (let t = 0; t < TURNS; t++) {
            await loop.runTurn(`s_load_${i}`, `pesan-${i}-${t}`);
          }
        })(),
      ),
    );
    const durMs = Date.now() - t0;

    for (let i = 0; i < SESSIONS; i++) {
      const msgs = store.getMessages(`s_load_${i}`);
      // 5 turn × (user + assistant) = 10 pesan, urutan user→assistant konsisten.
      expect(msgs.length).toBe(TURNS * 2);
      for (let t = 0; t < TURNS; t++) {
        expect(msgs[t * 2]!.role).toBe("user");
        expect(msgs[t * 2]!.content).toBe(`pesan-${i}-${t}`);
        expect(msgs[t * 2 + 1]!.role).toBe("assistant");
      }
    }
    // Provider dipanggil tepat 50× (tanpa retry liar / duplikasi).
    expect(provider.calls).toBe(SESSIONS * TURNS);
    // Cepat (instan provider): deadlock akan membuat ini timeout, bukan lama.
    expect(durMs).toBeLessThan(30_000);
  });
});
