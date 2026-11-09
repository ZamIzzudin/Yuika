// D70: eksekusi reset dari sisi API. Dipanggil route settings SETELAH reply
// 202 terkirim: quiesce → marker → exit(87). Penghapusan file terjadi di boot
// berikutnya (executePendingWipe) supaya tidak melawan file handle yang
// sengaja tidak ditutup (HMR-safe stores, Windows unlink).
import fs from "node:fs";
import type { YuiRuntime } from "@yuika/core";
import { RESET_EXIT_CODE, writeResetPending, pendingResetFile, type ResetScope } from "@yuika/core";
import { resolvePaths } from "@yuika/core";
import { getPortalHost } from "./portal/service.js";

export type ExitFn = (code: number) => never;

/** Quiesce + marker + exit. Semua langkah best-effort: marker adalah satu-satunya
 * langkah yang wajib (tanpanya boot berikutnya tidak tahu harus wipe). */
export function makeHostResetter(getRt: () => YuiRuntime, exit: ExitFn = process.exit) {
  return async (scope: ResetScope): Promise<void> => {
    try {
      await getPortalHost().stop(); // relay bye normal (bukan unlink)
    } catch {
      /* best-effort */
    }
    try {
      await getRt().dispose(); // MCP children, terminal, workshop, screens
    } catch {
      /* best-effort */
    }
    writeResetPending(resolvePaths(), scope);
    try {
      // Linux/deploy: coba hapus yang bisa (file yang tidak dipegang siapa pun);
      // Windows: sebagian gagal (db terbuka) — finisher boot yang menuntaskan.
      for (const p of [resolvePaths().dbPath, resolvePaths().workspacePath]) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    } catch {
      /* biarkan finisher boot */
    }
    exit(RESET_EXIT_CODE);
  };
}

/** Guard single-flight: marker ada = reset sedang berjalan. */
export function resetAlreadyPending(): boolean {
  return fs.existsSync(pendingResetFile(resolvePaths()));
}
