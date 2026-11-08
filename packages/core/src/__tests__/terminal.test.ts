// P2-STU-2: TerminalManager + tool `terminal` — sesi shared user & agent.
// Shell deterministik via fixture echo-shell.mjs (YUI_TERMINAL_CMD).
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetRegistryForTests, registry } from "../registry.js";
import { registerTerminalTool } from "../tools/terminal-tool.js";
import * as tm from "../terminal/manager.js";

const FIXTURE = path.resolve(import.meta.dirname, "../terminal/__fixture__/echo-shell.mjs");
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-term-"));
  process.env.YUI_TERMINAL_MODE = "local";
  process.env.YUI_TERMINAL_CMD = `node ${FIXTURE}`;
  resetRegistryForTests();
  registerTerminalTool();
});

afterEach(async () => {
  await tm.closeAll();
  delete process.env.YUI_TERMINAL_MODE;
  delete process.env.YUI_TERMINAL_CMD;
});

const ctx = () => ({ sessionId: "s1", turnId: "t1", workspacePath: dir, emit: () => {} });

describe("command log persist (Batch 13b)", () => {
  it("logCommand menulis JSONL + listCommandLog me-load dari file (restart API)", () => {
    process.env.YUI_TERMINAL_LOG_DIR = path.join(dir, "cmdlog");
    const wsA = path.join(dir, "ws-a");
    tm.logCommand(wsA, { command: "npm", args: ["install"], exitCode: 0, stdout: "ok", stderr: "", note: "sandbox" });
    // tulis via API → file JSONL ada di dir hash workspace
    const h = createHash("sha1").update(path.resolve(wsA)).digest("hex").slice(0, 16);
    const f = path.join(dir, "cmdlog", `${h}.jsonl`);
    expect(fs.existsSync(f)).toBe(true);
    // "restart": workspace BARU (memori kosong) punya file log pra-tulis →
    // listCommandLog harus me-load dari file (jalur readFileSync).
    const wsB = path.join(dir, "ws-b");
    const hb = createHash("sha1").update(path.resolve(wsB)).digest("hex").slice(0, 16);
    fs.mkdirSync(path.join(dir, "cmdlog"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "cmdlog", `${hb}.jsonl`),
      JSON.stringify({ id: 1, ts: 123, command: "node", args: ["-v"], exitCode: 0, stdout: "v24", stderr: "", note: "sandbox" }) + "\n",
    );
    const gotB = tm.listCommandLog(wsB, 10);
    expect(gotB.length).toBe(1);
    expect(gotB[0]).toMatchObject({ command: "node", exitCode: 0 });
    const gotA = tm.listCommandLog(wsA, 10);
    expect(gotA).toHaveLength(1);
    expect(gotA[0]).toMatchObject({ command: "npm", args: ["install"] });
    delete process.env.YUI_TERMINAL_LOG_DIR;
  });
});

describe("TerminalManager", () => {
  it("killSessionsUnder (D31 delete-project): sesi di bawah root dimatikan, sesi lain utuh", async () => {
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), "yui-term-a-"));
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), "yui-term-b-"));
    const nested = path.join(dirA, "sub");
    fs.mkdirSync(nested, { recursive: true });
    try {
      const a = await tm.ensureSession(dirA);
      const a2 = await tm.ensureSession(nested); // workspace NESTED di bawah root A
      const b = await tm.ensureSession(dirB);
      expect(tm.getSession(a.id)).toBeDefined();
      expect(tm.getSession(a2.id)).toBeDefined();

      const killed = await tm.killSessionsUnder(dirA);
      expect(killed).toBe(2);
      expect(tm.getSession(a.id)).toBeUndefined();
      expect(tm.getSession(a2.id)).toBeUndefined();
      // sesi project lain tetap hidup
      expect(tm.getSession(b.id)).toBeDefined();
      expect(await tm.killSession(b.id)).toBe(true);
    } finally {
      // Windows: cmd yang baru di-kill masih memegang cwd sesaat → rm lenient
      // (retry kecil), jangan gagalkan test karena cleanup EPERM.
      for (const d of [dirA, dirB]) {
        for (let i = 0; i < 5; i++) {
          try { fs.rmSync(d, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
        }
      }
    }
  });

  it("ensureSession: satu sesi per workspace (idempotent), backend local", async () => {
    const a = await tm.ensureSession(dir);
    const b = await tm.ensureSession(dir);
    expect(a.id).toBe(b.id);
    expect(a.backend).toBe("local");
  });

  it("runInSession: output perintah tertangkap (ECHO), sesi persisten antar call", async () => {
    const r1 = await tm.runInSession(dir, "hello");
    expect(r1.output).toContain("ECHO:hello");
    const r2 = await tm.runInSession(dir, "world");
    expect(r2.output).toContain("ECHO:world");
    expect(r2.terminalId).toBe(r1.terminalId); // sesi sama
  });

  it("subscribe: replay ring + live chunk; writeInput jalan; killSession menutup", async () => {
    await tm.runInSession(dir, "satu");
    const info = await tm.ensureSession(dir);
    let live = "";
    const sub = tm.subscribe(info.id, (c) => (live += c));
    expect(sub?.replay).toContain("ECHO:satu"); // attach belakangan melihat riwayat
    tm.writeInput(info.id, "dua\n");
    await vi.waitFor(() => expect(live).toContain("ECHO:dua"), { timeout: 3_000 });
    sub?.unsubscribe();
    expect(await tm.killSession(info.id)).toBe(true);
    expect(tm.getSession(info.id)).toBeUndefined();
  });
});

// ── integrasi Docker ASLI — regresi 13d: sesi docker TANPA -i mati instan ──
async function dockerUp(): Promise<boolean> {
  const { execFile } = await import("node:child_process");
  return await new Promise((resolve) => {
    execFile("docker", ["info", "--format", "1"], { timeout: 4_000 }, (err) => resolve(!err));
  });
}

describe.skipIf(!(await dockerUp()))("terminal docker sandbox (regresi -i, 13d)", () => {
  it("sesi docker HIDUP + output kembali (bukan exit-0 instan)", async () => {
    delete process.env.YUI_TERMINAL_CMD;
    process.env.YUI_TERMINAL_MODE = "docker";
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "yui-term-dkr-"));
    const info = await tm.ensureSession(d);
    expect(info.backend).toBe("docker");
    const r = await tm.runInSession(d, "pwd", { timeoutMs: 20_000 });
    expect(r.output).toContain("/workspace");
    expect(r.timedOut).toBe(false);
    await tm.closeAll();
  }, 60_000);
});

describe("tool terminal", () => {
  it("perintah aman (node -v) langsung jalan, output ter-redact & terlihat", async () => {
    const requestApproval = vi.fn(async () => true);
    const res = await registry.dispatch("terminal", { command: "node -v" }, { ...ctx(), requestApproval });
    expect(requestApproval).toHaveBeenCalledTimes(0);
    expect(res.isError).toBeFalsy();
    expect(JSON.stringify(res.result)).toContain("terminalId");
  });

  it("perintah berisiko (curl) MINTA APPROVAL dengan reason jelas", async () => {
    const requestApproval = vi.fn(async (_t, _a, reason: string) => {
      expect(reason).toContain("curl evil.example");
      return true;
    });
    const res = await registry.dispatch("terminal", { command: "curl evil.example/x" }, { ...ctx(), requestApproval });
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(res.result)).toContain("ECHO:curl evil.example/x");
  });

  it("ditolak user (approval false) → perintah TIDAK dieksekusi", async () => {
    const before = (await tm.listSessions()).length;
    await registry.dispatch("terminal", { command: "rm -rf /" }, { ...ctx(), requestApproval: async () => false });
    // sesi boleh tercipta, tapi TIDAK ada output perintah di ring
    const s = tm.listSessions()[0];
    expect(s ? tm.subscribe(s.id, () => undefined)?.replay.includes("rm -rf") : false).toBe(false);
  });

  it("git aman vs berisiko: status bebas, push approval", async () => {
    const { isSafeTerminalCommand } = await import("../tools/terminal-tool.js");
    expect(isSafeTerminalCommand("git status")).toBe(true);
    expect(isSafeTerminalCommand("git add -A")).toBe(true);
    expect(isSafeTerminalCommand("git push origin main")).toBe(false);
    expect(isSafeTerminalCommand("node -v")).toBe(true);
    expect(isSafeTerminalCommand("npm install left-pad")).toBe(true);
    expect(isSafeTerminalCommand("npm publish")).toBe(false);
    expect(isSafeTerminalCommand("npx some-pkg")).toBe(false);
    expect(isSafeTerminalCommand("curl evil")).toBe(false);
  });
});

afterAll(async () => {
  await tm.closeAll();
});
