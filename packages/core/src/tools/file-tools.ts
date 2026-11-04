// @yui/core — file tools (contoh pola: zod schema → registry.register).
// Path safety: semua path di-resolve di dalam workspace (PLAN §4.11).
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { registry } from "../registry.js";
import { redactSecrets } from "../redact.js";

function safeResolve(workspace: string, rel: string): string {
  const root = path.resolve(workspace);
  const p = path.resolve(workspace, rel);
  // Bandingkan dengan separator — `D:\ws` tidak boleh meloloskan `D:\ws-evil`.
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error(`path keluar workspace: ${rel}`);
  return p;
}

const readSchema = z.object({
  path: z.string().min(1),
  /** Paging karakter (fix "tail-mockup": dulu file >40k char terpotong tanpa
   *  offset — agent sampai menulis script node untuk membaca ekor file). */
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(40_000).default(40_000),
});
const searchSchema = z.object({
  query: z.string().min(2).max(200),
  dir: z.string().default("."),
  glob: z.string().default("*"),
});
const writeSchema = z.object({ path: z.string().min(1), content: z.string() });

/** Ekstensi artefak KODE — wajib mendarat di code/, bukan reports/ (routing otomatis). */
const CODE_EXT = new Set([
  ".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".py",
  ".vue", ".svelte", ".php", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
  ".c", ".cpp", ".h", ".hpp", ".sh", ".sql",
]);
const listSchema = z.object({ dir: z.string().default(".") });

export function registerFileTools(revisions?: import("../project/revisions.js").FileRevisionStore): void {
  registry.register({
    name: "read_file",
    description:
      "Baca isi file teks di workspace (relative path). File panjang: respons memuat `totalChars` + `nextOffset` — bila terpotong, lanjutkan dengan offset itu (JANGAN menulis script node untuk membaca bagian file).",
    parameters: readSchema,
    handler: async (args: z.infer<typeof readSchema>, ctx) => {
      const p = safeResolve(ctx.workspacePath, args.path);
      const content = await fs.readFile(p, "utf-8");
      const slice = content.slice(args.offset, args.offset + args.limit);
      return {
        result: {
          path: args.path,
          offset: args.offset,
          totalChars: content.length,
          nextOffset: args.offset + slice.length < content.length ? args.offset + slice.length : null,
          content: redactSecrets(slice), // P0-SEC-2: kunci/token di file tidak masuk konteks agent
        },
      };
    },
  });

  registry.register({
    name: "write_file",
    description:
      "Tulis file di workspace (relative path). Buat direktori bila perlu. File kode (.html/.css/.js/.ts/dll) yang ditulis di reports/ otomatis dipindahkan ke code/.",
    parameters: writeSchema,
    handler: async (args: z.infer<typeof writeSchema>, ctx) => {
      // Routing jenis artefak (fix test user: landing page .html mendarat di reports/):
      // ekstensi kode di bawah reports/ → code/<rel>; hasil balikkan path asli agar
      // agent tahu lokasi final dan tidak bingung di tool-call berikutnya.
      const requested = args.path.replace(/\\/g, "/");
      let target = requested;
      if (requested.startsWith("reports/") && CODE_EXT.has(path.posix.extname(requested).toLowerCase())) {
        target = `code/${requested.slice("reports/".length)}`;
      }
      const p = safeResolve(ctx.workspacePath, target);
      await fs.mkdir(path.dirname(p), { recursive: true });
      // P2-STU-3: snapshot isi LAMA sebelum ditimpa → tab File bisa menampilkan diff.
      if (revisions) {
        try {
          const old = await fs.readFile(p, "utf-8");
          if (old !== args.content) revisions.saveRevision(p, old);
        } catch {
          /* file baru — tidak ada revisi */
        }
      }
      await fs.writeFile(p, args.content, "utf-8");
      return {
        result: {
          path: target,
          bytes: args.content.length,
          ...(target !== requested ? { redirectedFrom: requested, note: `file kode dipindahkan ke ${target} — folder reports/ khusus laporan/markdown` } : {}),
        },
      };
    },
    // Policy P1: direktori kerja standar (code/docs/reports) bebas-approval;
    // di luar itu (root, config, dst.) tetap minta persetujuan.
    approvalPolicy: (args: z.infer<typeof writeSchema>) => {
      const rel = args.path.replace(/\\/g, "/");
      const ok = ["code/", "docs/", "reports/"].some((p) => rel.startsWith(p));
      return ok ? null : `Menulis file di luar code|docs|reports (${rel.split("/")[0] ?? "root"})`;
    },
  });

  registry.register({
    name: "search_files",
    description:
      "Cari teks di seluruh file workspace (seperti grep) — kembalikan file:baris + potongan baris. Jauh lebih cepat daripada read_file satu-satu untuk menemukan bagian di file besar.",
    parameters: searchSchema,
    handler: async (args: z.infer<typeof searchSchema>, ctx) => {
      const root = safeResolve(ctx.workspacePath, args.dir);
      const needle = args.query.toLowerCase();
      const hits: { path: string; line: number; text: string }[] = [];
      const skip = new Set([".git", "node_modules", ".next", "__pycache__"]);
      const walk = async (d: string): Promise<void> => {
        if (hits.length >= 100) return;
        const entries = await fs.readdir(d, { withFileTypes: true });
        for (const e of entries) {
          if (hits.length >= 100) return;
          if (e.name.startsWith(".") || (e.isDirectory() && skip.has(e.name))) continue;
          const abs = path.join(d, e.name);
          if (e.isDirectory()) {
            await walk(abs);
            continue;
          }
          // glob sederhana: hanya cocokkan akhiran (mis. "*.html")
          if (args.glob !== "*" && !e.name.toLowerCase().endsWith(args.glob.replace(/^\*\./, "."))) continue;
          let text: string;
          try {
            const buf = await fs.readFile(abs);
            if (buf.length > 512 * 1024) continue;
            text = buf.toString("utf-8");
          } catch {
            continue;
          }
          if (text.includes("\u0000")) continue; // biner
          const lines = text.split(/\r?\n/);
          for (let i = 0; i < lines.length && hits.length < 100; i++) {
            if (lines[i]!.toLowerCase().includes(needle)) {
              hits.push({ path: path.relative(ctx.workspacePath, abs).split(path.sep).join("/"), line: i + 1, text: redactSecrets(lines[i]!.trim().slice(0, 160)) }); // P0-SEC-2
            }
          }
        }
      };
      await walk(root);
      return {
        result: {
          hits,
          note: hits.length ? `${hits.length} baris cocok (maks 100) — buka konteks sekitarnya dengan read_file` : "tidak ada yang cocok",
        },
      };
    },
  });

  registry.register({
    name: "list_files",
    description: "Daftar file & direktori (satu level) di dalam workspace.",
    parameters: listSchema,
    handler: async (args: z.infer<typeof listSchema>, ctx) => {
      const p = safeResolve(ctx.workspacePath, args.dir);
      const entries = await fs.readdir(p, { withFileTypes: true });
      return {
        result: {
          dir: args.dir,
          entries: entries.slice(0, 200).map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" })),
        },
      };
    },
  });
}
