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
import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { moduleLogger } from "../logger.js";

export interface SandboxOptions {
  image: string;
  memory: string;
  cpus: string;
  pidsLimit: number;
  tmpfsSize: string;
  timeoutMs: number;
  killGraceMs: number;
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

/** Bangun argv `docker run` — diekspor untuk test kontrak flag (tanpa spawn). */
export function sandboxArgv(
  name: string,
  cmd: string,
  args: string[],
  workspacePath: string,
  opts: Partial<SandboxOptions> = {},
): string[] {
  const o = {
    ...SANDBOX_DEFAULTS,
    image: process.env.YUI_SANDBOX_IMAGE || SANDBOX_DEFAULTS.image,
    ...opts,
  };
  return [
    "run",
    "--rm",
    "--name", name,
    // default-deny egress: TIDAK ada network di dalam container
    "--network", "none",
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
    "-v", `${mountPath(workspacePath)}:/workspace:rw`,
    "-w", "/workspace",
    o.image,
    cmd,
    ...args,
  ];
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
  const argv = sandboxArgv(name, cmd, args, workspacePath, opts);

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
