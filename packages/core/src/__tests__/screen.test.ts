// (P2-SCR), Live Screen: lease fence (rokazo), CDP parse, manager
// dengan browser ASLI (skipIf tak ada executable, mesin dev Edge terbukti
// via probe SCR-0), tools browser_* end-to-end, takeover pending, dan guard
// eksklusi .yuika dari Files (SCR-3).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  screenLeaseId, parseScreenLeaseId, canTakeScreenLease, canReleaseScreenLease,
} from "../screen/lease.js";
import { parseDevToolsUrl } from "../screen/cdp.js";
import { detectBrowserExec } from "../screen/manager.js";
import {
  ensureScreen, stopScreen, screenKey, takeLease, yieldLease, leaseOwner,
  subscribeScreen, screenNavigate, screenSnapshot, screenClick, screenType,
  openTakeoverRequest, resolveTakeover, listPendingTakeovers, closeAllScreens,
  getScreenState,
} from "../screen/manager.js";
import { registry, resetRegistryForTests, type ToolContext } from "../registry.js";
import { registerScreenTools } from "../tools/screen-tools.js";
import { buildFileTree } from "../project/files.js";
import { VaultManager, getVault, setVaultForTests } from "../vault/manager.js";
import { VaultStore } from "../vault/store.js";
import { loadVaultMasterKey } from "../vault/store.js";
import { openLoginRequest, resolveLogin, listPendingLogins, screenEvalJson } from "../screen/manager.js";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-screen-"));
  resetRegistryForTests();
  registerScreenTools({ dataDir: dir });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await closeAllScreens();
});

const PROJECT = "p_scr_test";
const PERSONA = "yui-tester";

function ctx(): ToolContext {
  return {
    sessionId: "s_scr",
    turnId: "t_scr",
    workspacePath: dir,
    personaId: PERSONA,
    projectId: PROJECT,
    emit: () => undefined,
    requestApproval: async () => true,
  };
}

/** Halaman data: URL deterministik (tanpa network), di-encode karena
 *  data: URL tak boleh memuat spasi mentah. */
const PAGE_HTML = `<title>SCR test</title><input id=q placeholder=Type here><button onclick="this.textContent='clicked-' + document.getElementById('q').value">go</button><a href="#" id=l1>link one</a><p>hello screen</p>`;
const PAGE = `data:text/html,${encodeURIComponent(PAGE_HTML)}`;

// ── lease fence (rokazo port) ────────────────────────────────────────────────

describe("SCR lease fence", () => {
  it("take: kosong / sama / fence lebih tinggi boleh; fence lebih rendah ditolak", () => {
    expect(canTakeScreenLease(undefined, "user:1")).toBe(true);
    expect(canTakeScreenLease("user:1", "user:1")).toBe(true);
    expect(canTakeScreenLease("user:1", "yui-scholar:2")).toBe(true);
    expect(canTakeScreenLease("yui-scholar:2", "user:1")).toBe(false);
    expect(canTakeScreenLease("user:5", undefined)).toBe(false);
  });

  it("release: hanya owner sendiri dengan fence tak mundur", () => {
    expect(canReleaseScreenLease("user:2", "user:2")).toBe(true);
    expect(canReleaseScreenLease("user:2", "user:3")).toBe(true);
    expect(canReleaseScreenLease("user:2", "yui-scholar:9")).toBe(false);
    expect(canReleaseScreenLease("user:3", "user:2")).toBe(false);
    expect(canReleaseScreenLease(undefined, "user:1")).toBe(true);
  });

  it("parse: id tanpa fence → 0; garbage fence → 0", () => {
    expect(parseScreenLeaseId("user:12")).toEqual({ ownerId: "user", fence: 12 });
    expect(parseScreenLeaseId("yui-scholar:3")).toEqual({ ownerId: "yui-scholar", fence: 3 });
    expect(parseScreenLeaseId("user")).toEqual({ ownerId: "user", fence: 0 });
    expect(parseScreenLeaseId("user:x")).toEqual({ ownerId: "user:x", fence: 0 }); // port rokazo: id utuh
    expect(screenLeaseId("user", 7)).toBe("user:7");
  });
});

// ── CDP util ─────────────────────────────────────────────────────────────────

describe("SCR cdp util", () => {
  it("parseDevToolsUrl dari baris stderr", () => {
    expect(parseDevToolsUrl('some log\r\nDevTools listening on ws://127.0.0.1:51777/devtools/browser/abc-def\nmore'))
      .toBe("ws://127.0.0.1:51777/devtools/browser/abc-def");
    expect(parseDevToolsUrl("nothing here")).toBeNull();
  });
});

// ── manager dengan browser asli (regression probe SCR-0) ────────────────────

const browserAvailable = (): boolean => detectBrowserExec() !== null;

describe.skipIf(!browserAvailable())("SCR manager (real browser)", () => {
  beforeEach(() => {
    vi.stubEnv("YUI_SCREEN_IDLE_MS", "0"); // jangan bunuh sesi saat test
    vi.stubEnv("YUI_SCREEN_FPS_ACTIVE", "10");
  });

  it("ensure → running + frame + navigate + snapshot + click + type", async () => {
    const st = await ensureScreen(dir, PROJECT, PERSONA);
    expect(st.status).toBe("running");
    expect(st.leaseOwner).toBeNull();

    // frame datang (subscribe SSE-like)
    const key = screenKey(PROJECT, PERSONA);
    let frameData: string | null = null;
    const sub = subscribeScreen(key, (f) => { frameData = f.data; }, () => undefined);
    expect(sub).not.toBeNull();
    await vi.waitFor(() => expect(frameData).not.toBeNull(), { timeout: 25_000 });

    // navigate ke halaman test deterministik
    const nav = await screenNavigate(key, PERSONA, PAGE);
    expect(nav.title).toBe("SCR test");

    // snapshot: ada input + button + link + teks
    const snap = await screenSnapshot(key);
    expect(snap.title).toBe("SCR test");
    expect(snap.text).toContain("hello screen");
    const inputRef = snap.items.findIndex((i) => i.tag === "input");
    const btnRef = snap.items.findIndex((i) => i.tag === "button");
    expect(inputRef).toBeGreaterThanOrEqual(0);
    expect(btnRef).toBeGreaterThanOrEqual(0);

    // ketik ke input lalu klik tombol → tombol memantulkan nilai input
    await screenClick(key, PERSONA, snap.items[inputRef!]!.x, snap.items[inputRef!]!.y);
    await screenType(key, PERSONA, "kucing");
    await screenClick(key, PERSONA, snap.items[btnRef!]!.x, snap.items[btnRef!]!.y);
    await vi.waitFor(async () => {
      const s2 = await screenSnapshot(key);
      expect(s2.items.find((i) => i.tag === "button")?.name).toContain("clicked-kucing");
    }, { timeout: 5_000 });

    sub!.unsubscribe();
  }, 30_000);

  it("lease: agent pegang → user input ditolak → user take → agent ditolak → yield → agent ok", async () => {
    const key = screenKey(PROJECT, PERSONA);
    await ensureScreen(dir, PROJECT, PERSONA);
    await screenNavigate(key, PERSONA, PAGE);

    expect(takeLease(key, PERSONA).ok).toBe(true);
    await expect(screenNavigate(key, "user", PAGE)).rejects.toThrow(/user control|under control/i);

    expect(takeLease(key, "user").ok).toBe(true); // fence lebih tinggi → user ambil
    await expect(screenNavigate(key, PERSONA, PAGE)).rejects.toThrow(/under user control/i);

    expect(yieldLease(key, "user")).toBe(true);
    await expect(screenNavigate(key, PERSONA, PAGE)).resolves.toMatchObject({ title: "SCR test" });
  }, 30_000);

  it("request_takeover tool: kartu event + resolve grant → lease pindah ke persona", async () => {
    const key = screenKey(PROJECT, PERSONA);
    vi.stubEnv("YUI_TAKEOVER_TIMEOUT_MS", "0"); // tanpa deadline utk test flow
    await ensureScreen(dir, PROJECT, PERSONA);
    takeLease(key, "user"); // user pegang

    const events: { type: string; requestId?: string }[] = [];
    const c: ToolContext = { ...ctx(), emit: (d) => events.push(d as { type: string }) };
    const p = registry.dispatch("request_takeover", { reason: "need to finish the form" }, c);
    await vi.waitFor(() => expect(listPendingTakeovers(key).length).toBe(1));
    const req = listPendingTakeovers(key)[0]!;
    expect(events.at(-1)?.type).toBe("takeover.requested");

    expect(resolveTakeover(req.requestId, true)).toBe(true);
    const res = await p;
    expect(res.isError).toBeFalsy();
    expect((res.result as { status: string }).status).toBe("granted");
    expect(leaseOwner(key)).toBe(PERSONA);
    expect(events.some((e) => e.type === "takeover.resolved")).toBe(true);
  }, 30_000);

  it("deny → agent read-only hint; expired (deadline pendek) → takeover_expired", async () => {
    const key = screenKey(PROJECT, PERSONA);
    await ensureScreen(dir, PROJECT, PERSONA);
    takeLease(key, "user");

    // deny
    const p1 = registry.dispatch("request_takeover", { reason: "r1" }, ctx());
    await vi.waitFor(() => expect(listPendingTakeovers(key).length).toBe(1));
    resolveTakeover(listPendingTakeovers(key)[0]!.requestId, false);
    const r1 = await p1;
    expect(r1.isError).toBe(true);
    expect((r1.result as { error: string }).error).toBe("takeover_denied");

    // expired
    vi.stubEnv("YUI_TAKEOVER_TIMEOUT_MS", "60");
    const p2 = registry.dispatch("request_takeover", { reason: "r2" }, ctx());
    const r2 = await p2;
    expect((r2.result as { error: string }).error).toBe("takeover_expired");
  }, 30_000);

  it("browser_open sesi BARU → emit screen.state (bubble chat); sesi lama → tidak", async () => {
    const events: { type: string }[] = [];
    const c: ToolContext = { ...ctx(), emit: (d) => events.push(d as { type: string }) };
    await registry.dispatch("browser_open", { url: PAGE }, c);
    expect(events.some((e) => e.type === "screen.state")).toBe(true);
    events.length = 0;
    await registry.dispatch("browser_open", { url: PAGE }, c);
    expect(events.filter((e) => e.type === "screen.state")).toHaveLength(0);
  }, 30_000);

  it("tool-idle auto-close: tanpa viewer & tanpa aktivitas → sesi berhenti sendiri", async () => {
    vi.stubEnv("YUI_SCREEN_TOOL_IDLE_MS", "100");
    await ensureScreen(dir, PROJECT, PERSONA);
    const key = screenKey(PROJECT, PERSONA);
    expect(getScreenState(key)).toBeDefined();
    await vi.waitFor(() => expect(getScreenState(key)).toBeUndefined(), { timeout: 5_000 });
  }, 30_000);

 // ── fill_login ─────────────────────────────────────────────
  // Halaman login deterministik (data: URL, tanpa network): form
  // username+password; submit dicegah default → title berubah jadi marker
  // supaya isi form TERBUKTI tanpa membocorkan nilai ke assertion.
  const LOGIN_HTML = `<title>Sign in</title><form onsubmit="event.preventDefault();document.title='LOGGED-IN:'+document.getElementById('u').value"><input id=u type=text><input id=p type=password><button type=submit>Sign in</button></form>`;
  const LOGIN_PAGE = `data:text/html,${encodeURIComponent(LOGIN_HTML)}`;
  const ORIGIN = "data-local-test"; // origin fiktif utk nama record vault

  it("request_login → kartu → REST fill mengisi form + submit (nilai tak pernah di event)", async () => {
    await registry.dispatch("browser_open", { url: LOGIN_PAGE }, ctx());
    const events: { type: string }[] = [];
    const c: ToolContext = { ...ctx(), emit: (d) => events.push(d as { type: string }) };
    const p = registry.dispatch("request_login", { origin: ORIGIN }, c);
    // kartu aktif → jawab seperti REST (fill + submit)
    await vi.waitFor(() => expect(listPendingLogins()).toHaveLength(1), { timeout: 3_000 });
    const req = listPendingLogins()[0]!;
    expect(req.origin).toBe(ORIGIN);
    expect(await resolveLogin(req.requestId, { user: "tester", pass: "s3cret-value", save: false, submit: true })).toBe(true);
    const r = await p;
    expect(r.isError).toBeFalsy();
    expect(r.result).toMatchObject({ status: "filled", source: "user" });
    // form benar-benar terisi + submit → title marker (tanpa nilai pass)
    const key = screenKey(PROJECT, PERSONA);
    await vi.waitFor(
      async () => expect(await screenEvalJson<string>(key, "document.title")).toBe("LOGGED-IN:tester"),
      { timeout: 5_000 },
    );
 // INVARIAN (hardening): snapshot pasca-fill TIDAK membocorkan
    // password, input[type=password] di-mask di sumber + redactActive di
    // tool result. Username (type=text) tetap terlihat (by design).
    const snapRes = await registry.dispatch("browser_snapshot", {}, ctx());
    const snapStr = JSON.stringify(snapRes.result);
    expect(snapStr).not.toContain("s3cret-value");
    expect(snapStr).toContain("tester");
    // INVARIAN: nilai tidak pernah muncul di event
    expect(JSON.stringify(events)).not.toContain("s3cret-value");
  }, 30_000);

  it("request_login auto-pakai vault record login:<origin> tanpa kartu", async () => {
    // siapkan vault dgn record login (seperti disimpan kartu save=true)
    const { key: vk } = loadVaultMasterKey(dir);
    setVaultForTests(new VaultManager(new VaultStore(path.join(dir, "vault.db"), vk)));
    try {
      const vm = getVault();
      vm.store.put({
        name: `login:${ORIGIN}`,
        kind: "login",
        scope: "persona",
        projectId: PROJECT,
        personaId: PERSONA,
        runId: null,
        value: JSON.stringify({ user: "vaultuser", pass: "vault-pass-9" }),
      });
      await registry.dispatch("browser_open", { url: LOGIN_PAGE }, ctx());
      const events: { type: string }[] = [];
      const c: ToolContext = { ...ctx(), emit: (d) => events.push(d as { type: string }) };
      const r = await registry.dispatch("request_login", { origin: ORIGIN }, c);
      expect(r.isError).toBeFalsy();
      expect(r.result).toMatchObject({ status: "filled", source: "vault" });
      expect(listPendingLogins()).toHaveLength(0); // tanpa kartu
      expect(events.filter((e) => e.type === "login.requested")).toHaveLength(0);
      const key = screenKey(PROJECT, PERSONA);
      await vi.waitFor(
        async () => expect(await screenEvalJson<string>(key, "document.title")).toBe("LOGGED-IN:vaultuser"),
        { timeout: 5_000 },
      );
    } finally {
      setVaultForTests(null);
    }
  }, 30_000);

  it("request_login deadline habis → login_expired (error jelas)", async () => {
    vi.stubEnv("YUI_LOGIN_TIMEOUT_MS", "60");
    await registry.dispatch("browser_open", { url: LOGIN_PAGE }, ctx());
    const r = await registry.dispatch("request_login", { origin: ORIGIN }, ctx());
    expect(r.isError).toBe(true);
    const res = r.result as { error?: string };
    expect(res.error).toBe("login_expired");
  }, 30_000);

  it("tools browser_open/snapshot/click via registry (persona path)", async () => {
    const open = await registry.dispatch("browser_open", { url: PAGE }, ctx());
    if (open.isError) throw new Error("browser_open failed: " + JSON.stringify(open.result));
    const snap = await registry.dispatch("browser_snapshot", {}, ctx());
    expect((snap.result as { title: string }).title).toBe("SCR test");
    const items = (snap.result as { items: { ref: number; tag: string }[] }).items;
    const btn = items.find((i) => i.tag === "button")!;
    const click = await registry.dispatch("browser_click", { ref: btn.ref }, ctx());
    expect((click.result as { clicked: number }).clicked).toBe(btn.ref);
    await stopScreen(screenKey(PROJECT, PERSONA), "test");
    const gone = await registry.dispatch("browser_snapshot", {}, ctx()); // sesi baru dibuat otomatis
    expect(gone.isError).toBeFalsy(); // needScreen restart sesi
  }, 30_000);
});

// ── SCR-3: profil browser TIDAK jadi artefak Files ──────────────────────────

describe("SCR-3 files exclusion", () => {
  it(".yuika (profil browser) tak muncul di tree, dotfile rule dijaga", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "yui-files-"));
    fs.mkdirSync(path.join(root, ".yuika", "browser", PROJECT, PERSONA), { recursive: true });
    fs.writeFileSync(path.join(root, ".yuika", "browser", PROJECT, PERSONA, "Cookies"), "x");
    fs.writeFileSync(path.join(root, "README.md"), "hi");
    const tree = buildFileTree(root);
    const flat = JSON.stringify(tree);
    expect(flat).not.toContain(".yuika");
    expect(flat).toContain("README.md");
  });
});
