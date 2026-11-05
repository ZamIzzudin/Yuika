import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { updateEnvFile } from "../env-file.js";

function tmpEnv(initial?: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-env-"));
  const file = path.join(dir, ".env");
  if (initial) fs.writeFileSync(file, initial, "utf-8");
  return file;
}

describe("updateEnvFile (Settings)", () => {
  it("ganti nilai yang ada, pertahankan baris & komentar lain", () => {
    const file = tmpEnv("# komentar\nYUI_MODEL=glm/glm-5\nOTHER=1\n");
    const out = updateEnvFile(file, { YUI_MODEL: "glm/glm-5.1" });
    expect(out).toContain("# komentar");
    expect(out).toContain("YUI_MODEL=glm/glm-5.1");
    expect(out).toContain("OTHER=1");
    expect(out.match(/YUI_MODEL=/g)).toHaveLength(1);
  });

  it("tambah key baru bila belum ada; file hilang → dibuat", () => {
    const file = tmpEnv();
    const out = updateEnvFile(file, { YUI_API_KEY: "sk-test" });
    expect(out).toContain("YUI_API_KEY=sk-test");
  });

  it("duplikat key lama: hanya kemunculan pertama diganti, sisanya dibuang", () => {
    const file = tmpEnv("K=a\nK=b\nX=1\n");
    const out = updateEnvFile(file, { K: "c" });
    expect(out.match(/^K=/gm)).toHaveLength(1);
    expect(out).toContain("K=c");
    expect(out).toContain("X=1");
  });

  it("value NULL → key dihapus dari file (Settings: field dikosongkan tidak hidup lagi setelah restart)", () => {
    const file = tmpEnv("A=1\nYUI_MODEL_FALLBACK=glm/glm-5\nB=2\n");
    const out = updateEnvFile(file, { YUI_MODEL_FALLBACK: null, C: "3" });
    expect(out).toBe("A=1\nB=2\nC=3");
  });
});
