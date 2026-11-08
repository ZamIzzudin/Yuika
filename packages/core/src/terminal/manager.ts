// @yuika/core, : TerminalManager.
// Sesi terminal PERSISTEN yang SHARED antara user (tab Terminal via SSE) dan
// agent (tool `terminal`). Satu sesi per workspace, keduanya menulis ke
// stdin proses yang sama, output mengalir ke semua pendengar.
//
// Backend sesi (mode, urutan):
//   docker , `startSandboxSession("sh")`: shell DI DALAM container sandbox
// (egress allowlist utk npm, generalisasi run_command, ).
//   local  , fallback: shell host via pipes (cmd.exe / bin/sh) TANPA isolasi
//             (catatan eksplisit; PTY asli menyusul, v1 pipe murni).
// Env:
//   YUI_TERMINAL_MODE = auto (default: docker bila tersedia) | docker | local
//   YUI_TERMINAL_CMD  = override perintah shell utk pengujian, mis.
//                       "node test/fixtures/echo-shell.mjs"
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { moduleLogger } from "../logger.js";
import { redactSecrets } from "../redact.js";
import * as sandbox from "../tools/sandbox.js";
import { readEgressAllow } from "../tools/egress.js";

const log = moduleLogger("terminal");
const BUFFER_CAP = 400_000; // 400 KB ring per sesi

export type TerminalMode = "auto" | "docker" | "local";

export interface TerminalSessionInfo {
  id: string;
  workspacePath: string;
  backend: "docker" | "local";
  createdAt: number;
  lastActivity: number;
  exited: boolean;
}

interface Session {
  info: TerminalSessionInfo;
  proc?: ChildProcess;
  docker?: sandbox.SandboxSession;
  buffer: string;
  listeners: Set<(chunk: string) => void>;
  exitCbs: Set<(code: number | null) => void>;
}

let seq = 0;
const sessions = new Map<string, Session>();

// ── FLOW user 2026-11 (#7): log eksekusi run_command per workspace ──────────
// run_command (node/npm/npx) TIDAK lewat sesi shell, output-nya hilang dari
// tab Terminal. Log ini = sumber view "Commands" di panel terminal (browser
// tab): setiap eksekusi tercatat (perintah, exit code, output tail).
export interface CommandLogEntry {
  id: number;
  ts: number;
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  note?: string;
}
const commandLogs = new Map<string, CommandLogEntry[]>();
const COMMAND_LOG_CAP = 200;
let cmdSeq = 0;

/** Catat eksekusi perintah (dipanggil tool run_command SETELAH eksekusi;
 *  stdout/stderr sudah di-redact oleh pemanggil).
 * persist ring ke JSONL per workspace (dir data terminal),
 *  restart API tidak lagi mengosongkan view "Commands". */
const commandLogFiles = new Map<string, string>();

function logDir(): string {
  // lazy (bukan module-const): env dibaca saat pemakaian, test/boot bisa
  // men-setel YUI_TERMINAL_LOG_DIR kapan pun.
  return process.env.YUI_TERMINAL_LOG_DIR
    ? path.resolve(process.env.YUI_TERMINAL_LOG_DIR)
    : path.join(os.tmpdir(), "yuika-terminal-log");
}

function logFilePath(wsKey: string): string {
  let f = commandLogFiles.get(wsKey);
  const want = path.join(logDir(), `${createHash("sha1").update(wsKey).digest("hex").slice(0, 16)}.jsonl`);
  if (!f || f !== want) {
    f = want;
    commandLogFiles.set(wsKey, f);
  }
  return f;
}

function appendLogLine(f: string, line: string): void {
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, line + "\n");
  } catch {
    /* best-effort: log UI tetap hidup dari memori */
  }
}

export function logCommand(
  workspacePath: string,
  entry: Omit<CommandLogEntry, "id" | "ts">,
): void {
  const key = path.resolve(workspacePath);
  const list = commandLogs.get(key) ?? [];
  const rec = { ...entry, id: ++cmdSeq, ts: Date.now() };
  list.push(rec);
  if (list.length > COMMAND_LOG_CAP) list.splice(0, list.length - COMMAND_LOG_CAP);
  commandLogs.set(key, list);
  appendLogLine(logFilePath(key), JSON.stringify(rec));
}

/** Log eksekusi terbaru (terbaru terakhir) utk view "Commands".
 *  Bila memori kosong (fresh restart), muat ekor JSONL dulu. */
export function listCommandLog(workspacePath: string, limit = 100): CommandLogEntry[] {
  const key = path.resolve(workspacePath);
  if (!commandLogs.has(key)) {
    const f = logFilePath(key);
    try {
      const raw = fs.readFileSync(f, "utf8").trim();
      if (raw) {
        const lines = raw.split("\n").slice(-COMMAND_LOG_CAP);
        const loaded: CommandLogEntry[] = [];
        for (const l of lines) {
          try {
            loaded.push(JSON.parse(l) as CommandLogEntry);
          } catch {
            /* baris rusak → skip */
          }
        }
        commandLogs.set(key, loaded);
      }
    } catch {
      commandLogs.set(key, []); // file tak ada → kosong (bukan error)
    }
  }
  return [...(commandLogs.get(key) ?? [])].slice(-limit);
}

export function readTerminalMode(): TerminalMode {
  return (process.env.YUI_TERMINAL_MODE as TerminalMode) || "auto";
}

/** Parse YUI_TERMINAL_CMD ("node path/echo.mjs arg") → [cmd, args]. */
function parseOverride(): { cmd: string; args: string[] } | null {
  const raw = process.env.YUI_TERMINAL_CMD?.trim();
  if (!raw) return null;
  const parts = raw.split(/\s+/);
  return { cmd: parts[0]!, args: parts.slice(1) };
}

function defaultShell(): { cmd: string; args: string[] } {
  const override = parseOverride();
  if (override) return override;
  if (process.platform === "win32") {
    return { cmd: process.env.ComSpec || "cmd.exe", args: ["/Q"] };
  }
  return { cmd: "/bin/sh", args: [] };
}

function push(s: Session, chunk: string): void {
  s.buffer = (s.buffer + chunk).slice(-BUFFER_CAP);
  s.info.lastActivity = Date.now();
  for (const cb of s.listeners) cb(chunk);
}

function fireExit(s: Session, code: number | null): void {
  s.info.exited = true;
  for (const cb of s.exitCbs) cb(code);
}

/** Mulai (atau ambil) sesi terminal utk sebuah workspace, satu sesi aktif per
 * workspace (user & agent selalu bertemu di sesi yang sama). */
export interface EnsureSessionOptions {
 /** (WKS-3): container workshop hidup → shell di dalamnya. */
  workshopContainer?: string;
}

export async function ensureSession(
  workspacePath: string,
  opts: EnsureSessionOptions = {},
): Promise<TerminalSessionInfo> {
  const resolved = path.resolve(workspacePath);
  const existing = [...sessions.values()].find((s) => s.info.workspacePath === resolved && !s.info.exited);
  if (existing) return existing.info;

  const mode = readTerminalMode();
  const useDocker = mode === "local" ? false : mode === "docker" ? true : await sandbox.dockerAvailable();

  const s: Session = {
    info: {
      id: `term_${Date.now().toString(36)}_${++seq}`,
      workspacePath: resolved,
      backend: useDocker ? "docker" : "local",
      createdAt: Date.now(),
      lastActivity: Date.now(),
      exited: false,
    },
    buffer: "",
    listeners: new Set(),
    exitCbs: new Set(),
  };
  sessions.set(s.info.id, s);

  if (useDocker && opts.workshopContainer) {
    // WKS-3: shell DI DALAM container workshop, env egress melekat di container
    // (dibuat saat start workshop), stdin/stdout pipe murni (tanpa -t).
    // cwd = /home/node/project (bind workspace, SAMA dunia dengan Files).
    const child = spawn("docker", ["exec", "-i", "-w", "/home/node/project", opts.workshopContainer, "sh"], { windowsHide: true });
    s.proc = child;
    child.stdout?.on("data", (d: Buffer) => push(s, d.toString("utf8")));
    child.stderr?.on("data", (d: Buffer) => push(s, d.toString("utf8")));
    child.on("close", (code) => fireExit(s, code));
    child.on("error", (err) => push(s, `\r\n[terminal] workshop exec gagal: ${err.message}\r\n`));
    log.info({ id: s.info.id, backend: "docker", workshop: opts.workshopContainer }, "sesi terminal (workshop) siap");
    return s.info;
  }

  if (useDocker) {
    // Egress npm registry supaya `npm install` di terminal bisa jalan
 // (allowlist per-project sama dengan run_command, ).
    const egress = readEgressAllow(resolved);
    const ses = await sandbox.startSandboxSession("sh", [], resolved, { egress });
    s.docker = ses;
    ses.onData((c) => push(s, c));
    ses.onExit((code) => fireExit(s, code));
    log.info({ id: s.info.id, backend: "docker", egress: egress.length }, "sesi terminal (sandbox) siap");
  } else {
    const shell = defaultShell();
    const proc = spawn(shell.cmd, shell.args, { cwd: resolved, windowsHide: true });
    s.proc = proc;
    proc.stdout?.on("data", (d: Buffer) => push(s, d.toString("utf8")));
    proc.stderr?.on("data", (d: Buffer) => push(s, d.toString("utf8")));
    proc.on("close", (code) => fireExit(s, code));
    proc.on("error", (err) => push(s, `\r\n[terminal] gagal spawn: ${err.message}\r\n`));
    log.info({ id: s.info.id, backend: "local", cmd: shell.cmd }, "sesi terminal (local) siap");
  }
  return s.info;
}

/** Kirim input mentah (user mengetik / agent mengirim baris). */
export function writeInput(id: string, data: string): boolean {
  const s = sessions.get(id);
  if (!s || s.info.exited) return false;
  if (s.docker) s.docker.write(data);
  else s.proc?.stdin?.write(data);
  s.info.lastActivity = Date.now();
  return true;
}

/** Langganan live-chunk + replay ring penuh saat attach. */
export function subscribe(
  id: string,
  onData: (chunk: string) => void,
  onExit?: (code: number | null) => void,
): { replay: string; unsubscribe: () => void } | null {
  const s = sessions.get(id);
  if (!s) return null;
  s.listeners.add(onData);
  if (onExit) s.exitCbs.add(onExit);
  return {
    replay: s.buffer,
    unsubscribe: () => {
      s.listeners.delete(onData);
      if (onExit) s.exitCbs.delete(onExit);
    },
  };
}

export function getSession(id: string): TerminalSessionInfo | undefined {
  const s = sessions.get(id);
  return s ? { ...s.info } : undefined;
}

export function listSessions(): TerminalSessionInfo[] {
  return [...sessions.values()].map((s) => ({ ...s.info }));
}

export async function killSession(id: string): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  if (s.docker) await s.docker.kill();
  else s.proc?.kill();
  fireExit(s, null);
  sessions.delete(id);
  return true;
}

/** Tutup semua (graceful shutdown proses api). */
export async function closeAll(): Promise<void> {
  for (const id of [...sessions.keys()]) await killSession(id);
}

/** (fix user "delete project → container tak ikut terhapus"): matikan
 * SEMUA sesi terminal yang workspace-nya berada di bawah `rootPath`.
 * Dipanggil runtime.deleteProject SEBELUM dir workspace di-rm, tanpa ini
 * container sandbox `yui-ses-*` (backend docker) tetap hidup di host setelah
 * project dihapus, dan di Windows sesi local yang memegang cwd membuat
 * rmSync gagal EPERM. Return jumlah sesi yang dimatikan. */
export async function killSessionsUnder(rootPath: string): Promise<number> {
  const root = path.resolve(rootPath);
  const under = (p: string) => {
    const r = path.resolve(p);
    return r === root || r.startsWith(root + path.sep);
  };
  let killed = 0;
  for (const id of [...sessions.keys()]) {
    const s = sessions.get(id);
    if (!s) continue;
    if (under(s.info.workspacePath)) {
      await killSession(id);
      killed++;
    }
  }
  return killed;
}

/** Eksekusi agent: tulis `command + \n` ke sesi workspace, kumpulkan output
 * BARU sampai senyap `quietMs` atau `timeoutMs`. Return tail ter-redact.
 * Karena sesi SHARED, output yang sama juga tampil di tab Terminal user. */
export async function runInSession(
  workspacePath: string,
  command: string,
  opts: { timeoutMs?: number; quietMs?: number; workshopContainer?: string } = {},
): Promise<{ terminalId: string; backend: "docker" | "local"; output: string; timedOut: boolean }> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const quietMs = opts.quietMs ?? 1_200;
  const info = await ensureSession(workspacePath, { workshopContainer: opts.workshopContainer });
  const s = sessions.get(info.id)!;

  const chunks: string[] = [];
  const onData = (c: string) => chunks.push(c);
  s.listeners.add(onData);
  let timedOut = false;
  try {
    writeInput(info.id, command + "\n");
    const t0 = Date.now();
    let lastData = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const before = chunks.length;
      await new Promise((r) => setTimeout(r, 150));
      if (chunks.length > before) lastData = Date.now();
      else if (Date.now() - lastData >= quietMs) break;
    }
    timedOut = Date.now() - t0 >= timeoutMs;
  } finally {
    s.listeners.delete(onData);
  }
  const raw = chunks.join("");
  return {
    terminalId: info.id,
    backend: info.backend,
    output: redactSecrets(raw.slice(-4_000)),
    timedOut,
  };
}
