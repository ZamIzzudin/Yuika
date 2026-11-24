// D123: windowed history - keyset pagination pesan & event (cursor beforeSeq/
// beforeId), paritas paritas driver. Sumber: hydration chat panjang + tombol
// "load earlier" (host web & remote mobile) yang tak boleh menarik seluruh
// riwayat sekaligus.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "../session/store.js";
import type { InternalMessage } from "../provider/adapter.js";

function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-window-"));
  return { store: new SessionStore(path.join(dir, "test.db")), dir };
}

function msg(role: InternalMessage["role"], content: string): InternalMessage {
  return { role, content } as InternalMessage;
}

describe("D123: getMessagesWindow (keyset pagination)", () => {
  it("ekor default + walk mundur dengan cursor, hasMore akurat", () => {
    const { store } = makeStore();
    store.createSession("s1", "yui-scribe", "SYS", []);
    for (let i = 1; i <= 25; i++) store.appendMessage("s1", msg(i % 2 ? "user" : "assistant", `m${i}`));

    // ekor: 10 terakhir, urut NAIK (m16..m25), ada yang lebih tua
    const tail = store.getMessagesWindow("s1", { limit: 10 });
    expect(tail.messages.map((r) => r.msg.content)).toEqual(
      Array.from({ length: 10 }, (_, i) => `m${16 + i}`),
    );
    expect(tail.hasMore).toBe(true);

    // halaman 2: sebelum seq pertama halaman 1
    const before = tail.messages[0]!.seq;
    const page2 = store.getMessagesWindow("s1", { beforeSeq: before, limit: 10 });
    expect(page2.messages.map((r) => r.msg.content)).toEqual(
      Array.from({ length: 10 }, (_, i) => `m${6 + i}`),
    );
    expect(page2.hasMore).toBe(true);

    // halaman terakhir: sisa 5, hasMore=false
    const before2 = page2.messages[0]!.seq;
    const page3 = store.getMessagesWindow("s1", { beforeSeq: before2, limit: 10 });
    expect(page3.messages.map((r) => r.msg.content)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
    expect(page3.hasMore).toBe(false);

    // halaman kosong bila sebelum seq terkecil
    expect(store.getMessagesWindow("s1", { beforeSeq: page3.messages[0]!.seq, limit: 10 }).messages).toHaveLength(0);
    store.close();
  });

  it("sedikit pesan: hasMore=false, limit di-clamp", () => {
    const { store } = makeStore();
    store.createSession("s1", "yui-scribe", "SYS", []);
    store.appendMessage("s1", msg("user", "only"));
    expect(store.getMessagesWindow("s1", { limit: 5 })).toMatchObject({ hasMore: false });
    expect(store.getMessagesWindow("s1", { limit: 5 }).messages).toHaveLength(1);
    // limit absurd di-clamp ke rentang wajar, tak melempar
    expect(() => store.getMessagesWindow("s1", { limit: 0 })).not.toThrow();
    expect(() => store.getMessagesWindow("s1", { limit: 1_000_000 })).not.toThrow();
    store.close();
  });

  it("sesi lain terisolasi", () => {
    const { store } = makeStore();
    store.createSession("s1", "a", "S", []);
    store.createSession("s2", "b", "S", []);
    for (let i = 0; i < 5; i++) store.appendMessage("s1", msg("user", `a${i}`));
    store.appendMessage("s2", msg("user", "b0"));
    expect(store.getMessagesWindow("s2").messages.map((r) => r.msg.content)).toEqual(["b0"]);
    store.close();
  });
});

describe("D123: getEventsWindow (keyset pagination, termasuk arsip)", () => {
  it("ekor + walk mundur + hasMore", () => {
    const { store } = makeStore();
    store.createSession("s1", "yui-scribe", "SYS", []);
    for (let i = 0; i < 12; i++) store.appendEvent("s1", { type: "message.delta", turnId: "t", delta: `d${i}` });

    const tail = store.getEventsWindow("s1", { limit: 5 });
    expect(tail.events).toHaveLength(5);
    expect(tail.hasMore).toBe(true);
    // urut NAIK & id monotonic
    for (let i = 1; i < tail.events.length; i++) {
      expect(tail.events[i]!.id).toBeGreaterThan(tail.events[i - 1]!.id);
    }

    const before = tail.events[0]!.id;
    const page2 = store.getEventsWindow("s1", { beforeId: before, limit: 5 });
    expect(page2.events).toHaveLength(5);
    expect(page2.hasMore).toBe(true);
    expect(page2.events.every((e) => e.id < before)).toBe(true);

    const page3 = store.getEventsWindow("s1", { beforeId: page2.events[0]!.id, limit: 5 });
    expect(page3.events).toHaveLength(2);
    expect(page3.hasMore).toBe(false);
    store.close();
  });

  it("menggabungkan events aktif + events_archive (retensi tetap terlihat)", () => {
    const { store } = makeStore();
    store.createSession("s1", "yui-scribe", "SYS", []);
    // 6 event LAMA: ts digeser ke masa lalu, lalu diarsip via "sekarang" 40 hari
    // ke depan (retensi 30 hari) - pola sama dengan housekeeping.test.
    for (let i = 0; i < 6; i++) store.appendEvent("s1", { type: "message.delta", turnId: "t", delta: `old${i}` });
    const db = (store as unknown as { db: { prepare: (s: string) => { run: (...a: unknown[]) => void } } }).db;
    db.prepare("UPDATE events SET ts = ?").run(Date.now() - 100 * 86_400_000);
    const archived = store.archiveOldEvents(30, Date.now() + 40 * 86_400_000);
    expect(archived.archived).toBe(6);
    for (let i = 0; i < 3; i++) store.appendEvent("s1", { type: "message.delta", turnId: "t", delta: `new${i}` });

    // window besar harus melihat SEMUA 9 (6 arsip + 3 aktif), urut naik
    const all = store.getEventsWindow("s1", { limit: 50 });
    expect(all.events).toHaveLength(9);
    expect(all.events.map((e) => (e.type === "message.delta" ? e.delta : "")).slice(0, 6)).toEqual(
      ["old0", "old1", "old2", "old3", "old4", "old5"],
    );
    // halaman ekor kecil: seluruh id dari arsip tetap lebih kecil dari aktif
    const tail = store.getEventsWindow("s1", { limit: 3 });
    expect(tail.events.every((e) => e.id > all.events[5]!.id)).toBe(true);
    store.close();
  });
});
