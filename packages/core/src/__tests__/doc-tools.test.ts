// dev-10 + D78: doc_read (xlsx → CSV, teks langsung, pdf via unpdf,
// docx → Markdown zero-dep: heading + tabel + entity + paging offset).
// PDF fixture minimal dibuat manual; docx dibangun via ZIP writer mini
// (deflate = persis output Word, stored = jalur alternatif).
import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { registry, resetRegistryForTests } from "../registry.js";
import { registerDocTools } from "../tools/doc-tools.js";

let dir: string;
const ctx = () => ({ sessionId: "s", turnId: "t", workspacePath: dir, emit: () => {}, requestApproval: async () => true });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-doc-"));
  resetRegistryForTests();
  registerDocTools();
});

function pdfFixture(text: string): Buffer {
  // PDF minimal valid, objek font Helvetica + content stream Tj
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

// ── ZIP writer mini (untuk fixture docx; bukan kode prod) ───────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : (c >>> 1) >>> 0;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ buf[i]!)!]! ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

function zipFiles(entries: Array<{ name: string; data: Buffer; method?: 0 | 8 }>): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const method = e.method ?? 8;
    const data = method === 8 ? zlib.deflateRawSync(e.data) : e.data;
    const nameB = Buffer.from(e.name, "utf-8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(e.data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameB.length, 26);
    chunks.push(local, nameB, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt32LE(crc32(e.data), 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(e.data.length, 24);
    cen.writeUInt16LE(nameB.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cd, eocd]);
}

function docxFixture(bodyXml: string, method: 0 | 8 = 8): Buffer {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`;
  return zipFiles([
    { name: "[Content_Types].xml", data: Buffer.from("<Types/>"), method: 0 },
    { name: "word/document.xml", data: Buffer.from(xml, "utf-8"), method },
  ]);
}

const P = (text: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const TBL = (rows: string[][]) =>
  `<w:tbl>${rows
    .map((r) => `<w:tr>${r.map((c) => `<w:tc><w:tcPr/><w:p><w:r><w:t>${c}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`)
    .join("")}</w:tbl>`;

describe("doc_read (dev-10)", () => {
  it("teks/csv dibaca langsung; xlsx → CSV dengan header sheets", async () => {
    fs.writeFileSync(path.join(dir, "data.csv"), "nama,qty\nkopi,2\nteh,1\n");
    const csv = await registry.dispatch("doc_read", { path: "data.csv" }, ctx());
    expect(csv.isError).toBeFalsy();
    if (!csv.isError) expect(JSON.stringify(csv.result)).toContain("kopi");

    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Bulan", "Omzet"], ["Jan", 150]]), "Ringkasan");
    // xlsx ≥0.19 ESM tidak lagi auto-bind fs, tulis via buffer (API yang dipakai prod: read(buffer)).
    fs.writeFileSync(path.join(dir, "laporan.xlsx"), XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    const x = await registry.dispatch("doc_read", { path: "laporan.xlsx" }, ctx());
    expect(x.isError).toBeFalsy();
    if (!x.isError) {
      const r = JSON.stringify(x.result);
      expect(r).toContain("Ringkasan");
      expect(r).toContain("Omzet");
      expect(r).toContain("150");
    }
  });

  it("pdf → teks terekstrak", async () => {
    fs.writeFileSync(path.join(dir, "dok.pdf"), pdfFixture("Hello Dokumen Seruni"));
    const res = await registry.dispatch("doc_read", { path: "dok.pdf" }, ctx());
    expect(res.isError).toBeFalsy();
    if (!res.isError) expect(JSON.stringify(res.result)).toContain("Hello Dokumen");
  });

  it("ekstensi tak didukung → pesan jelas (bukan error mentah)", async () => {
    fs.writeFileSync(path.join(dir, "decks.pptx"), Buffer.from("PK"));
    const res = await registry.dispatch("doc_read", { path: "decks.pptx" }, ctx());
    expect(res.isError).toBe(true);
    if (res.isError) expect(JSON.stringify(res.result)).toContain("belum didukung");
  });

  it("path keluar workspace ditolak", async () => {
    const res = await registry.dispatch("doc_read", { path: "../../rahasia.pdf" }, ctx());
    expect(res.isError).toBe(true);
  });
});

describe("doc_read docx (D78: Scribe dokumen v1)", () => {
  it("paragraf + heading + entity di-decode; jalur deflate", async () => {
    fs.writeFileSync(
      path.join(dir, "laporan.docx"),
      docxFixture(P("Judul Laporan", "Heading1") + P("Harga &amp; syarat &#8804; batas") + P("Body biasa", "Title")),
    );
    const res = await registry.dispatch("doc_read", { path: "laporan.docx" }, ctx());
    expect(res.isError).toBeFalsy();
    if (!res.isError) {
      const r = res.result as { content: string; format: string };
      expect(r.format).toBe("docx");
      expect(r.content).toContain("# Judul Laporan");
      expect(r.content).toContain("Harga & syarat ≤ batas");
      expect(r.content).toContain("# Body biasa"); // Title → #
    }
  });

  it("tabel → Markdown pipe table (header + separator + escape pipe)", async () => {
    fs.writeFileSync(
      path.join(dir, "tabel.docx"),
      docxFixture(TBL([["Fitur", "Status"], ["Push", "aktif"], ["a|b", "ok"]])),
    );
    const res = await registry.dispatch("doc_read", { path: "tabel.docx" }, ctx());
    expect(res.isError).toBeFalsy();
    if (!res.isError) {
      const r = res.result as { content: string };
      const lines = r.content.split("\n");
      expect(lines[0]).toBe("| Fitur | Status |");
      expect(lines[1]).toBe("| --- | --- |");
      expect(lines[2]).toBe("| Push | aktif |");
      expect(lines[3]).toBe("| a\\|b | ok |"); // pipe di dalam sel di-escape
    }
  });

  it("jalur stored (method 0) juga terbaca", async () => {
    fs.writeFileSync(path.join(dir, "stored.docx"), docxFixture(P("tanpa kompresi"), 0));
    const res = await registry.dispatch("doc_read", { path: "stored.docx" }, ctx());
    expect(res.isError).toBeFalsy();
    if (!res.isError) expect((res.result as { content: string }).content).toContain("tanpa kompresi");
  });

  it("paging offset: nextOffset menuntun baca per blok sampai null", async () => {
    // paragraf 3.500 karakter, maxChars 1000 → 4 halaman (1000/1000/1000/500)
    const big = "x".repeat(3500);
    fs.writeFileSync(path.join(dir, "besar.docx"), docxFixture(P(big)));
    type R = { totalChars: number; nextOffset: number | null; content: string };
    const read = async (offset: number): Promise<R> => {
      const res = await registry.dispatch("doc_read", { path: "besar.docx", offset, maxChars: 1000 }, ctx());
      if (res.isError) throw new Error(JSON.stringify(res.result));
      return res.result as R;
    };
    const p1 = await read(0);
    expect(p1.totalChars).toBe(3500);
    expect(p1.nextOffset).toBe(1000);
    expect(p1.content.length).toBe(1000);
    const p2 = await read(p1.nextOffset!);
    expect(p2.nextOffset).toBe(2000);
    const p3 = await read(p2.nextOffset!);
    expect(p3.nextOffset).toBe(3000);
    const p4 = await read(p3.nextOffset!);
    expect(p4.content.length).toBe(500);
    expect(p4.nextOffset).toBeNull(); // habis
  });

  it("paging berlaku juga untuk teks biasa (offset tercantum di hasil)", async () => {
    fs.writeFileSync(path.join(dir, "panjang.txt"), "y".repeat(2500));
    const res = await registry.dispatch("doc_read", { path: "panjang.txt", offset: 2000, maxChars: 1000 }, ctx());
    expect(res.isError).toBeFalsy();
    if (!res.isError) {
      const r = res.result as { offset: number; content: string; nextOffset: number | null };
      expect(r.offset).toBe(2000);
      expect(r.content.length).toBe(500);
      expect(r.nextOffset).toBeNull();
    }
  });

  it("offset melebihi panjang → pesan jelas", async () => {
    fs.writeFileSync(path.join(dir, "kecil.docx"), docxFixture(P("pendek")));
    const res = await registry.dispatch("doc_read", { path: "kecil.docx", offset: 99999 }, ctx());
    expect(res.isError).toBe(true);
    if (res.isError) expect(JSON.stringify(res.result)).toContain("melebihi panjang");
  });

  it("docx rusak (bukan ZIP utuh) → pesan jelas, bukan crash", async () => {
    fs.writeFileSync(path.join(dir, "rusak.docx"), Buffer.from("PK"));
    const res = await registry.dispatch("doc_read", { path: "rusak.docx" }, ctx());
    expect(res.isError).toBe(true);
    if (res.isError) expect(JSON.stringify(res.result)).toContain("gagal mengekstrak");
  });
});
