// @yuika/core — P0-SEC-1: sandbox container untuk run_command.
// Eksekusi `node` berjalan di container Docker SEKALI-PAKAI dengan:
//   - network default-deny (`--network none` — egress diblokir total)
//   - resource cap (memory / cpus / pids-limit)
//   - rootfs read-only; hanya /workspace (mount rw) + tmpfs /tmp yang bisa ditulis
//   - cap-drop ALL + no-new-privileges
//   - timeout → `docker kill` (container dijamin mati, bukan cuma CLI-nya)
// Workspace proyek di-mount → hasil file yang ditulis agent TERLIHAT di host.
//
// Mode (env YUI_SANDBOX, tervalidasi env.ts):
//   auto  — docker bila tersedia; kalau tidak → fallback eksekusi lokal + peringatan
//   docker— fail-closed: tanpa Docker → error jelas (untuk deployment server)
//   off   — selalu eksekusi lokal (dev tanpa Docker Desktop)
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { moduleLogger } from "../logger.js";
import { getEgressProxy } from "./egress.js";

export interface SandboxOptions {
  image: string;
  memory: string;
  cpus: string;
  pidsLimit: number;
  tmpfsSize: string;
  timeoutMs: number;
  killGraceMs: number;
  /** P1-MCP-4: allowlist egress — non-empty = network ON via allowlist proxy
   * (host-side); kosong = default-deny `--network none` (perilaku lama). */
  egress?: string[];
  /** mode mount workspace: rw (default) | ro (MCP worker — server baca
   * workspace, tak menulis). */
  mountMode?: "rw" | "ro";
  /** sisipkan `-i` (stdin terbuka) — MCP worker stdio / terminal. */
  interactive?: boolean;
  /** P2-VLT-3: env proses anak (nilai vault sudah di-resolve backend-side) —
   *  dioper sbg `-e KEY=VAL`. */
  env?: NodeJS.ProcessEnv;
}

export const SANDBOX_DEFAULTS: Readonly<SandboxOptions> = {
  image: "node:24-bookworm-slim",
  memory: "512m",
  cpus: "1",
  pidsLimit: 128,
  tmpfsSize: "64m",
  timeoutMs: 20_000,
  killGraceMs: 5_000,
};

export interface SandboxResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** mode efektif eksekusi ini — masuk konteks agent agar transparan */
  note?: string;
}

export type SandboxMode = "auto" | "docker" | "off";

export function readSandboxMode(): SandboxMode {
  return (process.env.YUI_SANDBOX as SandboxMode) || "auto";
}

/** Cek Docker daemon hidup (`docker info`) — di-cache per proses: dipanggil di
 *  setiap tool call, jangan bayar 200ms tiap kali. */
let dockerProbe: Promise<boolean> | null = null;
export function dockerAvailable(probe = false): Promise<boolean> {
  if (probe) dockerProbe = null;
  dockerProbe ??= new Promise<boolean>((resolve) => {
    execFile("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 3_000 }, (err, out) => {
      resolve(!err && typeof out === "string" && out.trim().length > 0);
    });
  });
  return dockerProbe;
}

/** Mount path lintas-OS: Docker Desktop menerima `D:\a\b` tapi bentuk
 *  forward-slash `D:/a/b` lebih aman lewat execFile (tanpa shell quoting). */
function mountPath(ws: string): string {
  return path.resolve(ws).replace(/\\/g, "/");
}

/** Bangun argv `docker run` — diekspor untuk test kontrak flag (tanpa spawn).
 * `proxyPort` terisi = mode egress (lihat runInSandbox: proxy di host). */
export function sandboxArgv(
  name: string,
  cmd: string,
  args: string[],
  workspacePath: string,
  opts: Partial<SandboxOptions> = {},
  proxyPort?: number,
): string[] {
  const o = {
    ...SANDBOX_DEFAULTS,
    image: process.env.YUI_SANDBOX_IMAGE || SANDBOX_DEFAULTS.image,
    ...opts,
  };
  const egress = proxyPort !== undefined && (opts.egress?.length ?? 0) > 0;
  const argv = [
    "run",
    ...(o.interactive ? ["-i"] : []),
    "--rm",
    "--name", name,
    // default-deny egress: TIDAK ada network di dalam container — KECUALI
    // mode egress (P1-MCP-4): network nyala tapi SEMUA trafik dipaksa lewat
    // allowlist proxy di host (lihat tools/egress.ts).
    ...(egress ? ["--add-host", "host.docker.internal:host-gateway"] : ["--network", "none"]),
    // resource caps
    "--memory", o.memory,
    "--cpus", o.cpus,
    "--pids-limit", String(o.pidsLimit),
    // least privilege
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    // rootfs read-only — hanya workspace & tmpfs yang bisa ditulis
    "--read-only",
    "--tmpfs", `/tmp:rw,size=${o.tmpfsSize},noexec`,
    "-v", `${mountPath(workspacePath)}:/workspace:${o.mountMode === "ro" ? "ro" : "rw"}`,
    "-w", "/workspace",
    // HOME read-only-safe: rootfs RO (hanya /workspace & /tmp writable) —
    // npm/node menulis cache+log ke HOME → arahkan ke tmpfs; tanpa ini
    // `npm install/init` gagal EACCES diam-diam di rootfs RO.
    "-e", "HOME=/tmp",
    "-e", "npm_config_cache=/tmp/.npm",
    "-e", "npm_config_update_notifier=false",
  ];
  if (opts.env) {
    for (const [k, v] of Object.entries(opts.env)) argv.push("-e", `${k}=${v}`);
  }
  if (egress) {
    // npm/node menghormati env proxy standar; NO_PROXY utk localhost.
    const proxy = `http://host.docker.internal:${proxyPort}`;
    argv.push(
      "-e", `HTTP_PROXY=${proxy}`,
      "-e", `HTTPS_PROXY=${proxy}`,
      "-e", `http_proxy=${proxy}`,
      "-e", `https_proxy=${proxy}`,
      "-e", "NO_PROXY=localhost,127.0.0.1",
    );
  }
  argv.push(o.image, cmd, ...args);
  return argv;
}

/** Jalankan perintah di container sekali-pakai. Timeout → docker kill (grace)
 *  lalu resolve `timedOut: true` — tidak pernah menggantung pemanggil. */
export async function runInSandbox(
  cmd: string,
  args: string[],
  workspacePath: string,
  opts: Partial<SandboxOptions> = {},
): Promise<SandboxResult> {
  const o = {
    ...SANDBOX_DEFAULTS,
    image: process.env.YUI_SANDBOX_IMAGE || SANDBOX_DEFAULTS.image,
    ...opts,
  };
  const name = `yui-sb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  // P1-MCP-4: allowlist non-kosong → nyalakan proxy host sekali per allowlist,
  // paksa trafik container lewat situ. Gagal start proxy = jalur gagal (jangan
  // fail-open ke network penuh).
  let proxyPort: number | undefined;
  if ((opts.egress?.length ?? 0) > 0) {
    const proxy = await getEgressProxy(opts.egress!);
    proxyPort = proxy.port;
    o.timeoutMs = Math.max(o.timeoutMs, 120_000); // npm install bisa lambat
  }
  const argv = sandboxArgv(name, cmd, args, workspacePath, opts, proxyPort);

  return new Promise<SandboxResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const cap = 1_000_000; // 1 MB — sama dengan legacy execFile

    const child = spawn("docker", argv, { windowsHide: true });
    const timer = setTimeout(() => {
      timedOut = true;
      // bunuh CONTAINER (bukan cuma CLI): tanpa ini container jalan terus
      execFile("docker", ["kill", name], { timeout: o.killGraceMs }, () => undefined);
    }, o.timeoutMs);

    child.stdout?.on("data", (d: Buffer) => {
      if (stdout.length < cap) stdout += d.toString("utf8", 0, cap - stdout.length);
    });
    child.stderr?.on("data", (d: Buffer) => {
      if (stderr.length < cap) stderr += d.toString("utf8", 0, cap - stderr.length);
    });

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, timedOut });
    };
    child.on("error", (err) => {
      // docker CLI tidak ada (ENOENT) / gagal spawn → stderr jelas utk pemanggil
      stderr += `[docker] ${err instanceof Error ? err.message : String(err)}`;
      moduleLogger("sandbox").warn({ err: err instanceof Error ? err.message : err }, "docker spawn gagal");
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// P1-MCP-4 / P2-STU-2: sesi container PERSISTEN (bukan sekali-pakai).
// Dipakai untuk: (a) MCP worker — server stdio jalan DI DALAM container,
// stdin/stdout di-pipe ke StdioClientTransport; (b) Terminal tab — shell
// hidup lama, user & agent menulis ke stdin yang sama.
// ─────────────────────────────────────────────────────────────────────────────

export interface SandboxSession {
  containerName: string;
  /** tulis ke stdin proses (tanpa newline otomatis) */
  write(data: string): void;
  /** langganan stdout+stderr gabungan (chunk mentah) */
  onData(cb: (chunk: string) => void): () => void;
  /** callback exit (code / null saat kill) — sekali saja */
  onExit(cb: (code: number | null) => void): void;
  /** docker kill + tunggu proses CLI selesai (grace killGraceMs) */
  kill(): Promise<void>;
  readonly exited: boolean;
}

export interface SandboxSessionOptions extends Partial<SandboxOptions> {
  /** container dihapus saat kill (default true). */
  autoRemove?: boolean;
}

/** Spawn container interaktif `-i` (stdin terbuka, TANPA `-t` — pipe murni
 * supaya output tidak tercampur escape sequence PTY). */
export async function startSandboxSession(
  cmd: string,
  args: string[],
  workspacePath: string,
  opts: SandboxSessionOptions = {},
): Promise<SandboxSession> {
  const o = {
    ...SANDBOX_DEFAULTS,
    image: process.env.YUI_SANDBOX_IMAGE || SANDBOX_DEFAULTS.image,
    timeoutMs: 0, // sesi: TIDAK ada timeout (umur dikendalikan pemilik)
    ...opts,
  };
  const name = `yui-ses-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  // FIX (13d): sesi interaktif WAJIB `-i` — tanpa itu sh membaca EOF dan
  // mati instan (exit 0, tanpa output): terminal selalu "exited".
  const base = sandboxArgv(name, cmd, args, workspacePath, { ...opts, interactive: true, timeoutMs: 0 }, undefined);
  // sesi: tanpa --rm eksplisit di argv (sandboxArgv sudah --rm) — keep; kill
  // pakai `docker kill` sehingga container pasti bersih.
  let proxyPort: number | undefined;
  if ((opts.egress?.length ?? 0) > 0) {
    const proxy = await getEgressProxy(opts.egress!);
    proxyPort = proxy.port;
  }
  const argv = proxyPort !== undefined
    ? sandboxArgv(name, cmd, args, workspacePath, { ...opts, interactive: true, timeoutMs: 0 }, proxyPort)
    : base;

  const child = spawn("docker", argv, { windowsHide: true }) as ChildProcessWithoutNullStreams;
  const listeners = new Set<(chunk: string) => void>();
  const exitCbs = new Set<(code: number | null) => void>();
  let buffer = "";
  const cap = 400_000; // 400 KB ring per sesi
  const state = { exited: false };

  child.stdout.on("data", (d: Buffer) => {
    buffer = (buffer + d.toString("utf8")).slice(-cap);
    for (const cb of listeners) cb(d.toString("utf8"));
  });
  child.stderr.on("data", (d: Buffer) => {
    buffer = (buffer + d.toString("utf8")).slice(-cap);
    for (const cb of listeners) cb(d.toString("utf8"));
  });
  child.on("close", (code) => {
    state.exited = true;
    for (const cb of exitCbs) cb(code);
  });

  return {
    containerName: name,
    write: (data) => child.stdin.write(data),
    onData: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    onExit: (cb) => exitCbs.add(cb),
    kill: () =>
      new Promise<void>((resolve) => {
        const done = () => resolve();
        if (state.exited) return done();
        child.on("close", done);
        execFile("docker", ["kill", name], { timeout: o.killGraceMs }, () => undefined);
        try { child.stdin.end(); } catch { /* sudah mati */ }
        setTimeout(done, o.killGraceMs + 2_000); // jangan gantung pemanggil
      }),
    get exited() { return state.exited; },
  };
}
