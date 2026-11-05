# Audit Lisensi & Pihak Ketiga — 2026-11

> Cakupan: 259 package npm (26 deps langsung) + aset non-npm (ikon, art, MCP server,
> skill, dokumen). Metode: enumerasi `license` field seluruh `node_modules` +
> `npm audit` + inspeksi file sumber non-npm. Kesimpulan singkat:
> **tidak ada lisensi copyleft kuat (GPL/AGPL/SSPL/NC) — aman jalur komersial,
> dengan 4 catatan di bawah.**

## 1. Deps langsung (26) — semua permissive

| Paket | Lisensi | Catatan |
|---|---|---|
| react, react-dom, next, tailwindcss, @tailwindcss/postcss | MIT | ✓ |
| @phosphor-icons/react | MIT | satu-satunya set ikon — benar |
| @rive-app/react-canvas | MIT | runtime Rive MIT (editor proprietary — tak relevan) |
| react-hot-toast, ajv, yaml, zod-to-json-schema, vitest, turbo, unpdf, better-sqlite3, @modelcontextprotocol/sdk | MIT/ISC | ✓ |
| openai, typescript | Apache-2.0 | ✓ (Apache = patent grant eksplisit, bagus) |
| xlsx@0.18.5 | Apache-2.0 | lisensi OK — **tapi ada CVE, lihat §4** |

## 2. Transitif — histogram

MIT 215 · Apache-2.0 18 · ISC 14 · BSD-3 4 · BSD-2 2 · 0BSD 2 ·
LGPL-3.0 2 · MPL-2.0 2 · CC-BY-4.0 1 · dual (MIT OR WTFPL) 1.
**Tidak ada GPL/AGPL/SSPL/Commons-Clause/NC.**

## 3. Catatan lisensi (bukan blocker)

1. **`@img/sharp-*` (LGPL-3.0, ditarik `next`)** — binari prebuilt libvips sebagai
   pustaka dinamis terpisah (`.dll`/`.wasm`). Interpretasi umum: **OK untuk produk
   closed-source** (linking dinamis). Wajib: cantumkan di THIRD-PARTY-NOTICES.
   Catatan khusus: varian `sharp-wasm32` menautkan libvips sebagai wasm — abu-abu
   secara teori linking, tapi proyek sharp menegaskan aman; hanya terpakai di
   environment tanpa binari native.
2. **`lightningcss` (MPL-2.0, ditarik tailwind v4)** — weak file-level copyleft.
   Kita pakai apa adanya (build tool, tak dimodifikasi) → **aman**. Jika suatu saat
   di-patch, kewajiban berbagi patch terbatas pada file MPL itu saja.
3. **`caniuse-lite` (CC-BY-4.0)** — data browserslist, hanya dipakai saat build,
   tidak ikut ter-ship ke user. Atribusi cukup lewat THIRD-PARTY-NOTICES.
4. **`expand-template` (MIT OR WTFPL)** — dual-license, pilih MIT. OK.

## 4. Masalah nyata — KEAMANAN, bukan lisensi (npm audit: 4 high prod, sisanya dev-only)

1. **`xlsx@0.18.5` — 2 HIGH, "No fix available" di npm**
   (GHSA-4r6h-8v6p-xvw6 prototype pollution; GHSA-5pgg-2g8v-p4x9 ReDoS).
   Fix ada di 0.19.3/0.20.2 tapi SheetJS pindah distribusi ke `cdn.sheetjs.com` —
   npm registry berhenti di 0.18.5. Vektor input kita: file Excel **milik user
   sendiri** (`doc_read`) → rendah selama single-user dev, **tinggi saat multi-user**.
   Opsi: (a) pin tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
   (masih Apache-2.0, drop-in, zero-code-change); (b) migrasi `exceljs` (MIT,
   rewrite kecil). → **Rekomendasi (a) sebelum P1-INF-5 deploy.**
2. **`postcss ≤8.5.22` via `next@15.5.28` — 4 advisories** (XSS stringify, arbitrary
   file read via sourceMappingURL — semua build-time, bukan runtime serving input
   user). Fix resmi = next@16 (breaking). Mitigasi non-breaking: npm `overrides`
   postcss `^8.5.23`. Rendah risiko (kita juga pakai @tailwindcss/postcss sendiri).
3. **`zod@3.25.76` — 1 HIGH** (GHSA-mrhx-c7xc-m3w5 memory exhaustion pada koleksi
   besar). Fix = zod ≥4.6.6 (major, breaking — zod v4 API beda di beberapa titik;
   juga openai SDK v4 belum pin zod 4). Terpakai di kontrak API (batas size body
   request). Risiko nyata: endpoint upload/stream menerima array besar → DoS.
   Mitigasi murah tanpa upgrade: cap ukuran body di route (sudah sebagian) +
   `z.string().max()` konsisten di kontrak upload. Upgrade zod v4 = tugas sendiri
   (pecah kontrak) — jadwalkan, jangan buru-buru.
4. Moderate: vitest/vite/esbuild — **devDependency saja**, tidak ter-ship. Abaikan.

## 5. Aset & kode non-npm

- `mcp-servers/tailscale/index.mjs` — **kode orisinal** (wrap CLI `tailscale`,
  stdio JSON-RPC tanpa SDK) — bukan turunan repo tailscale → tanpa kewajiban BSD-3.
- `apps/web/public/*` (favicon Orin) — artefak AI Studio milik kita; **pastikan
  nama/gaya "Orin" tidak menabrak trademark pihak ketiga** (lihat §7 butir 3).
- `packages/personas/*`, `packages/skills/*` — konten orisinal kita.
- `docs/Orin v*.html` — artefak internal AI Studio; tidak di-ship. Boleh ikut repo
  privat; **hapus dari repo jika suatu saat dibuka publik** (berisi prompt kerja).
- Font: system stack via CSS var — tidak ada font web ter-embed → tanpa kewajiban
  lisensi font (OFL dsb).
- `unpdf` (MIT) membungkus pdf.js (Apache-2.0) — OK.

## 6. Status hukum proyek sendiri — **KOSONG, harus diputuskan**

- Belum ada `LICENSE` file; **tidak ada field `license`** di 4 package.json.
  Konsekuensi: default "All rights reserved" (hak cipta penuh kita) — sebenarnya
  protektif, tapi ambigu bagi kontributor/inspeksi CI (`license` kosong memicu
  warning & beberapa registry menolak).
- Rencana bisnis (PLAN §12 D11: lisensi self-host berbayar + credits) → **jangan
  MIT-kan repo root sekarang** kalau jalur komersial dituju. Opsi:
  1. `"license": "UNLICENSED"` + file LICENSE "Proprietary — All rights reserved"
     (paling aman untuk repo privat → publik-partial nanti);
  2. Dual-track: core engine open (MIT/Apache) + apps/web komersial — kompleks,
     putuskan di Fase 3 (self-host edition §12.15);
  3. BSL/Source-available — overkill sekarang.
  → **Rekomendasi: opsi 1 sekarang; revisi saat keputusan open-core (Fase 3).**

## 7. Daftar tindak (urutan prioritas)

1. [ ] Putuskan & pasang LICENSE + `"license": "UNLICENSED"` di 4 package.json
      (root, contracts, core, web). *Keputusan user — blok publish repo publik.*
2. [ ] Buat `THIRD-PARTY-NOTICES.md` (sharp/libvips LGPL, caniuse-lite CC-BY,
      expand-template MIT, dsb) — regenerasi via skrip audit.
3. [ ] Swap `xlsx` → tarball cdn.sheetjs.com 0.20.3 (Apache-2.0, zero-code-change)
      + jalur test doc-tools. *Sebelum deploy P1-INF-5.*
4. [ ] npm `overrides`: postcss ^8.5.23 (menutup 4 advisories tanpa next@16).
5. [ ] zod: tambah cap `.max()` di kontrak upload/array besar (mitigasi DoS murah);
      jadwalkan upgrade zod v4 sebagai task sendiri.
6. [ ] Konfirmasi provenans & nama "Orin" (trademark ringan) sebelum branding publik.
7. [ ] CI: tambah step `npm audit --omit=dev --audit-level=high` (fail >
      threshold) + regenerasi laporan lisensi berkala.

---
*Skrip audit (enumerasi license + histogram + flag) dijalankan lokal; hasil
histogram di §2 adalah snapshot 2026-11 (259 package).*
