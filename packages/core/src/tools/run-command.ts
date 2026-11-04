// @yui/core — run_command (DEMO): ls/echo dieksekusi INTERNAL (readdir/print —
// aman & lintas-OS), `node` via execFile dengan cwd = workspace proyek +
// approval. P0-SEC-2: stdout/stderr di-redact sebelum masuk konteks agent.
// DEMO-SHORTCUT: bukan sandbox — P0 mengganti dengan container (P0-SEC-1).
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { registry } from "../registry.js";
import { redactSecrets } from "../redact.js";

const TIMEOUT_MS = 10_000;

const schema = z.object({
  command: z.enum(["node", "ls", "echo"]),
  args: z.array(z.string()).default([]),
});

/** `ls` internal: daftar direktori (nama + tanda d/f) — tidak spawn proses. */
function lsInternal(dir: string, args: string[]): unknown {
  const target = path.resolve(dir, ...(args.filter((a) => !a.startsWith("-")) || ["."]));
  const entries = fs.readdirSync(target, { withFileTypes: true });
  const lines = entries
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
  return { cwd: target, entries: lines.slice(0, 500) };
}

export function registerRunCommandTool(): void {
  registry.register({
    name: "run_command",
    description:
      "Jalankan perintah: `ls` (daftar direktori — internal, aman, tanpa approval), `echo`, atau `node <file.js>` (cwd = root proyek, butuh approval).",
    parameters: schema,
    handler: async (args: z.infer<typeof schema>, ctx) => {
      // ls/echo dieksekusi in-process: hasil identik di Windows/Unix, tanpa risiko
      // eksekusi arbitrer → bebas approval (mengurangi approval fatigue user).
      if (args.command === "ls") return { result: lsInternal(ctx.workspacePath, args.args) };
      if (args.command === "echo") return { result: { stdout: args.args.join(" ") } };

      // node — cwd HARUS root proyek (fix quirk: dulu mewarisi apps/web).
      const out = await new Promise<string>((resolve) => {
        execFile(
          args.command,
          args.args,
          { cwd: ctx.workspacePath, timeout: TIMEOUT_MS, maxBuffer: 1_000_000 },
          (err, stdout, stderr) => {
            resolve(
              JSON.stringify({
                cwd: ctx.workspacePath,
                err: redactSecrets(err?.message ?? ""),
                stdout: redactSecrets(String(stdout).slice(0, 8_000)),
                stderr: redactSecrets(String(stderr).slice(0, 2_000)),
              }),
            );
          },
        );
      });
      return { result: JSON.parse(out) as unknown };
    },
    // Hanya `node` yang mengeksekusi kode → butuh approval (alasan menyertakan
    // argumen agar user tahu apa yang dijalankan). ls/echo internal = bebas.
    approvalPolicy: (args: z.infer<typeof schema>) => {
      if (args.command !== "node") return null;
      const argv = args.args.join(" ").slice(0, 80);
      return `Menjalankan node ${argv} (cwd: root proyek)`;
    },
  });
}
