// @yuika/core, run_command: `ls`/`echo` dieksekusi INTERNAL (readdir/print,
// aman & lintas-OS, bebas approval), `node` dieksekusi di SANDBOX container
// sekali-pakai (P0-SEC-1: network default-deny, resource cap, timeout, rootfs
// ro, detail tools/sandbox.ts). Fallback `off`/`auto-tanpa-docker` = execFile
// lokal. P0-SEC-2: stdout/stderr di-redact sebelum masuk konteks agent.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { registry } from "../registry.js";
import { redactSecrets } from "../redact.js";
import { redactActive } from "../vault/redact.js";
import { getVault } from "../vault/manager.js";
import { logCommand } from "../terminal/manager.js";
// namespace import: test meng-ganti dockerAvailable/runInSandbox via vi.spyOn
import * as sandbox from "./sandbox.js";
import * as egressMod from "./egress.js";

const TIMEOUT_MS = 20_000;

/** Subperintah npm yang diizinkan (sisanya ditolak di validasi, `publish`,
 * `access`, `owner` dsb. berbahaya utk agent). */
const NPM_SUB = new Set(["install", "ci", "run", "run-script", "exec", "test", "ls", "outdated", "view", "fund", "doctor"]);

const schema = z.object({
  command: z.enum(["node", "npm", "npx", "ls", "echo"]),
  args: z.array(z.string()).default([]),
  /** P2-VLT-3 command variables: env utk proses anak. NILAI WAJIB referensi
   *  vault (`vault:<name>`), nilai polos TIDAK diterima supaya rahasia tak
   *  pernah lewat konteks model. Nama reserved ditolak. */
  env: z.record(z.string(), z.string()).optional(),
}).superRefine((v, ctx) => {
  if (v.command === "npm") {
    const sub = v.args[0];
    if (!sub || !NPM_SUB.has(sub)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `subperintah npm tidak diizinkan: ${sub ?? "(kosong)"}, pakai salah satu: ${[...NPM_SUB].join(", ")}` });
    }
  }
  for (const [k, val] of Object.entries(v.env ?? {})) {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(k)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `env name "${k}" invalid, UPPER_SNAKE_CASE only` });
      continue;
    }
    if (RESERVED_ENV.has(k) || RESERVED_ENV_PREFIX.some((p) => k.startsWith(p))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `env name "${k}" is reserved and cannot be set via run_command` });
    }
    if (!val.startsWith("vault:")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `env "${k}" value must be a vault reference (vault:<name>), plain secrets are rejected so values never pass through the model` });
    }
  }
});

/** Nama env berbahaya utk proses anak (loader/proxy/konfigurasi runtime). */
const RESERVED_ENV = new Set([
  "PATH", "HOME", "USER", "SHELL", "PWD", "TMPDIR", "TERM", "HOSTNAME", "IFS", "PS1",
  "NODE_OPTIONS", "NODE_PATH", "NODE_ENV", "NODE_EXTRA_CA_CERTS",
]);
const RESERVED_ENV_PREFIX = ["LD_", "GIT_", "NPM_CONFIG_", "YUI_"];

/** `ls` internal: daftar direktori (nama + tanda d/f), tidak spawn proses. */
function lsInternal(dir: string, args: string[]): unknown {
  const target = path.resolve(dir, ...(args.filter((a) => !a.startsWith("-")) || ["."]));
  const entries = fs.readdirSync(target, { withFileTypes: true });
  const lines = entries
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
  return { cwd: target, entries: lines.slice(0, 500) };
}

/** Eksekusi lokal (mode off / auto-tanpa-docker), JALAN DI HOST TANPA ISOLASI. */
function runLocal(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string; err: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd, timeout: TIMEOUT_MS, maxBuffer: 1_000_000, ...(env ? { env } : {}) }, (err, stdout, stderr) => {
      resolve({
        stdout: redactActive(redactSecrets(String(stdout).slice(0, 8_000))),
        stderr: redactActive(redactSecrets(String(stderr).slice(0, 2_000))),
        err: redactActive(redactSecrets(err?.message ?? "")),
      });
    });
  });
}

/** P2-VLT-3: resolve `vault:<name>` refs → nilai env asli (backend-only).
 *  Return { env, releases }, caller WAJIB memanggil semua releases setelah
 *  proses selesai (nilai keluar dari registry redaksi aktif). */
function resolveVaultEnv(
  env: Record<string, string> | undefined,
  viewer: { personaId?: string; projectId?: string | null },
): { env: NodeJS.ProcessEnv | undefined; releases: Array<() => void>; names: string[] } {
  if (!env || Object.keys(env).length === 0) return { env: undefined, releases: [], names: [] };
  const out: Record<string, string> = {};
  const releases: Array<() => void> = [];
  const names: string[] = [];
  for (const [k, ref] of Object.entries(env)) {
    const name = ref.slice("vault:".length);
    const s = getVault().resolveForUse(name, viewer);
    if (!s) throw new Error(`vault credential "${name}" not found, call vault_request first`);
    out[k] = s.value;
    names.push(name);
    releases.push(s.release);
  }
  return { env: { ...process.env, ...out }, releases, names };
}

export function registerRunCommandTool(): void {
  registry.register({
    name: "run_command",
    description:
      "Jalankan perintah: `ls` (daftar direktori, internal, aman, tanpa approval), `echo`, `node <file.js>` (sandbox terisolasi, TANPA jaringan, timeout 20 dtk), `npm <install|ci|run|test|...>` (install/ci mendapat egress TERBATAS ke registry npm via allowlist, default registry.npmjs.org dsb., bisa diubah per proyek di .yuika/egress.json), atau `npx <pkg>` (egress sama seperti npm install). Semua kecuali ls/echo butuh approval dan jalan di container sandbox (cwd = root proyek).",
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

      // P2-VLT-3: resolve refs vault → env asli (nilai tak pernah masuk args/ctx)
      let vEnv: { env: NodeJS.ProcessEnv | undefined; releases: Array<() => void>; names: string[] };
      try {
        vEnv = resolveVaultEnv(args.env, { personaId: ctx.personaId, projectId: ctx.projectId });
      } catch (e) {
        return { result: { error: "vault_not_found", message: (e as Error).message }, isError: true };
      }
      for (const n of vEnv.names) {
        ctx.emit({ type: "vault.used", name: n, kind: "command", channel: "command", target: `${args.command} ${vEnv.names.join(",")}`.slice(0, 80) });
      }
      const envNote = vEnv.names.length ? ` env=[${Object.keys(args.env ?? {}).join(",")} via vault]` : "";

      try {
      if (useSandbox) {
        const r = await sandbox.runInSandbox(args.command, args.args, ctx.workspacePath, {
          ...(egress.length ? { egress } : {}),
          ...(vEnv.env ? { env: vEnv.env } : {}),
        });
        // exit 125 = docker daemon error (image tak ada dsb.), pesan jelas utk agent
        const dockerErr = r.exitCode === 125 || r.exitCode === null;
        const out = redactActive(redactSecrets(r.stdout.slice(0, 8_000)));
        const errOut = redactActive(redactSecrets(
          (r.timedOut ? "[sandbox] timeout, container dimatikan\n" : "") + r.stderr.slice(0, 2_000),
        ));
        // FLOW #7: eksekusi terlihat di panel terminal (view "Commands")
        logCommand(ctx.workspacePath, {
          command: args.command,
          args: args.args,
          exitCode: r.exitCode,
          stdout: out,
          stderr: errOut,
          note: (`sandbox` + envNote).trim(),
        });
        return {
          result: {
            sandbox: true,
            exitCode: r.exitCode,
            stdout: out,
            stderr: errOut,
            ...(r.timedOut ? { timedOut: true } : {}),
            ...(dockerErr && !r.timedOut ? { error: "sandbox docker gagal (daemon/image?)" } : {}),
          },
          isError: r.timedOut || dockerErr,
        };
      }

      // fail-open hanya di mode auto: Docker tak ada → jalankan lokal + catatan
      // eksplisit agar agent & user tahu eksekusi TIDAK terisolasi (egress pun
      // TIDAK ditegakkan, proxy hanya jalan di dalam container).
      const out = await runLocal(args.command, args.args, ctx.workspacePath, vEnv.env);
      logCommand(ctx.workspacePath, {
        command: args.command,
        args: args.args,
        exitCode: out.err ? 1 : 0,
        stdout: out.stdout,
        stderr: out.stderr,
        note: (`local (tanpa isolasi)` + envNote).trim(),
      });
      return {
        result: {
          sandbox: false,
          note: "docker tidak tersedia, eksekusi lokal TANPA isolasi (YUI_SANDBOX=off/auto)",
          ...out,
        },
      };
      } finally {
        for (const rel of vEnv.releases) rel(); // nilai keluar dari redaksi aktif
      }
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
