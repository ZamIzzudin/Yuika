// @yuika/api, .env boot loader .
// Next.js dulu memuat .env root via next.config.ts loadRootEnv(); proses api
// adalah Node biasa → muat DI SINI, sebelum modul @yuika/core dievaluasi (env.ts
// divalidasi zod saat import, fail-fast). Set hanya jika belum ada di proses.
import fs from "node:fs";
import path from "node:path";

export function loadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 5 && !fs.existsSync(path.join(dir, "turbo.json")); i++) dir = path.dirname(dir);
  const file = path.join(dir, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]!] === undefined) process.env[m[1]!] = v;
  }
}

loadRootEnv();
