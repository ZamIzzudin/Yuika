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
const listSchema = z.object({ dir: z.string().default(".") });

export function registerFileTools(): void {
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
    description: "Tulis file di workspace (relative path). Buat direktori bila perlu.",
    parameters: writeSchema,
    handler: async (args: z.infer<typeof writeSchema>, ctx) => {
      const p = safeResolve(ctx.workspacePath, args.path);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, args.content, "utf-8");
      return { result: { path: args.path, bytes: args.content.length } };
    },
    // Demo policy: tulis di luar reports/ minta approval (momen UX di skenario demo)
    approvalPolicy: (args: z.infer<typeof writeSchema>) =>
      !args.path.replace(/\\/g, "/").startsWith("reports/") ? "Menulis file di luar direktori reports/" : null,
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
