// @yuika/core, Batch 14a (D25) ScreenManager: Chromium headless per
// (project, persona) + screencast JPEG + input relay + lease user↔persona.
//
// Desain:
//   - SATU browser per key "<projectId>/<personaId>" (SCR-3: profil persist
//     per project×persona → login/cookie bertahan; user-data-dir di
//     <dataDir>/.yuika/browser/<projectId>/<personaId>, DI LUAR workspace
//     project sehingga tak pernah jadi artefak Files).
//   - Screencast: Page.startScreencast jpeg; FPS dikontrol dengan
//     menahan Page.screencastFrameAck (CDP hanya mengirim frame berikutnya
//     setelah ack), YUI_SCREEN_FPS_IDLE (default 2) saat tanpa viewer,
//     YUI_SCREEN_FPS_ACTIVE (default 15) saat ada viewer/agent aktif.
//   - Lease (rokazo fence): SATU pengendali input. Owner "user" | personaId.
//     Input dari pihak yang bukan owner → error EN jelas.
//   - request_takeover (SCR-4): pending non-blocking + deadline auto-skip
//     (YUI_TAKEOVER_TIMEOUT_MS default 120s; 0 = tanpa deadline).
//   - Idle auto-close (YUI_SCREEN_IDLE_MS default 15 menit; 0 = off):
//     tanpa viewer + tanpa aktivitas → browser dimatikan.
//   - Headless Edge/Chrome di host (Docker absen, catatan PLAN §6.5 kelas 0).
// Env: YUI_BROWSER_EXEC override executable.
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { moduleLogger } from "../logger.js";
import { CdpConnection, CdpPage, attachFirstPage, parseDevToolsUrl } from "./cdp.js";
import { canTakeScreenLease, canReleaseScreenLease, parseScreenLeaseId, screenLeaseId } from "./lease.js";

const log = moduleLogger("screen");

// ── deteksi executable (SCR-0: Edge terbukti di mesin dev Windows) ──────────

export function detectBrowserExec(): string | null {
  const cand = [
    process.env.YUI_BROWSER_EXEC,
    ...(process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        ]
      : [
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
          "/usr/bin/microsoft-edge",
        ]),
  ].filter(Boolean) as string[];
  for (const p of cand) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {
      /* lanjut kandidat berikut */
    }
  }
  return null;
}

// ── tipe publik ──────────────────────────────────────────────────────────────

export interface ScreenState {
  key: string;
  projectId: string;
  personaId: string;
  status: "starting" | "running" | "stopped" | "failed";
  url: string;
  title: string;
  leaseOwner: string | null; // "user" | personaId | null (bebas)
  viewers: number;
  /** SCR-6: jumlah persona QA yang sedang menonton sesi ini. */
  watchers: number;
  startedAt: number;
  error?: string;
}

export interface ScreenFrame {
  key: string;
  data: string; // base64 JPEG
  width: number;
  height: number;
  ts: number;
}

export interface Snapshot {
  url: string;
  title: string;
  /** teks terlihat (dipotong) */
  text: string;
  /** elemen interaktif: ref = indeks stabil utk browser_click/type */
  items: { ref: number; tag: string; role?: string; name?: string; value?: string; x: number; y: number; w: number; h: number }[];
}

interface ScreenSession {
  key: string;
  projectId: string;
  personaId: string;
  status: ScreenState["status"];
  proc: ChildProcess | null;
  conn: CdpConnection | null;
  page: CdpPage | null;
  lastFrame: ScreenFrame | null;
  frameListeners: Set<(f: ScreenFrame) => void>;
  stateListeners: Set<(s: ScreenState) => void>;
  viewers: number;
  /** SCR-6: persona QA yang sedang menonton (keep-alive + transparansi). */
  watchers: Set<string>;
  lease: string | null; // leaseId "owner:fence"
  fence: number;
  url: string;
  title: string;
  startedAt: number;
  lastActivity: number;
  ackTimer: NodeJS.Timeout | null;
  error?: string;
  idleTimer: NodeJS.Timeout | null;
}

const sessions = new Map<string, ScreenSession>();

export function screenKey(projectId: string, personaId: string): string {
  return `${projectId}/${personaId}`;
}

// HMR-safety (pola approval engine): simpan registry di globalThis supaya
// modul di-reload tak kehilangan sesi browser hidup.
const G = globalThis as unknown as { __yuikaScreenSessions?: Map<string, ScreenSession> };
if (G.__yuikaScreenSessions) {
  // modul di-reload: pulihkan map (browser tetap hidup di proses yang sama)
  for (const [k, s] of G.__yuikaScreenSessions) sessions.set(k, s);
}
G.__yuikaScreenSessions = sessions;

function fpsIdle(): number { return Math.max(1, Number(process.env.YUI_SCREEN_FPS_IDLE ?? 2) || 2); }
function fpsActive(): number { return Math.min(30, Math.max(1, Number(process.env.YUI_SCREEN_FPS_ACTIVE ?? 15) || 15)); }
function idleMs(): number { return Math.max(0, Number(process.env.YUI_SCREEN_IDLE_MS ?? 15 * 60_000) || 0); }
/** Tool-idle close (default 120s): sesi tanpa viewer DAN tanpa aktivitas tool
 *  persona ditutup, persona "selesai memakai browser" → shutdown otomatis
 *  (0 = off). YUI_SCREEN_IDLE_MS tetap hard cap. */
function toolIdleMs(): number { return Math.max(0, Number(process.env.YUI_SCREEN_TOOL_IDLE_MS ?? 120_000) || 0); }
function effectiveIdleMs(): number {
  const c = [idleMs(), toolIdleMs()].filter((n) => n > 0);
  return c.length ? Math.min(...c) : 0;
}

function stateOf(s: ScreenSession): ScreenState {
  return {
    key: s.key,
    projectId: s.projectId,
    personaId: s.personaId,
    status: s.status,
    url: s.url,
    title: s.title,
    leaseOwner: s.lease ? parseScreenLeaseId(s.lease).ownerId : null,
    viewers: s.viewers,
    watchers: s.watchers.size,
    startedAt: s.startedAt,
    ...(s.error ? { error: s.error } : {}),
  };
}

function fireState(s: ScreenSession): void {
  const st = stateOf(s);
  for (const cb of s.stateListeners) cb(st);
}

function touch(s: ScreenSession): void {
  s.lastActivity = Date.now();
  scheduleIdleCheck(s);
}

/** SCR-6: persona QA (watcher read-only) menonton sesi screen persona lain.
 *  Watcher TIDAK punya lease/viewer FPS, hanya (a) keep-alive sesi,
 *  (b) terlihat di state (transparansi siapa sedang QA). */
export function qaWatch(targetKey: string, watcher: string, on: boolean): ScreenState {
  const s = sessions.get(targetKey);
  if (!s) throw new Error("target screen session not active");
  if (on) s.watchers.add(watcher);
  else s.watchers.delete(watcher);
  touch(s);
  fireState(s);
  return stateOf(s);
}

function scheduleIdleCheck(s: ScreenSession): void {
  if (s.idleTimer) clearTimeout(s.idleTimer);
  const ms = effectiveIdleMs();
  if (!ms) return;
  s.idleTimer = setTimeout(() => {
    // SCR-6: QA watcher dihitung sebagai penonton, selama persona QA masih
    // menonton, sesi TIDAK di-auto-close meski tanpa viewer/tool activity.
    if (s.viewers <= 0 && s.watchers.size === 0 && Date.now() - s.lastActivity >= ms) {
      log.info({ key: s.key }, "screen idle (no viewer, no tool activity) → close");
      void stopScreen(s.key, "idle");
    } else {
      scheduleIdleCheck(s);
    }
  }, ms + 1_000);
  s.idleTimer.unref?.();
}

// ── lifecycle ────────────────────────────────────────────────────────────────

export async function ensureScreen(
  dataDir: string,
  projectId: string,
  personaId: string,
): Promise<ScreenState> {
  const key = screenKey(projectId, personaId);
  const existing = sessions.get(key);
  if (existing && (existing.status === "running" || existing.status === "starting")) return stateOf(existing);

  const exec = detectBrowserExec();
  if (!exec) {
    throw new Error(
      "No browser executable found, set YUI_BROWSER_EXEC to a Chrome/Edge/Chromium path",
    );
  }

  const s: ScreenSession = {
    key,
    projectId,
    personaId,
    status: "starting",
    proc: null,
    conn: null,
    page: null,
    lastFrame: null,
    frameListeners: new Set(),
    stateListeners: new Set(),
    viewers: 0,
    watchers: new Set(),
    lease: null,
    fence: 0,
    url: "about:blank",
    title: "",
    startedAt: Date.now(),
    lastActivity: Date.now(),
    ackTimer: null,
    idleTimer: null,
  };
  sessions.set(key, s);

  try {
    // profil persist per project×persona (SCR-3), di dataDir, BUKAN workspace
    const profile = path.join(dataDir, ".yuika", "browser", projectId, personaId);
    fs.mkdirSync(profile, { recursive: true });
    const proc = spawn(exec, [
      "--headless=new",
      "--remote-debugging-port=0",
      "--remote-debugging-address=127.0.0.1",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--disable-extensions",
      "--window-size=1280,800",
      `--user-data-dir=${profile}`,
      "about:blank",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    s.proc = proc;

    const wsUrl = await new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("browser did not expose DevTools websocket in 10s")), 10_000);
      const onData = (d: Buffer): void => {
        const u = parseDevToolsUrl(d.toString());
        if (u) { clearTimeout(t); resolve(u); }
      };
      proc.stderr!.on("data", onData);
      proc.stdout!.on("data", onData);
      proc.on("close", (code) => { clearTimeout(t); reject(new Error(`browser exited early (code ${code})`)); });
    });

    const conn = await CdpConnection.connect(wsUrl);
    s.conn = conn;
    const page = await attachFirstPage(conn);
    s.page = page;

    await page.call("Page.enable");
    await page.call("Runtime.enable");
    // lacak navigasi → url/title live utk state + snapshot
    page.on("Page.frameNavigated", (p) => {
      const fp = (p as { frame?: { url?: string; parentId?: string } }).frame;
      if (fp && !fp.parentId && fp.url) { s.url = fp.url; fireState(s); }
    });
    conn.on("Target.detachedFromTarget", async (p) => {
      if ((p as { sessionId?: string }).sessionId === page.sessionId && s.status === "running") {
        log.warn({ key }, "page target detached → closing screen");
        await stopScreen(key, "detached");
      }
    });

    // screencast, ack ditahan sesuai FPS (lihat startScreencast)
    await startScreencast(s);

    s.status = "running";
    fireState(s);
    log.info({ key, exec }, "screen session running");
    touch(s);
    return stateOf(s);
  } catch (e) {
    s.status = "failed";
    s.error = e instanceof Error ? e.message : String(e);
    fireState(s);
    void cleanup(s);
    throw e;
  }
}

async function startScreencast(s: ScreenSession): Promise<void> {
  if (!s.page) return;
  const fps = s.viewers > 0 ? fpsActive() : fpsIdle();
  await s.page.call("Page.stopScreencast").catch(() => undefined);
  s.page.on("Page.screencastFrame", (p) => {
    const f = p as { data: string; metadata: { deviceWidth: number; deviceHeight: number }; sessionId: string };
    const frame: ScreenFrame = {
      key: s.key,
      data: f.data,
      width: f.metadata.deviceWidth,
      height: f.metadata.deviceHeight,
      ts: Date.now(),
    };
    s.lastFrame = frame;
    for (const cb of s.frameListeners) cb(frame);
    // tahan ack sesuai interval FPS → CDP kirim frame berikut hanya setelah ini
    if (s.ackTimer) clearTimeout(s.ackTimer);
    s.ackTimer = setTimeout(() => {
      void s.page?.call("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined);
    }, Math.max(0, Math.floor(1000 / fps) - 30));
    s.ackTimer.unref?.();
  });
  await s.page.call("Page.startScreencast", {
    format: "jpeg",
    quality: 55,
    maxWidth: 1280,
    maxHeight: 800,
    everyNthFrame: 1,
  });
}

async function cleanup(s: ScreenSession): Promise<void> {
  if (s.ackTimer) { clearTimeout(s.ackTimer); s.ackTimer = null; }
  if (s.idleTimer) { clearTimeout(s.idleTimer); s.idleTimer = null; }
  try { await s.conn?.close(); } catch { /* abaikan */ }
  if (s.proc && !s.proc.killed) {
    // tunggu proses BENAR-BENAR mati (Windows: user-data-dir terkunci sampai
    // exit, restart cepat akan gagal spawn bila tidak ditunggu)
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 3_000);
      s.proc!.once("close", () => { clearTimeout(t); resolve(); });
      try { s.proc!.kill(); } catch { /* abaikan */ }
    });
  }
  s.conn = null;
  s.page = null;
  s.proc = null;
}

import { registerActiveSecret, releaseActiveSecret } from "../vault/redact.js";

export async function stopScreen(key: string, reason = "manual"): Promise<boolean> {
  const s = sessions.get(key);
  if (!s) return false;
  log.info({ key, reason }, "stopping screen session");
  await cleanup(s);
  s.status = "stopped";
  fireState(s);
  sessions.delete(key);
  // VLT-4: password kartu login (active secret) dilepas bersama sesinya.
  for (const v of loginSecrets.get(key) ?? []) releaseActiveSecret(v);
  loginSecrets.delete(key);
  return true;
}

export async function closeAllScreens(): Promise<void> {
  for (const key of [...sessions.keys()]) await stopScreen(key, "shutdown");
}

export function getScreenState(key: string): ScreenState | undefined {
  const s = sessions.get(key);
  return s ? stateOf(s) : undefined;
}

export function listScreens(projectId?: string): ScreenState[] {
  return [...sessions.values()]
    .filter((s) => !projectId || s.projectId === projectId)
    .map(stateOf);
}

// ── viewer / SSE ────────────────────────────────────────────────────────────

export function subscribeScreen(
  key: string,
  onFrame: (f: ScreenFrame) => void,
  onState: (s: ScreenState) => void,
): { state: ScreenState; lastFrame: ScreenFrame | null; unsubscribe: () => void } | null {
  const s = sessions.get(key);
  if (!s) return null;
  s.frameListeners.add(onFrame);
  s.stateListeners.add(onState);
  s.viewers++;
  touch(s);
  fireState(s);
  // viewer datang/pergi → ganti FPS idle→active / active→idle
  void startScreencast(s).catch(() => undefined);
  return {
    state: stateOf(s),
    lastFrame: s.lastFrame,
    unsubscribe: () => {
      s.frameListeners.delete(onFrame);
      s.stateListeners.delete(onState);
      s.viewers = Math.max(0, s.viewers - 1);
      touch(s);
      fireState(s);
      void startScreencast(s).catch(() => undefined);
    },
  };
}

// ── lease (SCR-2/4) ─────────────────────────────────────────────────────────

export function takeLease(key: string, owner: string): { ok: boolean; owner: string | null } {
  const s = sessions.get(key);
  if (!s) return { ok: false, owner: null };
  const incoming = screenLeaseId(owner, ++s.fence);
  if (!canTakeScreenLease(s.lease, incoming)) {
    // race: fence sudah loncat, coba ulang sekali dengan fence baru
    const retry = screenLeaseId(owner, ++s.fence);
    if (!canTakeScreenLease(s.lease, retry)) return { ok: false, owner: parseScreenLeaseId(s.lease!).ownerId };
    s.lease = retry;
  } else {
    s.lease = incoming;
  }
  fireState(s);
  touch(s);
  return { ok: true, owner };
}

export function yieldLease(key: string, owner: string): boolean {
  const s = sessions.get(key);
  if (!s) return false;
  if (!s.lease) { fireState(s); return true; }
  const mine = screenLeaseId(owner, s.fence);
  if (!canReleaseScreenLease(s.lease, mine)) return false;
  s.lease = null; // lepas total, pihak mana pun boleh ambil
  fireState(s);
  touch(s);
  return true;
}

export function leaseOwner(key: string): string | null {
  const s = sessions.get(key);
  return s?.lease ? parseScreenLeaseId(s.lease).ownerId : null;
}

function requireOwner(s: ScreenSession, actor: string): void {
  const owner = s.lease ? parseScreenLeaseId(s.lease).ownerId : null;
  if (owner !== null && owner !== actor) {
    throw new Error(
      owner === "user"
        ? `Screen is under user control, ask them to release it (or wait) before acting (actor: ${actor})`
        : `Screen is under control of ${owner}, use request_takeover to ask for handover (actor: ${actor})`,
    );
  }
}

// ── input (user relay + agent tools) ────────────────────────────────────────

export async function screenNavigate(key: string, actor: string, url: string): Promise<{ url: string; title: string }> {
  const s = sessions.get(key);
  if (!s || !s.page) throw new Error("screen session not active");
  requireOwner(s, actor);
  let parsed: URL;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(url); // data:/about:/https:…
  try {
    parsed = new URL(hasScheme ? url : `https://${url}`);
  } catch {
    throw new Error("invalid URL");
  }
  if (!["http:", "https:", "about:", "data:"].includes(parsed.protocol)) {
    throw new Error("only http/https/about/data URLs are allowed");
  }
  await s.page.call("Page.navigate", { url: parsed.toString() });
  await waitForLoad(s, 8_000);
  const t = await pageTitle(s);
  s.url = parsed.toString();
  s.title = t;
  fireState(s);
  touch(s);
  return { url: s.url, title: t };
}

function waitForLoad(s: ScreenSession, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve(); } }, timeoutMs);
    const off = s.page!.on("Page.loadEventFired", () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      setTimeout(resolve, 150); // settle kecil untuk render awal
    });
    setTimeout(() => off(), timeoutMs + 100);
  });
}

async function pageTitle(s: ScreenSession): Promise<string> {
  try {
    const r = await s.page!.call<{ result?: { value?: unknown } }>("Runtime.evaluate", {
      expression: "document.title",
      returnByValue: true,
    });
    return typeof r.result?.value === "string" ? r.result.value : "";
  } catch {
    return "";
  }
}

export async function screenClick(key: string, actor: string, x: number, y: number, opts: { dbl?: boolean } = {}): Promise<void> {
  const s = sessions.get(key);
  if (!s || !s.page) throw new Error("screen session not active");
  requireOwner(s, actor);
  const count = opts.dbl ? 2 : 1;
  await s.page.call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await s.page.call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: count });
  await s.page.call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: count });
  touch(s);
}

export async function screenScroll(key: string, actor: string, deltaX: number, deltaY: number): Promise<void> {
  const s = sessions.get(key);
  if (!s || !s.page) throw new Error("screen session not active");
  requireOwner(s, actor);
  await s.page.call("Input.dispatchMouseEvent", {
    type: "mouseWheel", x: 640, y: 400, deltaX, deltaY,
  });
  touch(s);
}

/** Ketik teks ke elemen terfokus, Input.insertText (IME-style, andal utk
 *  unicode) + keydown/keyup utk key khusus (SCR-0 proof). */
export async function screenType(key: string, actor: string, text: string): Promise<void> {
  const s = sessions.get(key);
  if (!s || !s.page) throw new Error("screen session not active");
  requireOwner(s, actor);
  for (const ch of text) {
    if (ch === "\n") {
      await s.page.call("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
      await s.page.call("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    } else {
      await s.page.call("Input.dispatchKeyEvent", { type: "keyDown", text: ch });
      await s.page.call("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
    }
  }
  touch(s);
}

const SPECIAL_KEYS: Record<string, { key: string; code: string; vk: number }> = {
  enter: { key: "Enter", code: "Enter", vk: 13 },
  tab: { key: "Tab", code: "Tab", vk: 9 },
  escape: { key: "Escape", code: "Escape", vk: 27 },
  backspace: { key: "Backspace", code: "Backspace", vk: 8 },
  delete: { key: "Delete", code: "Delete", vk: 46 },
  arrowdown: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
  arrowup: { key: "ArrowUp", code: "ArrowUp", vk: 38 },
  arrowleft: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 },
  arrowright: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
};

export async function screenPress(key: string, actor: string, k: string): Promise<void> {
  const s = sessions.get(key);
  if (!s || !s.page) throw new Error("screen session not active");
  requireOwner(s, actor);
  const sp = SPECIAL_KEYS[k.toLowerCase()];
  if (sp) {
    await s.page.call("Input.dispatchKeyEvent", { type: "keyDown", key: sp.key, code: sp.code, windowsVirtualKeyCode: sp.vk });
    await s.page.call("Input.dispatchKeyEvent", { type: "keyUp", key: sp.key, code: sp.code, windowsVirtualKeyCode: sp.vk });
  } else {
    await screenType(key, actor, k);
  }
  touch(s);
}

// ── snapshot (agent view) ───────────────────────────────────────────────────

/** Ekspresi dieksekusi DI HALAMAN, kumpulkan ringkasan a11y-lite utk agent.
 *  ref = indeks; koordinat = pusat bbox (viewport CSS px, cocok dgn frame). */
const SNAPSHOT_EXPR = `(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none";
  };
  const sel = "a[href],button,input,select,textarea,[role=button],[role=link],[role=tab],[contenteditable=true],[onclick]";
  const nodes = [...document.querySelectorAll(sel)].filter(vis).slice(0, 120);
  const items = nodes.map((el, i) => {
    const r = el.getBoundingClientRect();
    // VLT-4: input[type=password] DILARANG expose value/attr-value ke agent,
    // di-mask DI SUMBER (apapun jalur isinya: kartu login / vault / user ketik).
    const pw = el.tagName === "INPUT" && String(el.getAttribute("type") || "text").toLowerCase() === "password";
    const shown = pw ? "" : String(el.value ?? "");
    return {
      ref: i,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") ?? undefined,
      name: (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || (pw ? "" : el.getAttribute("value") || "") || shown).trim().slice(0, 80) || undefined,
      value: (el.tagName === "INPUT" || el.tagName === "TEXTAREA") ? (pw ? undefined : shown.slice(0, 80)) : undefined,
      x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
      w: Math.round(r.width), h: Math.round(r.height),
    };
  });
  return JSON.stringify({ url: location.href, title: document.title, text: (document.body?.innerText ?? "").slice(0, 6000), items });
})()`;

export async function screenSnapshot(key: string): Promise<Snapshot> {
  const s = sessions.get(key);
  if (!s || !s.page) throw new Error("screen session not active");
  const r = await s.page.call<{ result?: { value?: unknown } }>("Runtime.evaluate", {
    expression: SNAPSHOT_EXPR,
    returnByValue: true,
  }, 20_000);
  const v = r.result?.value;
  if (typeof v !== "string") throw new Error("snapshot failed (page not responding)");
  const snap = JSON.parse(v) as Snapshot;
  s.url = snap.url;
  s.title = snap.title;
  fireState(s);
  touch(s);
  return snap;
}

// ── request_takeover pending (SCR-4), pola vault fill ─────────────────────

export interface PendingTakeover {
  requestId: string;
  key: string; // screen key
  personaId: string;
  reason: string;
  deadline: number; // 0 = tanpa deadline
  resolve: (v: { status: "granted" | "denied" | "expired" }) => void;
}

interface TakeoverRegistry {
  pending: Map<string, PendingTakeover>;
  seq: number;
  onResolve?: (r: { requestId: string; personaId: string; key: string; status: string }) => void;
}

const TG = globalThis as unknown as { __yuikaTakeoverRegistry?: TakeoverRegistry };
const takeover: TakeoverRegistry = (TG.__yuikaTakeoverRegistry ??= { pending: new Map(), seq: 0 });

/** Emit callback dipasang runtime supaya resolve REST → event sesi. */
export function setTakeoverEmitter(cb: TakeoverRegistry["onResolve"]): void {
  takeover.onResolve = cb;
}

export function takeoverTimeoutMs(): number {
  return Math.max(0, Number(process.env.YUI_TAKEOVER_TIMEOUT_MS ?? 120_000) || 0);
}

/** Buka permintaan takeover: return { requestId, deadline, result },
 *  PEMANGGIL (tool) yang menunggu `result`; kartu UI non-blocking dibuat
 *  dari event takeover.requested (dipancarkan tool), bukan di sini. */
export function openTakeoverRequest(
  key: string,
  personaId: string,
  reason: string,
): { requestId: string; deadline: number; result: Promise<{ status: "granted" | "denied" | "expired" }> } {
  const s = sessions.get(key);
  if (!s) throw new Error("screen session not active");
  const requestId = `tk_${Date.now().toString(36)}_${++takeover.seq}`;
  const dl = takeoverTimeoutMs();
  const result = new Promise<{ status: "granted" | "denied" | "expired" }>((resolve) => {
    takeover.pending.set(requestId, {
      requestId,
      key,
      personaId,
      reason,
      deadline: dl ? Date.now() + dl : 0,
      resolve,
    });
    if (dl) {
      const t = setTimeout(() => {
        const rec = takeover.pending.get(requestId);
        if (!rec) return;
        takeover.pending.delete(requestId);
        rec.resolve({ status: "expired" });
        takeover.onResolve?.({ requestId, personaId, key, status: "expired" });
      }, dl);
      t.unref?.();
    }
  });
  return { requestId, deadline: dl, result };
}

export function resolveTakeover(requestId: string, grant: boolean): boolean {
  const rec = takeover.pending.get(requestId);
  if (!rec) return false;
  takeover.pending.delete(requestId);
  if (grant) {
    // user menyerahkan kontrol → lease pindah ke persona (fence naik)
    const s = sessions.get(rec.key);
    if (s) { s.fence++; s.lease = screenLeaseId(rec.personaId, s.fence); fireState(s); }
  }
  rec.resolve({ status: grant ? "granted" : "denied" });
  takeover.onResolve?.({ requestId, personaId: rec.personaId, key: rec.key, status: grant ? "granted" : "denied" });
  return true;
}

export function listPendingTakeovers(key?: string): { requestId: string; key: string; personaId: string; reason: string; deadline: number }[] {
  return [...takeover.pending.values()]
    .filter((p) => !key || p.key === key)
    .map(({ requestId, key: k, personaId, reason, deadline }) => ({ requestId, key: k, personaId, reason, deadline }));
}

// ── VLT-4: fill_login pending + CDP fill, nilai TIDAK pernah masuk event ──

export interface LoginFillResult {
  ok: boolean;
  submitted: boolean;
  userFieldFound: boolean;
  error?: string;
}

interface PendingLogin {
  requestId: string;
  key: string;
  personaId: string;
  origin: string;
  deadline: number; // 0 = tanpa deadline
  resolve: (v: { status: "filled" | "skipped" | "expired" | "failed"; saved: boolean; fill?: LoginFillResult }) => void;
  timer?: NodeJS.Timeout;
}

interface LoginRegistry {
  pending: Map<string, PendingLogin>;
  seq: number;
}

/** Password card-path per key, didaftarkan sbg active secret saat fill
 *  (scrub dari SEMUA teks keluar proses ini), dilepas saat sesi stop. */
const loginSecrets = new Map<string, string[]>();

const LG = globalThis as unknown as { __yuikaLoginRegistry?: LoginRegistry };
const loginReq: LoginRegistry = (LG.__yuikaLoginRegistry ??= { pending: new Map(), seq: 0 });

export function loginTimeoutMs(): number {
  return Math.max(0, Number(process.env.YUI_LOGIN_TIMEOUT_MS ?? 120_000) || 0);
}

/** Eval generik read-only (returnByValue), dipakai test & QA utk membaca
 *  state DOM (mis. document.title setelah submit form). */
export async function screenEvalJson<T>(key: string, expr: string): Promise<T | undefined> {
  const s = sessions.get(key);
  if (!s || !s.page) throw new Error("screen session not active");
  const r = (await s.page.call("Runtime.evaluate", { expression: expr, returnByValue: true })) as {
    result?: { value?: T };
  };
  return r.result?.value;
}

/** Isi form login di halaman aktif via CDP. TANPA lease check, aksi ini
 *  di-otorisasi user lewat REST fill (padanannya user mengetik sendiri).
 *  Heuristik: input[type=password] PERTAMA + input text/email terdekat
 *  sebelumnya dalam form yang sama (fallback: document). */
export async function screenFillLogin(
  key: string,
  creds: { user: string; pass: string; submit: boolean },
): Promise<LoginFillResult> {
  const s = sessions.get(key);
  if (!s || !s.page) return { ok: false, submitted: false, userFieldFound: false, error: "screen session not active" };
  const expr = `(() => {
    const pw = document.querySelector("input[type=password]");
    if (!pw) return { ok: false, userFieldFound: false, error: "no password field on this page" };
    const form = pw.closest("form") || document;
    const inputs = Array.from(form.querySelectorAll("input"));
    const before = inputs.slice(0, inputs.indexOf(pw));
    const uf = before.reverse().find((i) => { const t = (i.type || "text").toLowerCase(); return t === "text" || t === "email" || t === "tel"; });
    const set = (el, v) => {
      const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
      d.set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    if (uf) set(uf, ${JSON.stringify(creds.user)});
    set(pw, ${JSON.stringify(creds.pass)});
    let submitted = false;
    if (${JSON.stringify(creds.submit)}) {
      const f = pw.closest("form");
      if (f) { try { f.requestSubmit ? f.requestSubmit() : f.submit(); submitted = true; } catch { submitted = false; } }
    }
    return { ok: true, submitted, userFieldFound: !!uf };
  })()`;
  const r = (await s.page.call("Runtime.evaluate", { expression: expr, returnByValue: true })) as {
    result?: { value?: LoginFillResult };
  };
  const out = r.result?.value ?? { ok: false, submitted: false, userFieldFound: false, error: "evaluate failed" };
  touch(s);
  return out;
}

/** Buka permintaan login, PEMANGGIL (tool request_login) menunggu result.
 *  Kartu UI dibuat dari event login.requested yang dipancarkan tool. */
export function openLoginRequest(
  key: string,
  personaId: string,
  origin: string,
): { requestId: string; deadline: number; result: Promise<{ status: "filled" | "skipped" | "expired" | "failed"; saved: boolean; fill?: LoginFillResult }> } {
  const s = sessions.get(key);
  if (!s) throw new Error("screen session not active");
  const requestId = `lg_${Date.now().toString(36)}_${++loginReq.seq}`;
  const dl = loginTimeoutMs();
  const result = new Promise<{ status: "filled" | "skipped" | "expired" | "failed"; saved: boolean; fill?: LoginFillResult }>((resolve) => {
    loginReq.pending.set(requestId, {
      requestId,
      key,
      personaId,
      origin,
      deadline: dl ? Date.now() + dl : 0,
      resolve,
    });
    if (dl) {
      const t = setTimeout(() => {
        const rec = loginReq.pending.get(requestId);
        if (!rec) return;
        loginReq.pending.delete(requestId);
        rec.resolve({ status: "expired", saved: false });
      }, dl);
      t.unref?.();
      loginReq.pending.get(requestId)!.timer = t;
    }
  });
  return { requestId, deadline: dl, result };
}

/** Jawab dari REST: skip (creds=null) atau fill (+optional vault save).
 *  Return false bila requestId tak dikenal (sudah expired/terjawab). */
export async function resolveLogin(
  requestId: string,
  creds: { user: string; pass: string; save: boolean; submit: boolean } | null,
): Promise<boolean> {
  const rec = loginReq.pending.get(requestId);
  if (!rec) return false;
  loginReq.pending.delete(requestId);
  if (rec.timer) clearTimeout(rec.timer);
  if (!creds) {
    rec.resolve({ status: "skipped", saved: false });
    return true;
  }
  const fill = await screenFillLogin(rec.key, creds);
  if (!fill.ok) {
    rec.resolve({ status: "failed", saved: false, fill });
    return true;
  }
  // VLT-4 hardening: password jadi active secret (VLT-5) selama sesi hidup,
  // apa pun yang mencoba membacanya balik (snapshot/teks/log) di-scrub.
  const prev = loginSecrets.get(rec.key) ?? [];
  registerActiveSecret(creds.pass);
  prev.push(creds.pass);
  loginSecrets.set(rec.key, prev);
  rec.resolve({ status: "filled", saved: creds.save, fill });
  return true;
}

export function listPendingLogins(key?: string): { requestId: string; key: string; personaId: string; origin: string; deadline: number }[] {
  return [...loginReq.pending.values()]
    .filter((p) => !key || p.key === key)
    .map(({ requestId, key: k, personaId, origin, deadline }) => ({ requestId, key: k, personaId, origin, deadline }));
}
