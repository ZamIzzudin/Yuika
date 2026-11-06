// @yuika/core — run_command: `ls`/`echo` dieksekusi INTERNAL (readdir/print —
// aman & lintas-OS, bebas approval), `node` dieksekusi di SANDBOX container
// sekali-pakai (P0-SEC-1: network default-deny, resource cap, timeout, rootfs
// ro — detail tools/sandbox.ts). Fallback `off`/`auto-tanpa-docker` = execFile
// lokal. P0-SEC-2: stdout/stderr di-redact sebelum masuk konteks agent.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { registry } from "../registry.js";
import { redactSecrets } from "../redact.js";
// namespace import: test meng-ganti dockerAvailable/runInSandbox via vi.spyOn
import * as sandbox from "./sandbox.js";
import * as egressMod from "./egress.js";

const TIMEOUT_MS = 20_000;

/** Subperintah npm yang diizinkan (sisanya ditolak di validasi — `publish`,
 * `access`, `owner` dsb. berbahaya utk agent). */
const NPM_SUB = new Set(["install", "ci", "run", "run-script", "exec", "test", "ls", "outdated", "view", "fund", "doctor"]);

const schema = z.object({
  command: z.enum(["node", "npm", "npx", "ls", "echo"]),
  args: z.array(z.string()).default([]),
}).superRefine((v, ctx) => {
  if (v.command === "npm") {
    const sub = v.args[0];
    if (!sub || !NPM_SUB.has(sub)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `subperintah npm tidak diizinkan: ${sub ?? "(kosong)"} — pakai salah satu: ${[...NPM_SUB].join(", ")}` });
    }
  }
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

/** Eksekusi lokal (mode off / auto-tanpa-docker) — JALAN DI HOST TANPA ISOLASI. */
function runLocal(command: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string; err: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd, timeout: TIMEOUT_MS, maxBuffer: 1_000_000 }, (err, stdout, stderr) => {
      resolve({
        stdout: redactSecrets(String(stdout).slice(0, 8_000)),
        stderr: redactSecrets(String(stderr).slice(0, 2_000)),
        err: redactSecrets(err?.message ?? ""),
      });
    });
  });
}

export function registerRunCommandTool(): void {
  registry.register({
    name: "run_command",
    description:
      "Jalankan perintah: `ls` (daftar direktori — internal, aman, tanpa approval), `echo`, `node <file.js>` (sandbox terisolasi, TANPA jaringan, timeout 20 dtk), `npm <install|ci|run|test|...>` (install/ci mendapat egress TERBATAS ke registry npm via allowlist — default registry.npmjs.org dsb., bisa diubah per proyek di .yuika/egress.json), atau `npx <pkg>` (egress sama seperti npm install). Semua kecuali ls/echo butuh approval dan jalan di container sandbox (cwd = root proyek).",
    parameters: schema,
    handler: async (args: z.infer<typeof schema>, ctx) => {
      // ls/echo dieksekusi in-process: hasil identik di Windows/Unix, tanpa risiko
      // eksekusi arbitrer → bebas approval (mengurangi approval fatigue user).
      if (args.command === "ls") return { result: lsInternal(ctx.workspacePath, args.args) };
      if (args.command === "echo") return { result: { stdout: args.args.join(" ") } };

      // node/npm/npx → sandbox (P0-SEC-1). npm install/ci & npx butuh registry
      // → egress allowlist per-project (P1-MCP-4, default npm/yarn registry,
      // override: <workspace>/.yuika/egress.json atau YUI_EGRESS_ALLOW).
      const mode = sandbox.readSandboxMode();
      const useSandbox = mode === "off" ? false : mode === "docker" ? true : await sandbox.dockerAvailable();
      const needsNet =
        args.command === "npx" ||
        (args.command === "npm" && (args.args[0] === "install" || args.args[0] === "ci"));
      const egress = needsNet ? egressMod.readEgressAllow(ctx.workspacePath) : [];

      if (useSandbox) {
        const r = await sandbox.runInSandbox(args.command, args.args, ctx.workspacePath, egress.length ? { egress } : {});
        // exit 125 = docker daemon error (image tak ada dsb.) — pesan jelas utk agent
        const dockerErr = r.exitCode === 125 || r.exitCode === null;
        return {
          result: {
            sandbox: true,
            exitCode: r.exitCode,
            stdout: redactSecrets(r.stdout.slice(0, 8_000)),
            stderr: redactSecrets(
              (r.timedOut ? "[sandbox] timeout — container dimatikan\n" : "") + r.stderr.slice(0, 2_000),
            ),
            ...(r.timedOut ? { timedOut: true } : {}),
            ...(dockerErr && !r.timedOut ? { error: "sandbox docker gagal (daemon/image?)" } : {}),
          },
          isError: r.timedOut || dockerErr,
        };
      }

      // fail-open hanya di mode auto: Docker tak ada → jalankan lokal + catatan
      // eksplisit agar agent & user tahu eksekusi TIDAK terisolasi (egress pun
      // TIDAK ditegakkan — proxy hanya jalan di dalam container).
      const out = await runLocal(args.command, args.args, ctx.workspacePath);
      return {
        result: {
          sandbox: false,
          note: "docker tidak tersedia — eksekusi lokal TANPA isolasi (YUI_SANDBOX=off/auto)",
          ...out,
        },
      };
    },
    // node/npm/npx = eksekusi kode / unduh paket → butuh approval (defense-in-
    // depth: sandbox mengurangi dampak, tapi user tetap tahu & mengizinkan).
    // ls/echo internal = bebas.
    approvalPolicy: (args: z.infer<typeof schema>) => {
      if (args.command === "ls" || args.command === "echo") return null;
      const argv = args.args.join(" ").slice(0, 80);
      return `Menjalankan ${args.command} ${argv} (cwd: root proyek, container sandbox)`;
    },
  });
}
