// dev-10: doc_read — scribe membaca dokumen user (xlsx → CSV, teks langsung,
// pdf via unpdf). PDF fixture minimal dibuat manual (Helvetica, satu baris).
import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
  // PDF minimal valid — objek font Helvetica + content stream Tj
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

describe("doc_read (dev-10)", () => {
  it("teks/csv dibaca langsung; xlsx → CSV dengan header sheets", async () => {
    fs.writeFileSync(path.join(dir, "data.csv"), "nama,qty\nkopi,2\nteh,1\n");
    const csv = await registry.dispatch("doc_read", { path: "data.csv" }, ctx());
    expect(csv.isError).toBeFalsy();
    if (!csv.isError) expect(JSON.stringify(csv.result)).toContain("kopi");

    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Bulan", "Omzet"], ["Jan", 150]]), "Ringkasan");
    // xlsx ≥0.19 ESM tidak lagi auto-bind fs — tulis via buffer (API yang dipakai prod: read(buffer)).
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
    fs.writeFileSync(path.join(dir, "file.docx"), Buffer.from("PK"));
    const res = await registry.dispatch("doc_read", { path: "file.docx" }, ctx());
    expect(res.isError).toBe(true);
    if (res.isError) expect(JSON.stringify(res.result)).toContain("belum didukung");
  });

  it("path keluar workspace ditolak", async () => {
    const res = await registry.dispatch("doc_read", { path: "../../rahasia.pdf" }, ctx());
    expect(res.isError).toBe(true);
  });
});
