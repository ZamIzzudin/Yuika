// F2 Backup: bundle seluruh data host + restore script .mjs self-contained.
// Test bintang: script restore benar-benar DIJALANKAN node di repo dummy ->
// semua file + db kembali identik (file yang bisa di-run di host mana pun).
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { buildBackupBundle, restoreScriptText } from "../backup/bundle.js";

/** Jalankan restore script dengan jawaban stdin (execFile async tak punya opsi input). */
function runScript(file: string, cwd: string, answer: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("node", [file], { cwd, windowsHide: true });
    let err = "";
    p.stderr.on("data", (d: Buffer) => (err += d.toString()));
    p.stdin.write(answer + "\n");
    p.stdin.end();
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error("exit " + code + ": " + err.slice(0, 400)))));
  });
}
let tmp = "";

afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = "";
});

function setup() {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "yui-bak-"));
  const repoRoot = path.join(tmp, "repo");
  const workspacePath = path.join(repoRoot, "workspace");
  fs.mkdirSync(workspacePath, { recursive: true });
  // repo dummy: turbo.json penanda root (dipakai script restore utk cari root)
  fs.writeFileSync(path.join(repoRoot, "turbo.json"), "{}", "utf-8");
  // data contoh: persona custom, override, file project, db berisi baris
  const personas = path.join(workspacePath, "personas", "custom-mary");
  fs.mkdirSync(personas, { recursive: true });
  fs.writeFileSync(path.join(personas, "persona.yaml"), "id: custom-mary", "utf-8");
  fs.writeFileSync(path.join(workspacePath, "persona-names.json"), '{"renames":[]}', "utf-8");
  fs.mkdirSync(path.join(workspacePath, "projects", "p1"), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, "projects", "p1", "index.html"), "<h1>hi</h1>", "utf-8");
  const dbPath = path.join(repoRoot, "demo.db");
  const db = new Database(dbPath);
  db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
  db.prepare("INSERT INTO t (v) VALUES (?)").run("baris-penting");
  db.close();
  return { repoRoot, workspacePath, dbPath };
}

describe("F2 Backup bundle + restore script", () => {
  it("bundle memuat file workspace + snapshot db; skip file > 8MB", async () => {
    const { workspacePath, dbPath, repoRoot } = setup();
    const besar = path.join(workspacePath, "video-kecil.mp4");
    fs.writeFileSync(besar, Buffer.alloc(9 * 1024 * 1024, 1)); // > 8 MB -> skip
    const bundle = await buildBackupBundle({ workspacePath, dbPath, repoRoot });
    expect(bundle.format).toBe("yuika-backup");
    expect(bundle.files.some((f) => f.rel === "workspace/personas/custom-mary/persona.yaml")).toBe(true);
    expect(bundle.files.some((f) => f.rel === "demo.db")).toBe(true);
    expect(bundle.skipped.some((s) => s.endsWith("video-kecil.mp4"))).toBe(true);
  });

  it("restore script DIJALANKAN node: file + db kembali identik di repo target", async () => {
    const { workspacePath, dbPath, repoRoot } = setup();
    const bundle = await buildBackupBundle({ workspacePath, dbPath, repoRoot });
    const script = restoreScriptText(bundle);
    expect(script).toContain("yuika-backup");

    // target restore: repo dummy BARU (turbo.json), file yang sama belum ada
    const target = path.join(tmp, "target-repo");
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "turbo.json"), "{}", "utf-8");
    const scriptFile = path.join(target, "yuika-restore.mjs");
    fs.writeFileSync(scriptFile, script, "utf-8");

    // jalankan dengan jawaban "y" via stdin
    await runScript(scriptFile, target, "y");

    const restored = fs.readFileSync(path.join(target, "workspace/personas/custom-mary/persona.yaml"), "utf-8");
    expect(restored).toBe("id: custom-mary");
    expect(fs.readFileSync(path.join(target, "workspace/projects/p1/index.html"), "utf-8")).toBe("<h1>hi</h1>");
    // db ter-restore utuh (baris penting masih terbaca)
    const db2 = new Database(path.join(target, "demo.db"), { readonly: true });
    expect(db2.prepare("SELECT v FROM t").get()).toEqual({ v: "baris-penting" });
    db2.close();
  });

  it("jawaban selain y -> abort, tidak menulis apa pun", async () => {
    const { workspacePath, dbPath, repoRoot } = setup();
    const bundle = await buildBackupBundle({ workspacePath, dbPath, repoRoot });
    const target = path.join(tmp, "target-abort");
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "turbo.json"), "{}", "utf-8");
    const scriptFile = path.join(target, "yuika-restore.mjs");
    fs.writeFileSync(scriptFile, restoreScriptText(bundle), "utf-8");
    await runScript(scriptFile, target, "n");
    expect(fs.existsSync(path.join(target, "workspace"))).toBe(false);
  });
});
