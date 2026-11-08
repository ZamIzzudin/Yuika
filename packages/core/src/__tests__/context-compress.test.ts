// P0-CORE-4: kompresi konteks v0, view prompt memakai checkpoint saat estimasi
// token melewati ambang. Invariant: TABEL MESSAGES TIDAK PERNAH DIUBAH
// (append-only dijaga); kompresi = lapisan view + tabel checkpoint terpisah.
// Fail-soft: aux model gagal → turn jalan tanpa kompresi.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "../session/store.js";
import { buildContextMessages, DEFAULT_COMPRESS } from "../session/compress.js";
import type { ProviderAdapter, ProviderChunk, ChatRequest, ProviderDone } from "../provider/adapter.js";

let dir: string;
let store: SessionStore;

/** Provider fake: assistant membalas panjang; panggilan ringkasan terdeteksi
 *  lewat konten prompt (SUMMARY_PROMPT) dan membalas ringkasan tetap. */
class FakeProvider implements ProviderAdapter {
  id = "fake";
  auxCalls = 0;
  constructor(public failAux = false) {}
  async chatStream(req: ChatRequest, onChunk: (c: ProviderChunk) => void): Promise<ProviderDone> {
    const last = req.messages[req.messages.length - 1];
    const isAux = (last?.content ?? "").includes("Ringkas percakapan");
    if (isAux) {
      this.auxCalls++;
      if (this.failAux) throw new Error("aux model down");
      onChunk({ type: "text_delta", delta: "RINGKASAN-FAKE" });
      return { type: "done", finishReason: "stop", text: "RINGKASAN-FAKE", toolCalls: [], usage: { inputTokens: 100, outputTokens: 20 } };
    }
    return { type: "done", finishReason: "stop", text: "ok", toolCalls: [] };
  }
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-ctx-"));
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

const OPTS = { ...DEFAULT_COMPRESS, contextTokens: 2_000, threshold: 0.5, keepRecent: 4, minMessages: 8 };

function seedLongSession(sessionId: string, rounds: number) {
  store.createSession(sessionId, "yui-coder", "SYS", []);
  for (let i = 1; i <= rounds; i++) {
    store.appendMessage(sessionId, { role: "user", content: `Tugas ${i}: ${"permintaan panjang ".repeat(30)}` });
    store.appendMessage(sessionId, { role: "assistant", content: `Hasil ${i}: ${"jawaban panjang ".repeat(30)}` });
  }
}

describe("buildContextMessages (P0-CORE-4)", () => {
  it("di bawah ambang → view utuh, tanpa checkpoint, tanpa aux call", async () => {
    seedLongSession("s1", 3); // 6 pesan < minMessages
    const p = new FakeProvider();
    const r = await buildContextMessages(store, p, "m", "s1", OPTS);
    expect(r.compressed).toBe(false);
    expect(r.messages.length).toBe(6);
    expect(p.auxCalls).toBe(0);
    expect(store.latestContextCheckpoint("s1")).toBeNull();
  });

  it("di atas ambang → checkpoint dibuat, view = ringkasan + sisa terbaru; messages ASLI utuh", async () => {
    seedLongSession("s2", 10); // 20 pesan
    const before = store.getMessages("s2");
    const p = new FakeProvider();
    const r = await buildContextMessages(store, p, "m", "s2", OPTS);
    expect(r.compressed).toBe(true);
    expect(r.messagesSummarized).toBeGreaterThanOrEqual(8);
    expect(r.estTokensAfter).toBeLessThan(r.estTokensBefore);
    // View: pasangan ringkasan (user+assistant) + sisa pesan utuh
    expect(r.messages[0]!.content).toContain("RINGKASAN-FAKE");
    expect(r.messages[1]!.content).toContain("melanjutkan");
    // INVARIANT: tabel messages TIDAK berubah (append-only)
    expect(store.getMessages("s2")).toEqual(before);
    const cp = store.latestContextCheckpoint("s2")!;
    expect(cp.summary).toBe("RINGKASAN-FAKE");
    expect(cp.uptoSeq).toBeGreaterThan(0);
  });

  it("pemanggilan kedua: checkpoint dipakai; hanya pesan BARU yang diringkas", async () => {
    seedLongSession("s3", 10);
    const p = new FakeProvider();
    const r1 = await buildContextMessages(store, p, "m", "s3", OPTS);
    expect(r1.compressed).toBe(true);
    // Sesi berlanjut: +4 pesan baru, lalu kompresi lagi
    for (let i = 11; i <= 12; i++) {
      store.appendMessage("s3", { role: "user", content: `Tugas ${i}: ${"permintaan panjang ".repeat(30)}` });
      store.appendMessage("s3", { role: "assistant", content: `Hasil ${i}: ${"jawaban panjang ".repeat(30)}` });
    }
    const auxBefore = p.auxCalls;
    const r2 = await buildContextMessages(store, p, "m", "s3", OPTS);
    if (r2.compressed) {
      expect(p.auxCalls).toBe(auxBefore + 1);
      // pesan yang diringkas kedua kali < total (checkpoint lama tak diulang)
      expect(r2.messagesSummarized).toBeLessThan(24);
    }
    expect(r2.messages[0]!.content).toContain("RINGKASAN-FAKE");
  });

  it("aux model gagal → fail-soft: view utuh, turn tidak terganggu", async () => {
    seedLongSession("s4", 10);
    const p = new FakeProvider(true);
    const r = await buildContextMessages(store, p, "m", "s4", OPTS);
    expect(r.compressed).toBe(false);
    expect(r.messages.length).toBe(20);
    expect(store.latestContextCheckpoint("s4")).toBeNull();
  });

  it("tidak memotong pasangan toolCalls/tool-result: potongan tepat sebelum pesan user", async () => {
    store.createSession("s5", "yui-coder", "SYS", []);
    // blok: user / assistant(toolCalls) / tool / user / assistant ... cukup panjang
    for (let i = 1; i <= 8; i++) {
      store.appendMessage("s5", { role: "user", content: `Tugas ${i}: ${"x ".repeat(200)}` });
      store.appendMessage("s5", { role: "assistant", content: "", toolCalls: [{ id: `c${i}`, name: "read_file", args: {} }] });
      store.appendMessage("s5", { role: "tool", toolCallId: `c${i}`, content: "hasil".repeat(200) });
      store.appendMessage("s5", { role: "assistant", content: `Selesai ${i} ${"y ".repeat(200)}` });
    }
    const p = new FakeProvider();
    const r = await buildContextMessages(store, p, "m", "s5", OPTS);
    expect(r.compressed).toBe(true);
    // Setelah ringkasan (2 pesan pasangan), pesan PERTAMA sisa harus role user
    expect(r.messages[2]!.role).toBe("user");
    // Tidak ada tool-result yatim: setiap role tool didahului assistant dgn toolCalls
    for (let i = 0; i < r.messages.length; i++) {
      if (r.messages[i]!.role === "tool") {
        const prev = r.messages[i - 1]!;
        expect(prev.role === "assistant" && Array.isArray(prev.toolCalls) && prev.toolCalls.some((c) => c.id === r.messages[i]!.toolCallId)).toBe(true);
      }
    }
  });
});
