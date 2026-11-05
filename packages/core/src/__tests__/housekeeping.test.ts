// P0-DATA-2 — retention & housekeeping events (tabel aktif tetap ramping,
// arsip dibaca via UNION sehingga replay/hidrasi/growth tetap utuh).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { SessionStore } from "../session/store.js";
import type { EventDraft } from "@yuika/contracts";

let n = 0;
function mkStore(): SessionStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-hk-"));
  return new SessionStore(path.join(dir, "t.db"));
}
/** Test util: geser ts sebuah event (simulasi "lama") — hanya di test,
 *  runtime tidak pernah memutasi baris events. */
function setTs(store: SessionStore, eventId: number, ts: number): void {
  const db = (store as unknown as { db: Database.Database }).db;
  db.prepare("UPDATE events SET ts = ? WHERE id = ?").run(ts, eventId);
}

const FUTURE = Date.now() + 40 * 86_400_000; // "sekarang" 40 hari ke depan → cutoff = +10 hari

describe("P0-DATA-2 retention events", () => {
  it("events sesi dingin terarsip; getEvents tetap lengkap & berurutan (UNION) + idempoten", () => {
    const store = mkStore();
    const sid = `s${++n}`;
    store.createSession(sid, "yui-scribe", "SYS", []);
    for (let i = 0; i < 5; i++) store.appendEvent(sid, { type: "message.delta", turnId: "t1", delta: `t${i}` } as EventDraft);
    store.appendEvent(sid, { type: "persona.state", personaId: "yui-scribe", state: "done" } as EventDraft);

    const before = store.getEvents(sid).map((e) => e.id);
    const r = store.archiveOldEvents(30, FUTURE);
    expect(r.archived).toBe(6);
    expect(r.sessions).toBe(1);

    const after = store.getEvents(sid).map((e) => e.id);
    expect(after).toEqual(before); // identitas & urutan sama persis — replay aman
    expect(store.archiveOldEvents(30, FUTURE).archived).toBe(0); // idempoten
  });

  it("sesi AKTIF (event terakhir ≥ cutoff) tidak disentuh", () => {
    const store = mkStore();
    const cold = `s${++n}`;
    store.createSession(cold, "yui-scribe", "SYS", []);
    store.appendEvent(cold, { type: "message.delta", turnId: "t1", delta: "lama" } as EventDraft);
    store.appendEvent(cold, { type: "message.delta", turnId: "t1", delta: "lama2" } as EventDraft);
    const hot = `s${++n}`;
    store.createSession(hot, "yui-coder", "SYS", []);
    store.appendEvent(hot, { type: "message.delta", turnId: "t1", delta: "baru" } as EventDraft);
    setTs(store, store.getEvents(hot)[0]!.id, FUTURE - 10 * 86_400_000); // ≥ cutoff → sesi hidup

    const r = store.archiveOldEvents(30, FUTURE);
    expect(r.archived).toBe(2); // hanya sesi dingin
    expect(store.getEvents(hot).length).toBe(1); // sesi aktif utuh di tabel aktif
    expect(store.getEvents(cold).length).toBe(2); // tetap terbaca via UNION
  });

  it("retention 0 = mati (no-op)", () => {
    const store = mkStore();
    const sid = `s${++n}`;
    store.createSession(sid, "yui-scribe", "SYS", []);
    store.appendEvent(sid, { type: "message.delta", turnId: "t1", delta: "x" } as EventDraft);
    expect(store.archiveOldEvents(0, FUTURE)).toEqual({ archived: 0, sessions: 0 });
  });

  it("turn gantung (tanpa penutup) tidak diarsip — milik boot-heal", () => {
    const store = mkStore();
    const sid = `s${++n}`;
    store.createSession(sid, "yui-coder", "SYS", []);
    store.appendEvent(sid, { type: "turn.started", turnId: "t1" } as EventDraft);
    expect(store.findInterruptedTurns().length).toBe(1);
    expect(store.archiveOldEvents(30, FUTURE).archived).toBe(0); // seluruh sesi di-skip
    expect(store.findInterruptedTurns().length).toBe(1); // heal masih melihatnya
  });

  it("growth stats (persona.state done) tetap benar pasca-arsip", () => {
    const store = mkStore();
    const sid = `s${++n}`;
    store.createSession(sid, "yui-scribe", "SYS", []);
    store.appendEvent(sid, { type: "persona.state", personaId: "yui-scribe", state: "done" } as EventDraft);
    store.appendEvent(sid, { type: "persona.state", personaId: "yui-scribe", state: "idle" } as EventDraft);
    const before = store.personaDoneTurnCounts().get("yui-scribe") ?? 0;
    store.archiveOldEvents(30, FUTURE);
    expect(store.personaDoneTurnCounts().get("yui-scribe")).toBe(before); // UNION arsip
  });

  it("listProjectSessions: lastEventId tetap benar meski semua events terarsip", () => {
    const store = mkStore();
    const sid = `s${++n}`;
    store.createSession(sid, "yui-scribe", "SYS", [], "p1");
    store.appendEvent(sid, { type: "message.delta", turnId: "t1", delta: "a" } as EventDraft);
    store.appendEvent(sid, { type: "message.delta", turnId: "t1", delta: "b" } as EventDraft);
    const maxId = store.getEvents(sid).at(-1)!.id;
    store.archiveOldEvents(30, FUTURE);
    const listed = store.listProjectSessions("p1");
    expect(listed[0]!.lastEventId).toBe(maxId); // client reconnect dari id yang sama
  });
});
