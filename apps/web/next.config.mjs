import fs from "node:fs";
import path from "node:path";

// DX: Next.js hanya meload .env dari apps/web/, sementara .env.example ada di root.
// Forward .env repo root (tanpa dependency): set hanya jika belum ada, sehingga
// apps/web/.env tetap menang jika dipakai.
function loadRootEnv() {
  let dir = process.cwd();
  for (let i = 0; i < 4 && !fs.existsSync(path.join(dir, "turbo.json")); i++) dir = path.dirname(dir);
  const file = path.join(dir, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadRootEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker (P0-INF-5): standalone saat build image, bundle minimal tanpa devDeps;
  // lokal & CI tetap default (next dev/start biasa).
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
  // distDir bisa dipisah (NEXT_DIST_DIR=.next-pi) agar verifikasi/CI paralel
  // TIDAK menghapus cache dev server yang sedang berjalan (kejadian 2026-11:
  // rm -rf .next saat server hidup -> _document.js ENOENT, semua route 500).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@yuika/contracts", "@yuika/core", "@yuika/crypto", "@yuika/relay-client"],
  serverExternalPackages: ["better-sqlite3"],
  // Workspace packages pakai specifier ESM TS ("./foo.js" → foo.ts); webpack butuh
  // extensionAlias agar bisa resolve ke sumber .ts, standar untuk monorepo Next.js.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};
export default nextConfig;
