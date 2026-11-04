// P1-MEM-6: memory per-domain persona — file terpisah per domain (lintas
// project, milik persona), di-inject ke system prompt saat sesi DIBUAT
// (frozen), tool memory_append scope "domain" menulis ke file domain
// persona PEMANGGIL (bukan sembarang domain).
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendCurated,
  DOMAIN_HEADER,
  memoryPath,
  memoryPromptSection,
  readMemory,
} from "../memory/manager.js";

let ws: string;
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-mem6-"));
  ws = path.join(dir, "ws");
  fs.mkdirSync(ws, { recursive: true });
});
afterEach(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* lenient */
  }
});

describe("memory per-domain (P1-MEM-6)", () => {
  it("file domain terpisah dari USER.md; slug aman dari nama aneh", () => {
    expect(memoryPath(ws, "domain", null, "Research & Analisis!")).toBe(
      path.join(ws, "memory", "domains", "research-analisis.md"),
    );
    expect(memoryPath(ws, "user")).toBe(path.join(ws, "USER.md"));
  });

  it("appendCurated scope domain → catatan mendarat di file domain persona", () => {
    expect(appendCurated(ws, "domain", "user suka sitasi format APA", "Einstein Yui", null, "research")).toBe(true);
    const content = readMemory(ws, "domain", null, "", "research");
    expect(content).toContain("Einstein Yui: user suka sitasi format APA");
    // dedupe lintas waktu
    expect(appendCurated(ws, "domain", "user suka sitasi format APA", "Einstein Yui", null, "research")).toBe(false);
    // domain lain tidak tercemar
    expect(readMemory(ws, "domain", null, "", "orchestration")).not.toContain("APA");
  });

  it("memoryPromptSection menyuntikkan domain + tetap frozen-ish (dipanggil sekali per sesi)", () => {
    appendCurated(ws, "user", "jawab singkat", "Maestro Yui");
    appendCurated(ws, "domain", "user suka tabel perbandingan biaya", "Sherlock Yui", null, "analysis");
    const section = memoryPromptSection(ws, null, "analysis");
    expect(section).toContain("jawab singkat");
    expect(section).toContain('Memori bidang kamu: "analysis"');
    expect(section).toContain("user suka tabel perbandingan biaya");
    // tanpa domain → bagian domain tidak muncul
    expect(memoryPromptSection(ws, null, null)).not.toContain("Memori bidang");
  });

  it("DOMAIN_HEADER memandu user bahwa file miliknya & lintas project", () => {
    expect(DOMAIN_HEADER("planning")).toContain("lintas project");
    expect(DOMAIN_HEADER("planning")).toContain("milik user");
  });
});
