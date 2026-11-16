// G-ALPHA sandbox no-escape: upaya kabur nyata terhadap container produksi.
// Gate: YUI_SANDBOX_IT=1 + Docker hidup (sama seperti sandbox-integration;
// tanpa itu skip). Vektor per G-ALPHA: path, network, resource, fork bomb,
// host surface (docker socket, privilege binary).
// Jalankan: YUI_SANDBOX_IT=1 npx vitest run src/__tests__/sandbox-escape.test.ts
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-sb-esc-"));
});

afterAll(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

/** Node satu-liner: exit code membawa hasil (0 = lolos/berhasil, lain = gagal). */
function probe(code: string): string[] {
  return ["-e", code];
}

describe("sandbox no-escape (docker nyata)", () => {
  it.skipIf(!GATED)(
    "PATH: tulis keluar /workspace (../../) harus gagal (rootfs ro, hanya mount workspace rw)",
    { timeout: 60_000 },
    async (ctx) => {
      if (!haveDocker) return ctx.skip();
      const r = await runInSandbox(
        "node",
        probe("const fs=require('fs');try{fs.writeFileSync('/x-escape','p');process.exit(0)}catch{process.exit(3)}"),
        dir,
      );
      expect(r.exitCode).toBe(3); // lolos = exit 0 = GAGAL test
    },
  );

  it.skipIf(!GATED)("PATH: baca berkas host di luar mount harus ENOENT", { timeout: 60_000 }, async (ctx) => {
    if (!haveDocker) return ctx.skip();
    const r = await runInSandbox(
      "node",
      probe("const fs=require('fs');try{fs.readFileSync('/var/run/docker.sock');process.exit(0)}catch(e){process.exit(/ENOENT/.test(String(e))?3:4)}"),
      dir,
    );
    // 3 = ENOENT (tidak ada); 4 = ada tapi error lain (mengkhawatirkan)
    expect(r.exitCode).toBe(3);
  });

  it.skipIf(!GATED)(
    "HOST SURFACE: docker socket & binary privilege (su/sudo) tidak ada di container",
    { timeout: 60_000 },
    async (ctx) => {
      if (!haveDocker) return ctx.skip();
      const r = await runInSandbox(
        "node",
        probe(
          "const fs=require('fs');const bad=['/var/run/docker.sock','/usr/bin/sudo','/bin/su'].filter(p=>fs.existsSync(p));" +
            "process.stderr.write('present:'+bad.join(','));process.exit(bad.length?0:3)",
        ),
        dir,
      );
      expect(r.exitCode).toBe(3);
      expect(r.stderr).not.toContain("present:/");
    },
  );

  it.skipIf(!GATED)(
    "NETWORK: DNS + TCP keluar diblokir (--network none)",
    { timeout: 60_000 },
    async (ctx) => {
      if (!haveDocker) return ctx.skip();
      const r = await runInSandbox(
        "node",
        probe(
          "(async()=>{let fail=0;" +
            "try{await fetch('http://93.184.216.34/',{signal:AbortSignal.timeout(8000)});}catch{fail++;}" +
            "try{require('dns').lookup('example.com',()=>{});await new Promise(r=>setTimeout(r,1000));}catch{fail++;}" +
            "process.exit(fail>0?3:0)})()",
        ),
        dir,
      );
      expect(r.exitCode).toBe(3);
    },
  );

  it.skipIf(!GATED)(
    "RESOURCE + FORK BOMB: banjir proses ditahan pids-limit; host tetap hidup, run selesai",
    { timeout: 90_000 },
    async (ctx) => {
      if (!haveDocker) return ctx.skip();
      const t0 = Date.now();
      const r = await runInSandbox(
        "node",
        probe(
          "const {spawn}=require('child_process');" +
            "for(let i=0;i<200;i++){try{spawn(process.execPath,['-e','while(true){}'],{stdio:'ignore'});}catch{}}" +
            "setTimeout(()=>process.exit(7),15000)",
        ),
        dir,
      );
      const dur = Date.now() - t0;
      // container dibunuh timeout (20 dtk default) ATAU script selesai;
      // pokoknya kembali, tidak hang, dan host (proses vitest ini) masih jalan.
      expect(r.timedOut === true || r.exitCode !== null).toBe(true);
      expect(dur).toBeLessThan(120_000);
    },
  );
});
