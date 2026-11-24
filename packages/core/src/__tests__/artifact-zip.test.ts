// D122: artifact zip writer roundtrip - parse local headers, inflateRaw,
// bandingkan konten; plus walker (skip rules, nesting, binary).
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { buildZip, collectZipEntries, type ZipEntry } from "../project/zip.js";

let dir = "";

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-zip-"));
});
afterAll(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

/** Reader minimal: iterasi local file header (method 8), inflate, map nama→isi. */
function readZip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let i = 0;
  while (i + 4 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const method = buf.readUInt16LE(i + 8);
    const compSize = buf.readUInt32LE(i + 18);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString("utf8");
    const dataStart = i + 30 + nameLen + extraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    if (method !== 8) throw new Error(`method ${method} tidak didukung reader test`);
    out.set(name, inflateRawSync(comp));
    i = dataStart + compSize;
  }
  return out;
}

describe("artifact zip", () => {
  it("buildZip → roundtrip konten utuh (teks + binary + nama utf-8)", () => {
    const entries: ZipEntry[] = [
      { name: "a.txt", data: Buffer.from("hello artefact") },
      { name: "sub/laporan-final.md", data: Buffer.from("# Laporan\n\nOK") },
      { name: "bin/assets/logo.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 255]) },
      { name: "utf8/дерево-树.txt", data: Buffer.from("unicode") },
    ];
    const zip = buildZip(entries);
    // EOCD signature ada di ekor
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    const read = readZip(zip);
    expect(read.size).toBe(4);
    for (const e of entries) {
      expect(read.get(e.name)?.toString("utf8")).toBe(e.data.toString("utf8"));
    }
  });

  it("collectZipEntries: nested + skip node_modules/.git/hidden, urutan stabil", () => {
    fs.mkdirSync(path.join(dir, "code/app"), { recursive: true });
    fs.mkdirSync(path.join(dir, "node_modules/pkg"), { recursive: true });
    fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(dir, "code", "app", "main.ts"), "export {};");
    fs.writeFileSync(path.join(dir, "code", "notes.md"), "n");
    fs.writeFileSync(path.join(dir, "node_modules", "pkg", "x.js"), "skipme");
    fs.writeFileSync(path.join(dir, ".git", "HEAD"), "skipme");
    fs.writeFileSync(path.join(dir, ".env"), "skipme");
    const entries = collectZipEntries(dir);
    const names = entries.map((e) => e.name);
    expect(names).toContain("code/app/main.ts");
    expect(names).toContain("code/notes.md");
    expect(names.some((n) => n.includes("node_modules") || n.startsWith(".git") || n === ".env")).toBe(false);
    expect(names).toEqual([...names].sort()); // deterministik
  });

  it("kompresi benar-benar mengecil (teks repetitif)", () => {
    const big = Buffer.from("artifact line\n".repeat(5000));
    const zip = buildZip([{ name: "big.txt", data: big }]);
    expect(zip.length).toBeLessThan(big.length / 5);
    expect(readZip(zip).get("big.txt")?.length).toBe(big.length);
  });
});
