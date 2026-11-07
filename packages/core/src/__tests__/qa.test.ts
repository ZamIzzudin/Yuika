// SCR-6 (Batch 14b) — QA watch: Sherlock menonton live screen persona lain.
// Browser ASLI (skipIf tak ada executable). Yang diuji:
//  - qa_watch → state target (watchers naik), read-only tanpa lease
//  - qa_snapshot → snapshot sesi TARGET (title page target terbaca)
//  - qa_check → event qa.check ter-emit (shape kontrak)
//  - keep-alive: watcher aktif → sesi TIDAK tool-idle-close; watcher off → close
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { detectBrowserExec, ensureScreen, closeAllScreens, getScreenState, screenKey } from "../screen/manager.js";
import { registry, resetRegistryForTests, type ToolContext } from "../registry.js";
import { registerQaTools } from "../tools/qa-tools.js";
import { registerScreenTools } from "../tools/screen-tools.js";

const PROJECT = "p_qa_test";
const DRIVER = "yui-coder"; // persona yang disetir (target watch)
const WATCHER = "yui-sherlock";

const PAGE = `data:text/html,${encodeURIComponent("<title>driver-at-work</title><h1>Working page</h1>")}`;

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-qa-"));
  resetRegistryForTests();
  registerQaTools();
  registerScreenTools({ dataDir: dir });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await closeAllScreens();
  // best-effort: profil Edge bisa masih dikunci sesaat di Windows (EPERM) —
  // dir tmp dibiarkan bila belum lepas (pola screen.test, OS akan bersihkan).
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* profil masih terkunci */
  }
});

function ctx(personaId = WATCHER): ToolContext {
  return {
    sessionId: "s_qa_test",
    turnId: "t1",
    workspacePath: dir,
    personaId,
    projectId: PROJECT,
    emit: () => undefined,
    requestApproval: async () => true,
  };
}

describe.skipIf(!detectBrowserExec())("SCR-6 qa tools (real browser)", () => {
  it("qa_watch → watchers terlihat di state; qa_snapshot membaca page TARGET", async () => {
    // driver (yui-coder) buka screen via jalur persona asli — sesi milik driver
    await registry.dispatch("browser_open", { url: PAGE }, ctx(DRIVER));
    const driverKey = screenKey(PROJECT, DRIVER);
    await vi.waitFor(() => expect(getScreenState(driverKey)?.title).toBe("driver-at-work"), { timeout: 5_000 });

    // Sherlock menonton (read-only)
    const w = (await registry.dispatch("qa_watch", { target: DRIVER }, ctx())).result as {
      watching: boolean;
      state: { watchers: number; title: string };
    };
    expect(w.watching).toBe(true);
    expect(w.state.watchers).toBeGreaterThanOrEqual(1);
    expect(getScreenState(driverKey)?.watchers).toBe(1);

    // snapshot dari sesi driver — title target terbaca, tanpa lease sherlock
    const snap = await registry.dispatch("qa_snapshot", { target: DRIVER }, ctx());
    expect(snap.isError).toBeFalsy();
    expect((snap.result as { title: string }).title).toBe("driver-at-work");

    // stop watch → watchers turun
    await registry.dispatch("qa_watch", { target: DRIVER, on: false }, ctx());
    expect(getScreenState(driverKey)?.watchers).toBe(0);
  }, 30_000);

  it("qa_check → event qa.check ter-emit dengan shape kontrak", async () => {
    const events: { type: string }[] = [];
    const c: ToolContext = { ...ctx(), emit: (d) => events.push(d as { type: string }) };
    const r = await registry.dispatch(
      "qa_check",
      { item: "login form accepts valid creds", status: "pass", note: "saw redirect to /home", target: DRIVER },
      c,
    );
    expect(r.isError).toBeFalsy();
    expect(events).toHaveLength(1);
    const ev = events[0] as unknown as Record<string, unknown>;
    expect(ev.type).toBe("qa.check");
    expect(ev.item).toBe("login form accepts valid creds");
    expect(ev.status).toBe("pass");
    expect(ev.targetPersonaId).toBe(DRIVER);
    expect(ev.personaId).toBe(WATCHER);
  });

  it("keep-alive: watcher aktif → sesi bertahan melewati tool-idle; off → close", async () => {
    vi.stubEnv("YUI_SCREEN_TOOL_IDLE_MS", "150");
    await registry.dispatch("browser_open", { url: PAGE }, ctx(DRIVER));
    const key = screenKey(PROJECT, DRIVER);
    // Sherlock ON sebelum idle window habis
    await registry.dispatch("qa_watch", { target: DRIVER }, ctx());
    await new Promise((r) => setTimeout(r, 500)); // > 2× idle window
    expect(getScreenState(key), "watcher aktif → sesi tetap hidup").toBeDefined();
    // Sherlock berhenti menonton → idle close berjalan normal
    await registry.dispatch("qa_watch", { target: DRIVER, on: false }, ctx());
    await vi.waitFor(() => expect(getScreenState(key)).toBeUndefined(), { timeout: 5_000 });
  }, 30_000);

  it("qa_watch target tanpa sesi → error jelas + DAFTAR screen aktif utk self-correct (14c)", async () => {
    // buat satu sesi aktif dulu supaya daftar tidak kosong
    await registry.dispatch("browser_open", { url: PAGE }, ctx(DRIVER));
    await vi.waitFor(() => expect(getScreenState(screenKey(PROJECT, DRIVER))?.title).toBe("driver-at-work"), { timeout: 5_000 });

    // id salah (nama tampilan, bukan id teknis) → error + activeScreens berisi kunci benar
    const r = await registry.dispatch("qa_watch", { target: "yui-hiro" }, ctx());
    expect(r.isError).toBe(true);
    const res = r.result as { error: string; activeScreens?: Array<{ key: string; personaId: string }> };
    expect(res.error).toContain("persona ids are technical");
    expect(res.activeScreens?.map((s) => s.key)).toContain(screenKey(PROJECT, DRIVER));

    // tidak ada sesi sama sekali setelah semua ditutup → hint beda
    await registry.dispatch("qa_watch", { target: DRIVER, on: false }, ctx());
    await closeAllScreens();
    const r2 = await registry.dispatch("qa_watch", { target: DRIVER }, ctx());
    const res2 = r2.result as { hint: string; activeScreens: unknown[] };
    expect(res2.activeScreens).toEqual([]);
    expect(res2.hint).toContain("must open its browser first");

    // stop idempoten pada sesi yang sudah mati — bukan error
    const r3 = await registry.dispatch("qa_watch", { target: DRIVER, on: false }, ctx());
    expect(r3.isError).toBeFalsy();
  }, 30_000);

  it("cross-project: persona id unik di project lain → resolve otomatis (14c)", async () => {
    await registry.dispatch("browser_open", { url: PAGE }, ctx(DRIVER));
    await vi.waitFor(() => expect(getScreenState(screenKey(PROJECT, DRIVER))?.title).toBe("driver-at-work"), { timeout: 5_000 });

    // Sherlock berdiri di project BERBEDA → masih bisa menonton driver via id polos
    const other = { ...ctx(), projectId: "p_other_project" };
    const w = (await registry.dispatch("qa_watch", { target: DRIVER }, other)).result as {
      watching: boolean; target: string; crossProject?: boolean;
    };
    expect(w.watching).toBe(true);
    expect(w.target).toBe(screenKey(PROJECT, DRIVER));
    expect(w.crossProject).toBe(true);

    // snapshot ikut resolve ke project yang benar
    const snap = await registry.dispatch("qa_snapshot", { target: DRIVER }, other);
    expect((snap.result as { title: string }).title).toBe("driver-at-work");

    // full key eksplisit juga valid
    const w2 = (await registry.dispatch("qa_watch", { target: screenKey(PROJECT, DRIVER), on: false }, other)).result as { watching: boolean };
    expect(w2.watching).toBe(false);
  }, 30_000);
});
