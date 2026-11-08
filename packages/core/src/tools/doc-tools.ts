// @yuika/core, doc_read (dev-10, scribe = persona dokumen): baca & terjemahkan
// file yang di-upload user ke teks yang bisa dipahami agent.
// Dukungan: teks (md/txt/csv/json/html/xml), PDF (unpdf), Excel (xlsx/xls → CSV
// per sheet). File lain (mis. docx) → pesan jelas, bukan error mentah.
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { registry } from "../registry.js";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const TEXT_EXT = new Set([".md", ".txt", ".csv", ".json", ".html", ".htm", ".xml", ".yaml", ".yml"]);

function safeResolve(workspace: string, rel: string): string {
  const root = path.resolve(workspace);
  const p = path.resolve(workspace, rel);
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error(`path keluar workspace: ${rel}`);
  return p;
}

const schema = z.object({
  path: z.string().min(1).describe("Path file di workspace (mis. uploads/laporan.pdf)"),
  sheet: z.string().optional().describe("Nama sheet Excel bila file .xlsx/.xls"),
  maxChars: z.number().int().min(1000).max(80_000).default(30_000),
});

async function pdfToText(buf: Buffer): Promise<string> {
  // unpdf: bundel pdf.js siap-pakai (server-side, tanpa canvas)
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return typeof text === "string" ? text : String(text);
}

async function xlsxToCsv(buf: Buffer, sheetName?: string): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer" });
  const name = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0]!;
  const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]!, { blankrows: false });
  const sheets = wb.SheetNames.join(", ");
  return `# sheets: ${sheets} (ditampilkan: ${name})\n${csv}`;
}

export function registerDocTools(): void {
  registry.register({
    name: "doc_read",
    description:
      "Baca file dokumen user (PDF/Excel/CSV/teks) dari workspace, khususnya folder uploads/, dan kembalikan isinya sebagai teks untuk dipahami/dirangkum/diterjemahkan. Untuk PDF/Excel hasilnya ekstraksi teks; file biner lain ditolak dengan pesan jelas.",
    parameters: schema,
    handler: async (args, ctx) => {
      const p = safeResolve(ctx.workspacePath, args.path);
      const st = await fs.stat(p);
      if (st.size > MAX_BYTES) {
        return { result: { error: `file terlalu besar (${Math.round(st.size / 1024 / 1024)} MB > 10 MB), minta user versi lebih kecil` }, isError: true };
      }
      const ext = path.extname(args.path).toLowerCase();
      const buf = await fs.readFile(p);
      let text: string;
      try {
        if (TEXT_EXT.has(ext) || ext === "") text = buf.toString("utf-8");
        else if (ext === ".pdf") text = await pdfToText(buf);
        else if (ext === ".xlsx" || ext === ".xls") text = await xlsxToCsv(buf, args.sheet);
        else
          return {
            result: { error: `format .${ext.slice(1) || "?"} belum didukung doc_read (dukung: pdf, xlsx/xls, csv, md, txt, json, html), minta user ekspor ke salah satu format itu` },
            isError: true,
          };
      } catch (e) {
        return { result: { error: `gagal mengekstrak ${args.path}: ${e instanceof Error ? e.message : String(e)}` }, isError: true };
      }
      const truncated = text.length > args.maxChars;
      return {
        result: {
          path: args.path,
          format: ext.slice(1) || "teks",
          totalChars: text.length,
          nextOffset: truncated ? args.maxChars : null,
          content: truncated ? text.slice(0, args.maxChars) : text,
          note: truncated ? "terpotong, bila perlu lanjutan, minta offset (v1) atau minta bagian spesifik" : undefined,
        },
      };
    },
  });
}
