// @yuika/core — P2-STU-2: tool `terminal` — agent memakai sesi terminal SHARED
// dengan user (tab Terminal). Perintah di luar daftar aman → approval card
// (persis approval write_file/run_command: user approve dari chat utama).
import { z } from "zod";
import { registry } from "../registry.js";
import { runInSession, ensureSession } from "../terminal/manager.js";
import type { WorkshopManager } from "../workshop/manager.js";

/** Awalan perintah bebas-approval: read/build/run yang sudah di-gerbangi
 * sandbox terminal (docker) atau setidaknya visible di tab user. npm HANYA
 * subperintah aman (publish/access/owner dsb. → approval); git push/fetch/
 * reset/clean → approval. */
const SAFE_RE =
  /^(node|tsc|vitest|jest|python|pip|ls|dir|cat|type|echo|pwd|cd|mkdir|touch|which|where)(\s|$)/;
const NPM_SAFE = new Set(["install", "ci", "run", "run-script", "exec", "test", "ls", "outdated", "view", "fund", "doctor", "init"]);
const GIT_SAFE = new Set(["status", "log", "diff", "add", "commit", "branch", "show", "init", "checkout", "restore", "stash"]);

function isSafe(command: string): boolean {
  const c = command.trim();
  if (SAFE_RE.test(c)) return true;
  const [head, sub] = c.split(/\s+/);
  if (head === "npm") return sub !== undefined && NPM_SAFE.has(sub);
  if (head === "git") return sub !== undefined && GIT_SAFE.has(sub);
  return false;
}
export { isSafe as isSafeTerminalCommand };

const schema = z.object({
  command: z.string().min(1).max(2_000),
  /** detik menunggu output sebelum menyerah (default 30). */
  timeoutMs: z.number().int().min(1_000).max(180_000).optional(),
});

export function registerTerminalTool(
  deps: { workshop?: () => WorkshopManager; projectRoot?: (projectId: string) => string } = {},
): void {
  registry.register({
    name: "terminal",
    description:
      "Jalankan perintah di TERMINAL PROYEK — sesi yang SAMA dengan tab Terminal yang user lihat (output tampil live di UI; user bisa mengetik balik). Bila workshop project hidup, shell jalan DI DALAM container workshop (cwd = root proyek, file = file proyek yang sama dengan tab Files; install/paket menetap). Pakai untuk CLI interaktif/dev-server/npm. Output baru dikembalikan (tail 4000 char) setelah command senyap. Bebas approval: node, npm install|ci|run|test, tsc/vitest/jest, git status|log|diff|add|commit|branch|checkout, ls/cat/echo/pwd/cd/mkdir. Lainnya (npm publish, git push, curl, rm, …) butuh approval user.",
    parameters: schema,
    handler: async (args: z.infer<typeof schema>, ctx) => {
      // Batch 13 follow-up: agent bekerja di PROJECT workspace (bukan dir
      // workspace global) supaya sesi = sesi yang user lihat, dan bila
      // workshop hidup → shell-nya container workshop (file persist).
      const ws = ctx.projectId && deps.projectRoot ? deps.projectRoot(ctx.projectId) : ctx.workspacePath;
      let workshopContainer: string | undefined;
      if (ctx.projectId && deps.workshop) {
        try {
          const w = deps.workshop().info(ctx.projectId);
          if (w.state === "running") workshopContainer = w.containerName;
        } catch {
          /* tanpa workshop → jalur lama */
        }
      }
      // sesi dibuat bila belum ada — user melihatnya muncul di tab Terminal
      await ensureSession(ws, { workshopContainer });
      const r = await runInSession(ws, args.command, { timeoutMs: args.timeoutMs, workshopContainer });
      return {
        result: {
          terminalId: r.terminalId,
          backend: r.backend,
          ...(workshopContainer ? { workshop: true } : {}),
          note: r.backend === "local" ? "terminal lokal tanpa isolasi (Docker tak tersedia)" : undefined,
          output: r.output,
          ...(r.timedOut ? { timedOut: true, hint: "output diambil sampai timeout — perintah mungkin masih jalan; panggil terminal lagi dengan command kosong string tidak diizinkan, gunakan timeoutMs lebih besar" } : {}),
        },
      };
    },
    approvalPolicy: (args: z.infer<typeof schema>) =>
      isSafe(args.command)
        ? null
        : `Perintah terminal di luar daftar aman: ${args.command.slice(0, 80)}`,
  });
}
