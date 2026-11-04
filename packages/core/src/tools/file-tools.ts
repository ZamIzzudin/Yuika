// @yui/core — file tools (contoh pola: zod schema → registry.register).
// Path safety: semua path di-resolve di dalam workspace (PLAN §4.11).
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { registry } from "../registry.js";

function safeResolve(workspace: string, rel: string): string {
  const root = path.resolve(workspace);
  const p = path.resolve(workspace, rel);
  // Bandingkan dengan separator — `D:\ws` tidak boleh meloloskan `D:\ws-evil`.
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error(`path keluar workspace: ${rel}`);
  return p;
}

const readSchema = z.object({ path: z.string().min(1) });
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
    description: "Baca isi file teks di workspace (relative path).",
    parameters: readSchema,
    handler: async (args: z.infer<typeof readSchema>, ctx) => {
      const p = safeResolve(ctx.workspacePath, args.path);
      const content = await fs.readFile(p, "utf-8");
      return { result: { path: args.path, content: content.slice(0, 40_000) } };
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
