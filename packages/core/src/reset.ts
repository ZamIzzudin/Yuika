// D70: host data reset. Dua scope: "work" (semua data kerja) dan "factory"
// (+ yuika.env; desktop shell ikut membersihkan setup.json → welcome lagi).
//
// Mekanisme tunggal lintas platform: engine TIDAK menghapus file saat hidup
// (store sqlite sengaja tidak di-close saat HMR; Windows menolak unlink file
// terbuka). Alurnya:
//   1. POST /api/settings/reset → quiesce (relay bye, dispose runtime) →
//      tulis marker reset.pending → process.exit(87).
//   2. Supervisor restart: desktop parent respawn engine (exit code 87),
//      deployment docker restart: unless-stopped.
//   3. Boot berikutnya createYuiRuntime menjalankan executePendingWipe()
//      SEBELUM store mana pun dibuka → hapus artefak per scope → reset.log
//      → boot fresh.
// Yang tidak pernah disentuh: api.log (handle dipegang parent desktop),
// personas/skills/mcp.json base (layer image), flag update-in-progress.
import fs from "node:fs";
import path from "node:path";
import type { YuiPaths } from "./paths.js";

export const RESET_EXIT_CODE = 87;
export type ResetScope = "work" | "factory";

export const RESET_SCOPES: ResetScope[] = ["work", "factory"];

/** Artefak data user yang dihapus per scope (path absolut). */
export function resetArtifactPaths(paths: YuiPaths, scope: ResetScope): string[] {
  const dir = path.dirname(paths.dbPath);
  const base = [
    paths.dbPath,
    `${paths.dbPath}-wal`,
    `${paths.dbPath}-shm`,
    path.join(dir, "vault.db"),
    path.join(dir, "vault.db-wal"),
    path.join(dir, "vault.db-shm"),
    path.join(dir, "vault.key"),
    path.join(dir, "budget.json"),
    path.join(dir, "model-prices.json"),
    path.join(dir, ".yuika"), // profil browser persist (CDP) per project×persona
    paths.workspacePath, // USER.md, memory, project files, mcp.user.json, reports
  ];
  if (scope === "factory") base.push(path.join(dir, "yuika.env"));
  return base;
}

export function pendingResetFile(paths: YuiPaths): string {
  return path.join(path.dirname(paths.dbPath), "reset.pending");
}

export function resetLogFile(paths: YuiPaths): string {
  return path.join(path.dirname(paths.dbPath), "reset.log");
}

export interface WipeResult {
  scope: ResetScope;
  requestedAt: number;
  finishedAt: number;
  deleted: string[];
  failures: { path: string; error: string }[];
}

/** Boot-time finisher: bila ada reset.pending → hapus artefak, tulis
 * reset.log, hapus marker. Idempoten: tanpa marker → null (boot normal). */
export function executePendingWipe(paths: YuiPaths): WipeResult | null {
  const marker = pendingResetFile(paths);
  if (!fs.existsSync(marker)) return null;
  let scope: ResetScope = "work";
  let requestedAt = Date.now();
  try {
    const parsed = JSON.parse(fs.readFileSync(marker, "utf8")) as { scope?: string; at?: number };
    if (parsed.scope === "factory") scope = "factory";
    if (typeof parsed.at === "number") requestedAt = parsed.at;
  } catch {
    /* marker korup → anggap work, lanjut wipe */
  }
  const deleted: string[] = [];
  const failures: { path: string; error: string }[] = [];
  for (const target of resetArtifactPaths(paths, scope)) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      deleted.push(target);
    } catch (e) {
      failures.push({ path: target, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const result: WipeResult = { scope, requestedAt, finishedAt: Date.now(), deleted, failures };
  try {
    fs.writeFileSync(
      resetLogFile(paths),
      JSON.stringify({ ...result, status: failures.length ? "partial" : "complete" }, null, 2) + "\n",
    );
    fs.rmSync(marker, { force: true });
  } catch {
    /* log best-effort; wipe sendiri tetap terjadi */
  }
  return result;
}

/** Tulis marker reset (dipanggil setelah quiesce, tepat sebelum exit(87)). */
export function writeResetPending(paths: YuiPaths, scope: ResetScope): void {
  fs.writeFileSync(pendingResetFile(paths), JSON.stringify({ scope, at: Date.now() }) + "\n");
}
