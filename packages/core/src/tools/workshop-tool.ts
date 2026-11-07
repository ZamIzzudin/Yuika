// @yuika/core — Batch 13 (P2-WKS-4): tool persona run_in_workshop.
// Eksekusi di container workshop PERSISTEN project (home selamat lintas
// tidur/bangun — node_modules & cache hangat). Berbeda dari run_command
// (sandbox disposable): workshop harus DIBUKA USER dulu dari panel Workshop
// (persetujuan pembukaan = klik user); persona boleh membangunkan yang tidur.
// Output di-redact (pola run_command: secrets + active run-scope).
import { z } from "zod";
import { registry } from "../registry.js";
import { redactSecrets } from "../redact.js";
import { redactActive } from "../vault/redact.js";
import type { WorkshopManager } from "../workshop/manager.js";

/** Perintah read-only ringan — bebas approval (mengurangi approval fatigue). */
const SAFE_HEADS = new Set(["ls", "cat", "pwd", "node", "npm", "echo", "printenv", "git", "df", "ps"]);

export function registerWorkshopTool(deps: { manager: () => WorkshopManager }): void {
  registry.register({
    name: "run_in_workshop",
    description:
      "Run a command in this project's persistent workshop container — the preferred place for installs and builds (npm install / npm init -y / npm run). cwd is the project root and it edits the SAME files shown in the Files tab; installed packages and the npm cache stay warm across sleep/wake, unlike the one-shot sandbox. Egress is limited to the project's allowlist. If the workshop is not open yet, the user gets an approval card to open it right here; if it is asleep it is woken automatically.",
    parameters: z.object({
      cmd: z.string().min(1).max(60),
      args: z.array(z.string().max(500)).max(32).default([]),
      /** Working dir inside the container (absolute; default /home/node). */
      cwd: z.string().max(200).optional(),
      timeoutMs: z.number().int().min(1_000).max(600_000).optional(),
    }),
    // apapun di luar daftar aman → user tahu & izinkan (workshop persist:
    // dampak lebih besar dari sandbox sekali-pakai).
    approvalPolicy: (args: { cmd: string; args: string[] }) => {
      const argv = [args.cmd, ...args.args].join(" ").slice(0, 80);
      if (SAFE_HEADS.has(args.cmd) && !argv.match(/\b(rm|mv|chmod|chown|curl|wget)\b/)) return null;
      return `Run "${argv}" in the persistent workshop container`;
    },
    handler: async (
      args: { cmd: string; args: string[]; cwd?: string; timeoutMs?: number },
      ctx: {
        projectId?: string | null;
        personaId?: string;
        requestApproval?: (tool: string, args2: Record<string, unknown>, reason: string) => Promise<boolean>;
      },
    ): Promise<{ isError?: boolean; result: unknown }> => {
      if (!ctx.projectId) return { isError: true, result: { error: "run_in_workshop requires a project" } };
      const m = deps.manager();
      const info = m.info(ctx.projectId);
      if (info.state === "absent") {
        // WKS-2: pembukaan workshop = KEPUTUSAN USER — tapi lewat KARTU
        // APPROVAL di chat (bukan suruh user pindah tab ke panel). Egress
        // yang akan dipasang dicantumkan supaya keputusan informed.
        const egress = m.readConfig(ctx.projectId).egressAllow;
        const ok = await ctx.requestApproval?.(
          "run_in_workshop",
          { cmd: args.cmd, args: args.args },
          `Open the persistent workshop container for this project (Docker; egress allowlist: ${egress.join(", ") || "none"})`,
        );
        if (ok === false) {
          return { isError: true, result: { error: "user menolak membuka workshop — install dihentikan" } };
        }
        await m.start(ctx.projectId, { by: `persona:${ctx.personaId ?? "unknown"}` });
      }
      const res = await m.exec(ctx.projectId, args.cmd, args.args, {
        by: `persona:${ctx.personaId ?? "unknown"}`,
        cwd: args.cwd,
        timeoutMs: args.timeoutMs,
      });
      return {
        result: {
          exitCode: res.exitCode,
          stdout: redactActive(redactSecrets(res.stdout.slice(0, 8_000))),
          stderr: redactActive(redactSecrets(res.stderr.slice(0, 2_000))),
          durationMs: res.durationMs,
          workshop: m.info(ctx.projectId).state,
        },
      };
    },
  });
}
