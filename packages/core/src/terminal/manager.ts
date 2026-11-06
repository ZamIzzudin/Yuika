// @yuika/core — P2-STU-2: TerminalManager.
// Sesi terminal PERSISTEN yang SHARED antara user (tab Terminal via SSE) dan
// agent (tool `terminal`). Satu sesi per workspace — keduanya menulis ke
// stdin proses yang sama, output mengalir ke semua pendengar.
//
// Backend sesi (mode, urutan):
//   docker  — `startSandboxSession("sh")`: shell DI DALAM container sandbox
//             (egress allowlist utk npm — generalisasi run_command, P1-MCP-4).
//   local   — fallback: shell host via pipes (cmd.exe / bin/sh) TANPA isolasi
//             (catatan eksplisit; PTY asli menyusul — v1 pipe murni).
// Env:
//   YUI_TERMINAL_MODE = auto (default: docker bila tersedia) | docker | local
//   YUI_TERMINAL_CMD  = override perintah shell utk pengujian, mis.
//                       "node test/fixtures/echo-shell.mjs"
import { spawn, type ChildProcess } from "node:child_process";
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

/** Mulai (atau ambil) sesi terminal utk sebuah workspace — satu sesi aktif per
 * workspace (user & agent selalu bertemu di sesi yang sama). */
export async function ensureSession(workspacePath: string): Promise<TerminalSessionInfo> {
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

  if (useDocker) {
    // Egress npm registry supaya `npm install` di terminal bisa jalan
    // (allowlist per-project sama dengan run_command, P1-MCP-4).
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

/** Eksekusi agent: tulis `command + \n` ke sesi workspace, kumpulkan output
 * BARU sampai senyap `quietMs` atau `timeoutMs`. Return tail ter-redact.
 * Karena sesi SHARED, output yang sama juga tampil di tab Terminal user. */
export async function runInSession(
  workspacePath: string,
  command: string,
  opts: { timeoutMs?: number; quietMs?: number } = {},
): Promise<{ terminalId: string; backend: "docker" | "local"; output: string; timedOut: boolean }> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const quietMs = opts.quietMs ?? 1_200;
  const info = await ensureSession(workspacePath);
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
