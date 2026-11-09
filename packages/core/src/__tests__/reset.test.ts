// D70: unit reset — daftar artefak per scope + finisher boot idempoten.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  executePendingWipe,
  pendingResetFile,
  resetArtifactPaths,
  resetLogFile,
  writeResetPending,
  type ResetScope,
} from "../reset.js";
import type { YuiPaths } from "../paths.js";

function tmpPaths(): YuiPaths {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yui-reset-"));
  return {
    dbPath: path.join(root, "data", "yui.db"),
    workspacePath: path.join(root, "data", "workspace"),
    personasDir: path.join(root, "personas"),
    skillsDir: path.join(root, "skills"),
    mcpConfigPath: path.join(root, "mcp.json"),
    // field lain tidak dipakai reset
  } as YuiPaths;
}

function seedWorkData(p: YuiPaths): void {
  const dir = path.dirname(p.dbPath);
  fs.mkdirSync(p.workspacePath, { recursive: true });
  fs.mkdirSync(path.join(dir, ".yuika", "browser"), { recursive: true });
  for (const f of [
    p.dbPath,
    `${p.dbPath}-wal`,
    path.join(dir, "vault.db"),
    path.join(dir, "vault.key"),
    path.join(dir, "budget.json"),
    path.join(dir, "model-prices.json"),
    path.join(dir, "api.log"),
    path.join(dir, "yuika.env"),
    path.join(p.workspacePath, "USER.md"),
    path.join(dir, ".yuika", "browser", "profile-a"),
  ]) {
    fs.writeFileSync(f, "x");
  }
}

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("resetArtifactPaths", () => {
  it("work scope: data kerja saja, yuika.env selamat", () => {
    const p = tmpPaths();
    dirs.push(path.dirname(path.dirname(p.dbPath)));
    const targets = resetArtifactPaths(p, "work");
    expect(targets).toContain(p.dbPath);
    expect(targets).toContain(p.workspacePath);
    expect(targets.some((t) => t.endsWith("vault.key"))).toBe(true);
    expect(targets.some((t) => t.endsWith("budget.json"))).toBe(true);
    expect(targets.some((t) => t.endsWith("model-prices.json"))).toBe(true);
    expect(targets.some((t) => t.endsWith(".yuika"))).toBe(true);
    expect(targets.some((t) => t.endsWith("yuika.env"))).toBe(false);
    expect(targets.some((t) => t.endsWith("api.log"))).toBe(false);
  });

  it("factory scope: + yuika.env", () => {
    const p = tmpPaths();
    dirs.push(path.dirname(path.dirname(p.dbPath)));
    const targets = resetArtifactPaths(p, "factory" as ResetScope);
    expect(targets.some((t) => t.endsWith("yuika.env"))).toBe(true);
    expect(targets.some((t) => t.endsWith("api.log"))).toBe(false);
  });
});

describe("executePendingWipe", () => {
  it("tanpa marker: null, tidak menyentuh apa pun", () => {
    const p = tmpPaths();
    dirs.push(path.dirname(path.dirname(p.dbPath)));
    seedWorkData(p);
    expect(executePendingWipe(p)).toBeNull();
    expect(fs.existsSync(p.dbPath)).toBe(true);
  });

  it("work: data kerja hilang, yuika.env + api.log selamat, reset.log tertulis", () => {
    const p = tmpPaths();
    dirs.push(path.dirname(path.dirname(p.dbPath)));
    seedWorkData(p);
    writeResetPending(p, "work");
    const result = executePendingWipe(p);
    expect(result?.scope).toBe("work");
    expect(result?.failures).toEqual([]);
    const dir = path.dirname(p.dbPath);
    expect(fs.existsSync(p.dbPath)).toBe(false);
    expect(fs.existsSync(`${p.dbPath}-wal`)).toBe(false);
    expect(fs.existsSync(path.join(dir, "vault.db"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "vault.key"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "budget.json"))).toBe(false);
    expect(fs.existsSync(path.join(dir, ".yuika"))).toBe(false);
    expect(fs.existsSync(p.workspacePath)).toBe(false);
    expect(fs.existsSync(path.join(dir, "yuika.env"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "api.log"))).toBe(true);
    expect(fs.existsSync(pendingResetFile(p))).toBe(false);
    expect(fs.existsSync(resetLogFile(p))).toBe(true);
  });

  it("factory: yuika.env ikut terhapus", () => {
    const p = tmpPaths();
    dirs.push(path.dirname(path.dirname(p.dbPath)));
    seedWorkData(p);
    writeResetPending(p, "factory");
    executePendingWipe(p);
    const dir = path.dirname(p.dbPath);
    expect(fs.existsSync(path.join(dir, "yuika.env"))).toBe(false);
    expect(fs.existsSync(resetLogFile(p))).toBe(true);
  });

  it("marker korup: dianggap work, tetap wipe", () => {
    const p = tmpPaths();
    dirs.push(path.dirname(path.dirname(p.dbPath)));
    seedWorkData(p);
    fs.writeFileSync(pendingResetFile(p), "{corrupt");
    const result = executePendingWipe(p);
    expect(result?.scope).toBe("work");
    expect(fs.existsSync(p.dbPath)).toBe(false);
  });
});
