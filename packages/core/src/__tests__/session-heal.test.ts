// P0 reliabilitas (feedback user dev-10): server dimatikan saat turn berjalan →
// setelah restart, turn itu TIDAK ada proses di belakangnya; heal menutup jujur
// (delegation.done sintetis + session.error + idle) supaya replay UI tidak
// menampilkan "berjalan" zombie. Turn sehat/batal/error tidak disentuh.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "../session/store.js";
import { healInterruptedTurns } from "../session/heal.js";
import type { EventDraft } from "@yuika/contracts";

let dir: string;
let store: SessionStore;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-heal-"));
  store = new SessionStore(path.join(dir, "t.db"));
  store.createSession("s1", "yui-conductor", "SYS", []);
});
afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const push = (...drafts: EventDraft[]) => drafts.forEach((d) => store.appendEvent("s1", d));

describe("healInterruptedTurns (boot heal)", () => {
  it("turn menggantung + delegasi anak tanpa done → ditutup jujur & idempoten", () => {
    push(
      { type: "turn.started", turnId: "t1" },
      { type: "persona.state", personaId: "yui-conductor", state: "thinking" },
      { type: "delegation.started", turnId: "t1", childSessionId: "c1", personaId: "yui-scholar", goal: "riset" }
      // ← server dimatikan di sini; tidak ada penutup
    );
    const healed = healInterruptedTurns(store);
    expect(healed).toEqual(["s1"]);
    const evs = store.getEvents("s1").map((e) => e.type);
    // urutan: delegasi ditutup dulu, lalu error + idle
    expect(evs.slice(-3)).toEqual(["delegation.done", "session.error", "persona.state"]);
    const last = store.getEvents("s1");
    const done = last.find((e) => e.type === "delegation.done")!;
    expect(done).toMatchObject({ childSessionId: "c1" });
    const err = last.find((e) => e.type === "session.error")!;
    expect(err.recoverable).toBe(true);
    // idempoten: panggil ulang → tidak ada event baru
    expect(healInterruptedTurns(store)).toEqual([]);
    expect(store.getEvents("s1").filter((e) => e.type === "session.error")).toHaveLength(1);
  });

  it("delegasi yang SUDAH done tidak ditutup dua kali", () => {
    push(
      { type: "turn.started", turnId: "t1" },
      { type: "delegation.started", turnId: "t1", childSessionId: "c1", personaId: "yui-scholar", goal: "riset" },
      { type: "delegation.done", turnId: "t1", childSessionId: "c1", summary: "ok" },
      { type: "persona.state", personaId: "yui-conductor", state: "thinking" }
    );
    healInterruptedTurns(store);
    expect(store.getEvents("s1").filter((e) => e.type === "delegation.done")).toHaveLength(1);
  });

  it("turn sehat (persona.state done) → tidak disentuh", () => {
    push(
      { type: "turn.started", turnId: "t1" },
      { type: "persona.state", personaId: "yui-conductor", state: "thinking" },
      { type: "message.done", turnId: "t1" },
      { type: "persona.state", personaId: "yui-conductor", state: "done" }
    );
    expect(healInterruptedTurns(store)).toEqual([]);
  });

  it("turn dibatalkan user (turn.cancelled) & turn error provider → tidak disentuh", () => {
    store.createSession("s2", "yui-scribe", "SYS", []);
    store.appendEvent("s1", { type: "turn.started", turnId: "t1" });
    store.appendEvent("s1", { type: "turn.cancelled", turnId: "t1" });
    store.appendEvent("s2", { type: "turn.started", turnId: "t2" });
    store.appendEvent("s2", { type: "session.error", message: "provider mati", recoverable: false });
    expect(healInterruptedTurns(store)).toEqual([]);
  });
});
