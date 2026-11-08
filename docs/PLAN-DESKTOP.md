# PLAN-DESKTOP — Shell Tauri (P2-DTL)

> Dibuat D47 saat eksekusi ROADMAP-NEXT #7. Dokumen ini = rencana bertahap +
> keputusan desain shell desktop. TASKS.md tetap sumber definisi task;
> ROADMAP-NEXT #7 menandai progres.

## Keputusan arsitektur (D47)

- **Reuse, jangan fork**: shell Tauri TIDAK punya UI sendiri. Window memuat UI
  web yang sama (`apps/web`); mode dev = `http://localhost:3000` (devUrl),
  mode build = export statis `apps/web/out` (frontendDist; menyusul D48).
- **Onboarding = halaman `apps/web/public/welcome.html`** (vanilla, tanpa
  React): disajikan web dev server (dev) dan ikut di-copy ke export (prod).
  Shell membukanya sebagai window pertama (`url: "welcome.html"`), lalu
  `window.__TAURI__` (withGlobalTauri) dipakai untuk `invoke`. Dibuka di
  browser biasa → fallback note + link ke app (dijaga e2e dbg-space).
- **Mode switch host/remote (D23)**:
  - HOST: Rust spawn API lokal → poll health TCP `127.0.0.1:3211` (timeout
    90s) → `location.replace('./')` ke UI web. Bila API sudah hidup (mis.
    user menjalankan `npm run dev`), TIDAK spawn ulang — hanya pakai.
  - REMOTE: input URL host (mesin lain) → navigasi window ke sana. v0 =
    web-host URL; pairing relay (relay-client) menyusul saat butuh.
- **Higienis proses**: hanya API yang shell spawn sendiri yang dibunuh saat
  exit (Windows: `taskkill /T /F`; npm → node tree). CREATE_NO_WINDOW untuk
  semua child Windows.
- **CORS sudah cocok tanpa perubahan**: API `origin: true` (reflect), web
  `API_BASE` default `http://127.0.0.1:3211` → desktop tidak butuh env baru.

## Staging

### D47 (selesai) — dev slice vertikal
- `apps/desktop` (Tauri 2): Cargo, tauri.conf (window 1280x800, csp null,
  bundle NSIS target + icons generated dari logo 512), capabilities
  (core:default + remote urls dev origin), lib.rs (pick_host/pick_remote,
  spawn/kill API, health poll).
- `welcome.html` + fallback browser; root script `npm run desktop`.
- Verifikasi: cargo check/build ✓, `tauri dev` runtime (window + welcome
  ter-load dari dev server) ✓, e2e dbg-space welcome fallback ✓.

### D48 — prod host mode (butuh CI; `next build` EPERM di host dev)
1. Static export web: `output: "export"` di next.config build desktop +
   `NEXT_PUBLIC_API_BASE` tetap default 127.0.0.1:3211. Perhatikan route
   dinamis /dev & /auth/callback (client-only, aman).
2. Bundling API: esbuild `apps/api` → `yuika-api.cjs` single file; native
   deps (better-sqlite3 dll) di-external + dikirim sebagai resources
   (node_modules pruned) — atau sidecar `node.exe`. Putuskan saat eksekusi
   dengan uji cold-start di Windows bersih.
3. Release path Rust: `spawn_api()` mode release menjalankan sidecar/resource
   (sekarang: error eksplisit "ships with P2-DTL-3").

### D49 — packaging + auto-update (P2-DTL-3)
- NSIS aktif (sudah di config), updater `tauri-plugin-updater` +
  `tauri-plugin-process` (endpoint JSON latest; signing key dikelola aman,
  jangan commit private key).
- CI workflow `desktop.yml`: build win (matrix mac/linux menyusul), upload
  artefak NSIS + updater manifest.
- DMG (macOS) menyusul bila ada kebutuhan test relay lintas platform.

## Catatan uji manual (D47)

1. `npm run desktop` (repo root) — window "Yuika" terbuka di welcome page.
2. Klik "On this device" → status "Starting the local engine…" → UI Home
   (playground maskot) muncul; API hidup di 3211.
3. Atau klik "Connect to a host" → isi URL host lain → Connect.
4. Tutup app → proses `node` API yang di-spawn shell ikut mati.
