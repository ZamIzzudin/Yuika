// @yuika/api, shared upload sanitizer: dipakai project uploads (FileTab)
// dan chat uploads (lampiran context di composer).
import path from "node:path";

export const MAX_UPLOAD = 10 * 1024 * 1024;

const OK_EXT = new Set([
  ".pdf", ".xlsx", ".xls", ".csv", ".md", ".txt", ".json",
  ".html", ".htm", ".xml", ".yaml", ".yml",
]);

/** D92: ekstensi gambar (canvas design assets) — hanya diizinkan bila
 *  pemanggil meminta mode image (kind=image). */
export const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

export function sanitizeUploadName(
  raw: string | undefined,
  opts?: { images?: boolean },
): { name: string } | { error: string } {
  const name = (raw ?? "").replace(/[\\/:*?"<>|]/g, "_").trim();
  if (!name || name.includes("..")) return { error: "invalid file name" };
  const ext = path.extname(name).toLowerCase();
  const ok = opts?.images ? IMAGE_EXT.has(ext) : OK_EXT.has(ext);
  if (!ok)
    return {
      error: opts?.images
        ? `unsupported image format ${ext || "?"} (allowed: png, jpg, jpeg, webp, gif, svg)`
        : `unsupported format ${ext || "?"} (allowed: pdf, xlsx, xls, csv, md, txt, json, html, yaml)`,
    };
  return { name };
}
