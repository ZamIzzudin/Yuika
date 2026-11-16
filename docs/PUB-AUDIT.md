# PUB audit (PUB-1 / PUB-3, persiapan repo publik)

Status audit menuju membuka repo. Tanggal: 2026-11-16.

## PUB-1 Third-party notices

- [x] `THIRD-PARTY-NOTICES.md` di-generate (268 paket prod) via
      `node scripts/gen-notices.mjs` (zero-dep, idempotent).
- [x] Workspace package first-party (`@yuika/*`) dikecualikan otomatis.
- [x] Special notices: sharp/libvips (LGPL-3.0, dynamic linking),
      caniuse-lite (CC-BY-4.0), readability/domino.
- Regenerasi wajib tiap perubahan dependency produksi (masukkan ke
  checklist rilis).

## PUB-3 Secrets & history

### Scan pola secret seluruh history (343 commit)

Pola: `ghp_…`, `github_pat_…`, `sk-…`, `AKIA…`, `BEGIN PRIVATE KEY`,
`api_key=…`. Hasil: **5 commit match, semuanya fixture test yang aman**:

| Commit | Isi | Status |
| --- | --- | --- |
| `e551ea3` | assertion format PEM pada key yang DIGENERATE test | aman |
| `3deff3e` | golden vector crypto (test key publish by design) | aman |
| `c4a5c2c` | token dummy `sk-abcdef1234…` (uji redaction) | aman |
| `3337c0c` | (match hanya di sisi -/konteks, bukan penambahan) | aman |
| `65f94c1` | dummy token + PEM dummy untuk uji redaction | aman |

Tidak ada kunci asli, token asli, atau kredensial di history. Kunci
updater desktop (`D:/projects/.yuika-desktop-updater.key`) dan token
GitHub (`d:/projects/.ght`) selalu di LUAR repo.

### File terlacak saat ini

- Tidak ada `*.tmp*`, `*.log`, `*.key`, `*.pem` terlacak (hanya di
  .gitignore).
- `model-prices.json` sudah di-untrack (runtime data opsional).
- Pola IP di file terlacak: hanya loopback/contoh (`127.0.0.1`,
  `172.17.0.1` di komentar .env.example). Aman.

### Keputusan tersisa (bukan blocker)

- URL `*.notu.dev` (portal/studio/relay staging) muncul di README dan
  docs deploy. Itu URL layanan publik milik proyek, bukan secret, dan
  studio dilindungi owner-lock. **Default: biarkan.** Kalau mau sembunyi
  sebelum rilis publik: scrub di pass terakhir sebelum open.

## npm audit

- [x] 2026-11-16: vitest 2.1.9 -> 5.1.0 (semua workspace). Total
      **0 vulnerabilities** (prod & dev). Sebelumnya 6 advisory
      (vitest/vite/tinypool/esbuild, dev-only) - tertutup dengan upgrade,
      bukan waiver.
- Rencana ulang scan: tiap rilis + sebelum open repo publik.

## Checklist open repo (sisa)

- [ ] PUB-2: keputusan lisensi final (LICENSE saat ini: all rights
      reserved). Kandidat: PolyForm Noncommercial / BSL / open-core.
- [ ] Trademark note sudah ada di CONTRIBUTING.md (Yuika/Orin = maintainer).
- [ ] DCO sign-off diaktifkan via GitHub setting "Require signed-off"
      saat repo dibuka.
