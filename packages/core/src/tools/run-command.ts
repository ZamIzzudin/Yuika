// @yui/core — run_command (DEMO): execFile + allowlist + SELALU approval.
// DEMO-SHORTCUT: ini BUKAN sandbox — P0 mengganti dengan container (TASKS.md P0-SEC).
import { execFile } from "node:child_process";
import { z } from "zod";
import { registry } from "../registry.js";

const ALLOWED_BINARIES = ["node", "ls", "echo"]; // demo only
const TIMEOUT_MS = 10_000;

const schema = z.object({
  command: z.enum(["node", "ls", "echo"]),
  args: z.array(z.string()).default([]),
});

export function registerRunCommandTool(): void {
  registry.register({
    name: "run_command",
    description: "Jalankan perintah allowlist (node/ls/echo) dan kembalikan output. Butuh approval.",
    parameters: schema,
    handler: async (args: z.infer<typeof schema>) => {
      if (!ALLOWED_BINARIES.includes(args.command)) {
        return { result: { error: `command tidak diizinkan: ${args.command}` }, isError: true };
      }
      const out = await new Promise<string>((resolve) => {
        execFile(args.command, args.args, { timeout: TIMEOUT_MS, maxBuffer: 1_000_000 }, (err, stdout, stderr) => {
          resolve(JSON.stringify({ err: err?.message ?? null, stdout: String(stdout).slice(0, 8_000), stderr: String(stderr).slice(0, 2_000) }));
        });
      });
      return { result: JSON.parse(out) as unknown };
    },
    approvalPolicy: () => "Menjalankan perintah di mesin demo (selalu butuh approval)",
  });
}
