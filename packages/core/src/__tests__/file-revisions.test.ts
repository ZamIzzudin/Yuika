import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { diffLines, diffStat } from "../project/diff.js";
import { FileRevisionStore } from "../project/revisions.js";
import { resetRegistryForTests } from "../registry.js";
import { registerFileTools } from "../tools/file-tools.js";

let dir: string;

describe("diffLines (P2-STU-3)", () => {
  it("deteksi tambah/hapus/tetap dengan LCS", () => {
    const ops = diffLines("a\nb\nc", "a\nx\nc\nd");
    expect(ops).toEqual([
      { t: "=", line: "a" },
      { t: "-", line: "b" },
      { t: "+", line: "x" },
      { t: "=", line: "c" },
      { t: "+", line: "d" },
    ]);
    expect(diffStat(ops)).toEqual({ added: 2, removed: 1 });
  });

  it("identik → semua '='; file baru → semua '+'", () => {
    expect(diffLines("x\ny", "x\ny").every((o) => o.t === "=")).toBe(true);
    expect(diffLines("", "baru").every((o) => o.t === "+")).toBe(true);
  });
});

describe("FileRevisionStore + write_file (P2-STU-3)", () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-rev-"));
  });

  it("write_file menimpa → revisi lama terekam; file baru tanpa revisi", async () => {
    resetRegistryForTests();
    const store = new FileRevisionStore(path.join(dir, "rev.db"));
    registerFileTools(store);
    const { registry } = await import("../registry.js");
    const ctx = { sessionId: "s", turnId: "t", workspacePath: dir, emit: () => {}, requestApproval: async () => true };
    await registry.dispatch("write_file", { path: "code/a.md", content: "v1" }, ctx);
    expect(store.listRevisions(path.join(dir, "code", "a.md"))).toHaveLength(0); // file baru
    await registry.dispatch("write_file", { path: "code/a.md", content: "v2 — berubah" }, ctx);
    await registry.dispatch("write_file", { path: "code/a.md", content: "v3" }, ctx);
    const revs = store.listRevisions(path.join(dir, "code", "a.md"));
    expect(revs).toHaveLength(2);
    expect(revs[0]!.rev).toBeGreaterThan(revs[1]!.rev); // terbaru dulu
    expect(store.getRevision(path.join(dir, "code", "a.md"), revs[1]!.rev)).toBe("v1");
    expect(store.getRevision(path.join(dir, "code", "a.md"), revs[0]!.rev)).toBe("v2 — berubah");
    store.close();
  });

  it("isi sama (no-op) tidak menambah revisi", async () => {
    resetRegistryForTests();
    const store = new FileRevisionStore(path.join(dir, "rev.db"));
    registerFileTools(store);
    const { registry } = await import("../registry.js");
    const ctx = { sessionId: "s", turnId: "t", workspacePath: dir, emit: () => {}, requestApproval: async () => true };
    await registry.dispatch("write_file", { path: "code/b.md", content: "sama" }, ctx);
    await registry.dispatch("write_file", { path: "code/b.md", content: "sama" }, ctx);
    expect(store.listRevisions(path.join(dir, "code", "b.md"))).toHaveLength(0);
    store.close();
  });

  it("cap 20 revisi per file", () => {
    const store = new FileRevisionStore(path.join(dir, "rev.db"));
    const p = path.join(dir, "x.md");
    for (let i = 0; i < 25; i++) store.saveRevision(p, `v${i}`);
    expect(store.listRevisions(p)).toHaveLength(20);
    store.close();
  });
});
