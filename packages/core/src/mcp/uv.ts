// @yuika/core, uv/uvx support (P1-MCP-1 lanjutan): server MCP Python (git, time,
// sentry) berjalan via uvx. Modul ini: (1) deteksi uvx di PATH, (2) fallback
// path absolut (installer uv masuk %USERPROFILE%\.local\bin, DI LUAR PATH
// proses dev server), (3) one-click install installer resmi astral.sh.
// Fallback absolut membuat "Install uv" dari UI langsung terpakai TANPA restart
// dev server (spawn pakai path penuh).
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CACHE_TTL_MS = 30_000;
let cache: { value: string | null; at: number } | null = null;

/** Kandidat path absolut uvx per-OS (installer uv default + homebrew). */
export function uvxCandidates(): string[] {
  const home = os.homedir();
  if (process.platform === "win32") {
    return [
      path.join(home, ".local", "bin", "uvx.exe"),
      path.join(process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "Programs", "uv", "uvx.exe"),
    ];
  }
  return [
    path.join(home, ".local", "bin", "uvx"),
    "/opt/homebrew/bin/uvx",
    "/usr/local/bin/uvx",
  ];
}

function tryRun(cmd: string, args: string[], timeoutMs = 8000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : stdout.trim());
    });
  });
}

/** Cari uvx yang bisa jalan: "uvx" bila di PATH, else path absolut, else null. Cache 30 dtk. */
export async function findUvx(): Promise<string | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  let value = await tryRun("uvx", ["--version"]);
  if (value) {
    cache = { value: "uvx", at: Date.now() };
    return "uvx";
  }
  for (const p of uvxCandidates()) {
    if (fs.existsSync(p)) {
      const out = await tryRun(p, ["--version"]);
      if (out) {
        cache = { value: p, at: Date.now() };
        return p;
      }
    }
  }
  cache = { value: null, at: Date.now() };
  return null;
}

export function invalidateUvxCache() {
  cache = null;
}

/**
 * Jalankan installer resmi uv (astral.sh). Windows: PowerShell script; lainnya: sh.
 * Return log tail untuk ditampilkan di UI. Setelah selesai cache dihapus lalu
 * findUvx() dipanggil ulang, bila ketemu, path absolut dikembalikan agar
 * koneksi MCP Python bisa jalan tanpa restart dev server.
 */
export async function installUv(): Promise<{ ok: boolean; uvxPath: string | null; log: string }> {
  const isWin = process.platform === "win32";
  const script = isWin
    ? `irm https://astral.sh/uv/install.ps1 | iex`
    : `curl -LsSf https://astral.sh/uv/install.sh | sh`;
  const { cmd, args } = isWin
    ? { cmd: "powershell", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script] }
    : { cmd: "sh", args: ["-c", script] };
  const out = await new Promise<string>((resolve) => {
    execFile(cmd, args, { timeout: 240_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve(`${stdout ?? ""}${stderr ?? ""}`.trim());
    });
  });
  invalidateUvxCache();
  const uvxPath = await findUvx();
  return { ok: Boolean(uvxPath), uvxPath, log: out.split(/\r?\n/).slice(-6).join("\n") };
}
