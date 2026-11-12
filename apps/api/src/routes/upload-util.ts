// @yuika/api, shared upload sanitizer: dipakai project uploads (FileTab)
// dan chat uploads (lampiran context di composer).
import path from "node:path";

export const MAX_UPLOAD = 10 * 1024 * 1024;

const OK_EXT = new Set([
  ".pdf", ".xlsx", ".xls", ".csv", ".md", ".txt", ".json",
  ".html", ".htm", ".xml", ".yaml", ".yml",
]);

export function sanitizeUploadName(
  raw: string | undefined,
): { name: string } | { error: string } {
  const name = (raw ?? "").replace(/[\\/:*?"<>|]/g, "_").trim();
  if (!name || name.includes("..")) return { error: "invalid file name" };
  const ext = path.extname(name).toLowerCase();
  if (!OK_EXT.has(ext))
    return {
      error: `unsupported format ${ext || "?"} (allowed: pdf, xlsx, xls, csv, md, txt, json, html, yaml)`,
    };
  return { name };
}
