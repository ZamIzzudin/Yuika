import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendCurated, memoryPath, memoryPromptSection, readMemory, saveMemory } from "../memory/manager.js";

function tmpWs() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "yui-mem-"));
}

describe("memory manager (P1-MEM-1)", () => {
  it("readMemory membuat file dengan header bila belum ada (user & project terpisah)", () => {
    const ws = tmpWs();
    const user = readMemory(ws, "user");
    expect(user).toContain("# USER.md");
    const proj = readMemory(ws, "project", path.join(ws, "projects/p_1"), "Demo");
    expect(proj).toContain("Demo");
    expect(fs.existsSync(memoryPath(ws, "project", path.join(ws, "projects/p_1")))).toBe(true);
  });

  it("appendCurated menulis berformat; dedupe inti catatan sama (beda timestamp/persona) → skip", () => {
    const ws = tmpWs();
    expect(appendCurated(ws, "user", "jawaban ringkas, bahasa Indonesia", "Maestro Yui")).toBe(true);
    expect(appendCurated(ws, "user", "Jawaban ringkas, bahasa Indonesia", "Pierre Yui")).toBe(false); // dedupe
    expect(appendCurated(ws, "user", "selalu sertakan contoh kode", "Hiro Yui")).toBe(true);
    const content = readMemory(ws, "user");
    expect(content).toContain("- [");
    expect(content).toContain("Maestro Yui: jawaban ringkas, bahasa Indonesia");
    expect(content.match(/Pierre Yui/)).toBeNull(); // catatan dedupe tidak menulis ulang
  });

  it("saveMemory menimpa utuh (editor user) dan readMemory round-trip", () => {
    const ws = tmpWs();
    readMemory(ws, "user");
    saveMemory(ws, "user", "# USER.md\n\n- catatan editan user\n");
    expect(readMemory(ws, "user")).toBe("# USER.md\n\n- catatan editan user\n");
  });

  it("appendCurated kosong/note spasi → false; guard MAX tidak meledak", () => {
    const ws = tmpWs();
    expect(appendCurated(ws, "user", "   ", "Yui")).toBe(false);
  });

  it("memoryPromptSection: USER.md + MEMORY.md project masuk bagian prompt; kosong → string kosong", () => {
    const ws = tmpWs();
    expect(memoryPromptSection(ws)).toBe(""); // belum ada isi
    readMemory(ws, "user");
    appendCurated(ws, "user", "pakai bahasa Indonesia", "Yui");
    const projRoot = path.join(ws, "projects/p_1");
    readMemory(ws, "project", projRoot, "Demo");
    appendCurated(ws, "project", "stack: Next.js + SQLite", "Yui", projRoot);
    const section = memoryPromptSection(ws, projRoot);
    expect(section).toContain("USER.md");
    expect(section).toContain("pakai bahasa Indonesia");
    expect(section).toContain("MEMORY.md");
    expect(section).toContain("stack: Next.js + SQLite");
    expect(section).toContain("memory_append");
  });

  it("scope project tanpa projectRootPath → error jelas", () => {
    const ws = tmpWs();
    expect(() => memoryPath(ws, "project")).toThrow(/projectRootPath/);
  });
});
