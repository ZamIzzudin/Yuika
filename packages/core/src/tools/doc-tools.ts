// @yuika/core, doc_read (dev-10 + D78, scribe = persona dokumen): baca &
// terjemahkan file yang di-upload user ke teks yang bisa dipahami agent.
// Dukungan: teks (md/txt/csv/json/html/xml/yaml), PDF (unpdf), Excel
// (xlsx/xls → CSV per sheet), Word docx (D78: zero-dep — ZIP + document.xml
// → Markdown, heading + tabel). Paging via `offset` (nextOffset di hasil).
// File lain (mis. ppt) → pesan jelas, bukan error mentah.
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
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
  offset: z.number().int().min(0).default(0).describe("Posisi mulai baca (karakter); lanjutkan dari nextOffset hasil sebelumnya"),
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

// ── D78: docx → Markdown, zero-dep (ZIP + word/document.xml) ────────────────

/** Ambil satu entri dari ZIP (cukup untuk docx; tanpa zip64). */
function zipEntry(buf: Buffer, name: string): Buffer {
  let eocd = -1;
  const scanFrom = Math.max(0, buf.length - 22 - 65536);
  for (let i = buf.length - 22; i >= scanFrom; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("struktur ZIP tidak ditemukan (file docx rusak?)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // offset central directory
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) {
      throw new Error("central directory ZIP rusak");
    }
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const entryName = buf.subarray(p + 46, p + 46 + nameLen).toString("utf-8");
    if (entryName === name) {
      if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error("local header ZIP rusak");
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(dataStart, dataStart + compSize);
      if (method === 0) return Buffer.from(data); // stored
      if (method === 8) return zlib.inflateRawSync(data); // deflate
      throw new Error(`kompresi ZIP tidak didukung (method ${method})`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`entri ZIP tidak ditemukan: ${name}`);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&"); // &amp; terakhir agar tidak double-unescape
}

/** Elemen lengkap tag berikutnya (self-closing & nested same-tag aman). */
function readElement(xml: string, tag: string, from: number): { start: number; end: number } | null {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  const start = xml.indexOf(open, from);
  if (start < 0) return null;
  const after = xml[start + open.length];
  if (after !== undefined && after !== " " && after !== ">" && after !== "/") {
    return readElement(xml, tag, start + open.length); // prefix lain (mis. w:pt di tag w:p)
  }
  const gt = xml.indexOf(">", start);
  if (gt < 0) return null;
  if (xml[gt - 1] === "/") return { start, end: gt + 1 }; // <w:p/>
  let depth = 1;
  let i = gt + 1;
  while (depth > 0) {
    const no = xml.indexOf(open, i);
    const nc = xml.indexOf(close, i);
    if (nc < 0) return null;
    if (no >= 0 && no < nc) {
      const a = xml[no + open.length];
      if (a === " " || a === ">" || a === "/") depth++;
      i = no + open.length;
    } else {
      depth--;
      i = nc + close.length;
    }
  }
  return { start, end: i };
}

function runsText(xml: string): string {
  const s = xml
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, "\n");
  const parts: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) parts.push(decodeEntities(m[1]!));
  return parts.join("");
}

function paraToMarkdown(pXml: string): string {
  const text = runsText(pXml).trim();
  if (!text) return "";
  const style = /<w:pStyle\s+w:val="([^"]+)"/.exec(pXml)?.[1] ?? "";
  const h = /^Heading([1-6])$/.exec(style);
  const prefix = h ? `${"#".repeat(Number(h[1]))} ` : style === "Title" ? "# " : "";
  return prefix + text;
}

/** Semua w:p dalam fragment xml (dipakai badan dokumen & sel tabel). */
function paras(xml: string): string[] {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const el = readElement(xml, "w:p", i);
    if (!el) break;
    const line = paraToMarkdown(xml.slice(el.start, el.end));
    if (line) out.push(line);
    i = el.end;
  }
  return out;
}

/** w:tbl → tabel Markdown (baris pertama = header, sel di-escape pipe). */
function tableToMarkdown(tblXml: string): string {
  const rows: string[][] = [];
  let i = 0;
  for (;;) {
    const el = readElement(tblXml, "w:tr", i);
    if (!el) break;
    const rowXml = tblXml.slice(el.start, el.end);
    const cells: string[] = [];
    let j = 0;
    for (;;) {
      const c = readElement(rowXml, "w:tc", j);
      if (!c) break;
      cells.push(paras(rowXml.slice(c.start, c.end)).join(" ").replace(/\|/g, "\\|").trim());
      j = c.end;
    }
    if (cells.length) rows.push(cells);
    i = el.end;
  }
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const norm = rows.map((r) => {
    const c = [...r];
    while (c.length < width) c.push("");
    return c;
  });
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [line(norm[0]!), `| ${norm[0]!.map(() => "---").join(" | ")} |`, ...norm.slice(1).map(line)].join("\n");
}

function docxToMarkdown(buf: Buffer): string {
  const xml = zipEntry(buf, "word/document.xml").toString("utf-8");
  const bodyStart = xml.indexOf("<w:body>");
  const bodyEnd = xml.lastIndexOf("</w:body>");
  if (bodyStart < 0 || bodyEnd < 0) throw new Error("word/document.xml tanpa w:body (bukan docx Word?)");
  const out: string[] = [];
  let i = bodyStart + "<w:body>".length;
  while (i < bodyEnd) {
    const next = xml.indexOf("<", i);
    if (next < 0 || next >= bodyEnd) break;
    if (xml.startsWith("<w:tbl", next) && xml[next + 6] !== undefined && " >/".includes(xml[next + 6]!)) {
      const el = readElement(xml, "w:tbl", next);
      if (!el) break;
      const t = tableToMarkdown(xml.slice(el.start, el.end));
      if (t) out.push(t);
      i = el.end;
    } else if (xml.startsWith("<w:p", next) && xml[next + 4] !== undefined && " >/".includes(xml[next + 4]!)) {
      const el = readElement(xml, "w:p", next);
      if (!el) break;
      const line = paraToMarkdown(xml.slice(el.start, el.end));
      if (line) out.push(line);
      i = el.end;
    } else {
      i = next + 1;
    }
  }
  return out.join("\n\n");
}

export function registerDocTools(): void {
  registry.register({
    name: "doc_read",
    description:
      "Baca file dokumen user (PDF/Excel/Word docx/CSV/teks) dari workspace, khususnya folder uploads/, dan kembalikan isinya sebagai teks untuk dipahami/dirangkum/diterjemahkan. PDF/Excel/docx = ekstraksi teks (docx: heading + tabel → Markdown). Hasil panjang terpotong: lanjutkan dengan offset = nextOffset.",
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
        else if (ext === ".docx") text = docxToMarkdown(buf);
        else
          return {
            result: { error: `format .${ext.slice(1) || "?"} belum didukung doc_read (dukung: pdf, docx, xlsx/xls, csv, md, txt, json, html), minta user ekspor ke salah satu format itu` },
            isError: true,
          };
      } catch (e) {
        return { result: { error: `gagal mengekstrak ${args.path}: ${e instanceof Error ? e.message : String(e)}` }, isError: true };
      }
      if (args.offset > text.length) {
        return {
          result: { error: `offset ${args.offset} melebihi panjang dokumen (${text.length} karakter); mulai dari 0 atau nextOffset terakhir` },
          isError: true,
        };
      }
      const end = Math.min(args.offset + args.maxChars, text.length);
      const content = text.slice(args.offset, end);
      const nextOffset = end < text.length ? end : null;
      return {
        result: {
          path: args.path,
          format: ext.slice(1) || "teks",
          totalChars: text.length,
          offset: args.offset,
          nextOffset,
          content,
          note: nextOffset !== null ? `terpotong di karakter ${end}/${text.length}; panggil doc_read lagi dengan offset=${nextOffset}` : undefined,
        },
      };
    },
  });
}
