/**
 * P1-PER-5 blind test persona: run anon (mapping rahasia), tebakan + skor,
 * gerbang 80%, satu run aktif, validasi input. runTurn/mock provider tidak
 * dibutuhkan — deps disuntik langsung (createBlindTest).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBlindTest, BLIND_PROMPTS } from "../personas/blindtest.js";

let dir: string;
const PERSONAS = ["yui-conductor", "yui-coder", "yui-analyst", "yui-scribe"];

/** Deps mock: runTurn resolve setelah tick; jawaban = persona id (terverifikasi
 *  ikut pesan assistant terakhir). */
function makeDeps(opts: { failPersona?: string } = {}) {
  const answers = new Map<string, string>();
  const deps = {
    workspacePath: dir,
    createSession: (personaId: string) => {
      const sid = `s-${personaId}`;
      answers.set(sid, `JAWABAN-DARI-${personaId}`);
      return sid;
    },
    runTurn: async (sid: string) => {
      if (opts.failPersona && sid === `s-${opts.failPersona}`) throw new Error("provider down");
    },
    lastAssistantText: (sid: string) => answers.get(sid) ?? null,
    validPersonaIds: () => PERSONAS,
  };
  return { deps, answers };
}

async function waitRunDone(poll: () => unknown, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await new Promise((r) => setTimeout(r, 25));
    const runs = poll() as Array<{ status: string }>;
    if (runs[0]?.status !== "running") return;
  }
  throw new Error("run tidak selesai dalam waktu uji");
}

describe("blind test persona (P1-PER-5)", () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-blind-"));
  });
  afterEach(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows */
    }
  });

  it("prompt uji tersedia 5 ranah", () => {
    expect(BLIND_PROMPTS.length).toBe(5);
    expect(BLIND_PROMPTS.map((p) => p.id)).toEqual(["plan", "debug", "review", "research", "qa"]);
  });

  it("start → anon view tanpa personaId/sessionId; run selesai berisi jawaban", async () => {
    const { deps } = makeDeps();
    const bt = createBlindTest(deps);
    const view = bt.start(["yui-conductor", "yui-coder"], "plan");
    expect(view.entries.length).toBe(2);
    expect(new Set(view.entries.map((e) => e.letter))).toEqual(new Set(["A", "B"]));
    // ANON: identitas tidak bocor sebelum submit
    for (const e of view.entries) {
      expect(e.personaId).toBe("");
      expect(e.sessionId).toBe("");
    }
    await waitRunDone(() => bt.list());
    const done = bt.get(view.id)!;
    expect(done.status).toBe("done");
    for (const e of done.entries) {
      expect(e.status).toBe("done");
      expect(e.answer).toMatch(/^JAWABAN-DARI-yui-/);
      expect(e.personaId).toBe(""); // tetap rahasia
    }
  });

  it("tebakan benar → skor 100% + reveal mapping + gate pass", async () => {
    const { deps } = makeDeps();
    const bt = createBlindTest(deps);
    const view = bt.start(["yui-conductor", "yui-coder", "yui-analyst"], "debug");
    await waitRunDone(() => bt.list());
    // bangun tebakan benar dari file internal (simulasi penguji sempurna)
    const raw = JSON.parse(
      fs.readFileSync(path.join(dir, "blindtests", `${view.id}.json`), "utf-8"),
    ) as { entries: Array<{ letter: string; personaId: string }> };
    const guesses = Object.fromEntries(raw.entries.map((e) => [e.letter, e.personaId]));
    const scored = bt.submit(view.id, guesses);
    expect(scored.correct).toBe(3);
    expect(scored.score).toBe(1);
    expect(scored.gatePass).toBe(true);
    // reveal: personaId kini tampil
    expect(scored.entries.every((e) => e.personaId !== "")).toBe(true);
  });

  it("tebakan salah satu → gate fail (60%)", async () => {
    const { deps } = makeDeps();
    const bt = createBlindTest(deps);
    const view = bt.start(["yui-conductor", "yui-coder", "yui-analyst"], "review");
    await waitRunDone(() => bt.list());
    const raw = JSON.parse(
      fs.readFileSync(path.join(dir, "blindtests", `${view.id}.json`), "utf-8"),
    ) as { entries: Array<{ letter: string; personaId: string }> };
    const guesses = Object.fromEntries(raw.entries.map((e) => [e.letter, e.personaId]));
    const letters = Object.keys(guesses);
    guesses[letters[0]!] = PERSONAS.find((p) => p !== guesses[letters[0]!])!; // 1 salah
    const scored = bt.submit(view.id, guesses);
    expect(scored.correct).toBe(2);
    expect(scored.score).toBeCloseTo(2 / 3);
    expect(scored.gatePass).toBe(false);
  });

  it("satu run aktif → start kedua ditolak; submit idempotent", async () => {
    const { deps } = makeDeps();
    const bt = createBlindTest(deps);
    bt.start(["yui-conductor", "yui-coder"], "plan");
    expect(() => bt.start(["yui-analyst", "yui-scribe"], "qa")).toThrow(/masih ada run aktif/);
    const runs = bt.list();
    const id = runs[0]!.id;
    await waitRunDone(() => bt.list());
    const raw = JSON.parse(
      fs.readFileSync(path.join(dir, "blindtests", `${id}.json`), "utf-8"),
    ) as { entries: Array<{ letter: string; personaId: string }> };
    const guesses = Object.fromEntries(raw.entries.map((e) => [e.letter, e.personaId]));
    const first = bt.submit(id, guesses);
    const second = bt.submit(id, guesses); // ulang → tampil skor sama
    expect(second.correct).toBe(first.correct);
  });

  it("validasi: <2 persona, persona tak dikenal, prompt tak dikenal", () => {
    const { deps } = makeDeps();
    const bt = createBlindTest(deps);
    expect(() => bt.start(["yui-conductor"], "plan")).toThrow(/2-6 persona/);
    expect(() => bt.start(["yui-conductor", "yui-ghost"], "plan")).toThrow(/tidak dikenal/);
    expect(() => bt.start(["yui-conductor", "yui-coder"], "nope")).toThrow(/prompt/);
  });

  it("entry gagal provider → status failed, run tetap done; tebakan hanya untuk done", async () => {
    const { deps } = makeDeps({ failPersona: "yui-coder" });
    const bt = createBlindTest(deps);
    const view = bt.start(["yui-conductor", "yui-coder"], "plan");
    await waitRunDone(() => bt.list());
    const done = bt.get(view.id)!;
    expect(done.status).toBe("done"); // sebagian sukses
    const failed = done.entries.find((e) => e.status === "failed");
    expect(failed?.error).toContain("provider down");
    const guessable = done.entries.filter((e) => e.status === "done");
    expect(guessable.length).toBe(1);
    const raw = JSON.parse(
      fs.readFileSync(path.join(dir, "blindtests", `${view.id}.json`), "utf-8"),
    ) as { entries: Array<{ letter: string; personaId: string }> };
    const okEntry = raw.entries.find((e) => e.letter === guessable[0]!.letter)!;
    const scored = bt.submit(view.id, { [okEntry.letter]: okEntry.personaId });
    expect(scored.correct).toBe(1);
    expect(scored.score).toBe(1);
  });
});
