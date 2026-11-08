import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildFileTree, readProjectFile, safeProjectPath } from "../project/files.js";

let root: string;

describe("project files ( v0)", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "yui-files-"));
  });

  it("tree: folder dulu (AZ), file dotfile & node_modules disembunyikan", () => {
    fs.mkdirSync(path.join(root, "code"));
    fs.mkdirSync(path.join(root, ".git"));
    fs.mkdirSync(path.join(root, "node_modules")); // berkas anggota tidak dibuat, cukup foldernya
    fs.writeFileSync(path.join(root, "code", "a.html"), "<p>x</p>");
    fs.writeFileSync(path.join(root, "z.md"), "# z");
    const t = buildFileTree(root);
    expect(t.map((n) => n.name)).toEqual(["code", "z.md"]); // folder dulu, dotfile/nm hilang
    expect(t[0]!.children).toHaveLength(1);
  });

  it("safeProjectPath: traversal ditolak, path dalam diterima", () => {
    expect(() => safeProjectPath(root, "../escape.txt")).toThrow(/di luar project/);
    expect(() => safeProjectPath(root, "code/../../escape")).toThrow(/di luar project/);
    expect(safeProjectPath(root, "reports/x.md")).toBe(path.resolve(root, "reports/x.md"));
  });

  it("readProjectFile: isi utuh; >256 KB → truncated tanpa baca", () => {
    fs.writeFileSync(path.join(root, "a.md"), "isi");
    expect(readProjectFile(root, "a.md")).toEqual({ content: "isi", size: 3, truncated: false });
    fs.writeFileSync(path.join(root, "big.txt"), "x".repeat(256 * 1024 + 1));
    const r = readProjectFile(root, "big.txt");
    expect(r.truncated).toBe(true);
    expect(r.content).toBe("");
  });

  it("readProjectFile: direktori & file hilang → error jelas", () => {
    fs.mkdirSync(path.join(root, "d"));
    expect(() => readProjectFile(root, "d")).toThrow(/direktori/);
    expect(() => readProjectFile(root, "hilang.txt")).toThrow();
  });
});
