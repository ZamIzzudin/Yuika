// @yui/core — .env updater (Settings): ganti/tambah KEY=VALUE dengan
// mempertahankan baris & komentar lain. Fail-safe: file hilang → buat baru.
import fs from "node:fs";

/** Update .env: replace KEY=… bila ada (pertama), else append. Return isi baru. */
export function updateEnvFile(file: string, values: Record<string, string>): string {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf-8").split(/\r?\n/) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && m[1]! in values) {
      const key = m[1]!;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(`${key}=${values[key]!}`);
      }
      // duplikat key lama di-skip (hanya yang pertama dipertahankan)
    } else {
      out.push(line);
    }
  }
  for (const [k, v] of Object.entries(values)) {
    if (!seen.has(k)) out.push(`${k}=${v}`);
  }
  const content = out.join("\n").replace(/\n{3,}$/, "\n");
  fs.writeFileSync(file, content, "utf-8");
  return content;
}
