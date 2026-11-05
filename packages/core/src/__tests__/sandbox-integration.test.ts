// P0-SEC-1 — integrasi SANDBOX NYATA (docker run sungguhan).
// Gate: hanya jalan bila YUI_SANDBOX_IT=1 — menjaga CI/laptop tanpa Docker
// tetap hijau. Docker tak hidup → skip dinamis (probe async, bukan skipIf
// statis yang dievaluasi sebelum hooks). Jalankan manual:
//   YUI_SANDBOX_IT=1 npx vitest run src/__tests__/sandbox-integration.test.ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dockerAvailable, runInSandbox } from "../tools/sandbox.js";

const GATED = process.env.YUI_SANDBOX_IT === "1";
let dir = "";
let haveDocker = false;

beforeAll(async () => {
  if (!GATED) return;
  haveDocker = await dockerAvailable(true);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-sb-it-"));
});

afterAll(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe("P0-SEC-1 sandbox integration (docker nyata)", () => {
  it.skipIf(!GATED)("node -v berjalan & exit 0", { timeout: 30_000 }, async (ctx) => {
    if (!haveDocker) return ctx.skip();
    const r = await runInSandbox("node", ["-v"], dir);
    expect(r.timedOut).toBe(false);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toMatch(/^v\d+\./);
  });

  it.skipIf(!GATED)("EGRESS DIBLOKIR: fetch keluar harus gagal", async (ctx) => {
    if (!haveDocker) return ctx.skip();
    const r = await runInSandbox(
      "node",
      ["-e", "fetch('http://93.184.216.34/').then(()=>process.exit(0)).catch(()=>process.exit(3))"],
      dir,
    );
    expect(r.exitCode).toBe(3); // network unreachable → fetch throw (default-deny)
  }, 30_000);

  it.skipIf(!GATED)("file yang ditulis agent MUNCUL di workspace host", { timeout: 30_000 }, async (ctx) => {
    if (!haveDocker) return ctx.skip();
    await runInSandbox("node", ["-e", "require('fs').writeFileSync('hasil.txt','ok')"], dir);
    expect(fs.readFileSync(path.join(dir, "hasil.txt"), "utf8")).toBe("ok");
  });

  it.skipIf(!GATED)("rootfs read-only: tulis di luar /workspace & /tmp DITOLAK", { timeout: 30_000 }, async (ctx) => {
    if (!haveDocker) return ctx.skip();
    const r = await runInSandbox("node", ["-e", "require('fs').writeFileSync('/nol.txt','x')"], dir);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("EROFS"); // read-only rootfs (node: EROFS, bukan EPERM)
  });

  it.skipIf(!GATED)("timeout: container dibunuh setelah batas waktu", async (ctx) => {
    if (!haveDocker) return ctx.skip();
    const r = await runInSandbox("node", ["-e", "while(true){}"], dir, { timeoutMs: 3_000 });
    expect(r.timedOut).toBe(true);
  }, 30_000);
});
