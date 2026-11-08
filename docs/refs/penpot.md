# Referensi: Penpot (eksplorasi P2-DSN-1)

> Deliverable task **P2-DSN-1** · menjawab §12.11 (eksplorasi) + §12.15 (cloud vs self-host)
> dan menentukan **mekanisme embed** untuk tab Design (D18, §13.9).
>
> Sumber: repo lokal `D:\projects\penpot` (clone penuh, branch develop, **v2.19.0 unreleased**;
> pin ke tag stable terakhir saat deploy). Lisensi **MPL-2.0** (file-based, aman dikombinasikan).

## TL;DR untuk Yuika

1. **Embed WAJIB self-host.** CSP default `frame-ancestors 'self'` dan TIDAK bisa dilepas
   lewat env var tambahan, harus override utuh `PENPOT_CSP_POLICY` (hanya mungkin di
   self-host). Cloud `design.penpot.app` **tidak bisa** di-iframe. → §12.15 terjawab.
2. **v0 ramping terbukti mungkin tanpa plugin**: agent menulis desain **headless** lewat
   RPC API (`update-file` menerima vektor `changes`, protokol yang sama dengan editor
   Penpot), user memantau lewat **share-link viewer** yang di-iframe di tab Design.
   Viewer memproses perubahan realtime (viewer.cljs `process-changes`).
3. **v1 (live in-canvas)**: MCP server resmi (`mcp/`, TS, Streamable HTTP `/mcp`),
   tetapi arsitekturnya unik: server ↔ WebSocket ↔ **plugin yang hidup di dalam sesi
   UI Penpot yang terbuka**. Tool intinya `executeCode` (JS bebas via Plugin API) +
   `exportShape` (png/svg). Cocok justru dengan embed kita: plugin jalan di dalam
   iframe yang kita sematkan → user melihat agent menggambar live.
4. **Render headless ada**: service `exporter` (Node) merender shape/file →
   bitmap/SVG/PDF via renderer WASM (Rust+Skia), bisa dipakai untuk thumbnail/diff
   artefak TaskTree tanpa browser.

## Peta permukaan integrasi

### 1. RPC API publik (jalan utama untuk agent)

- Endpoint: `POST /api/main/methods/:method-name`, **bukan REST klasik**, tapi RPC
  tunggal per method; autentikasi **Personal Access Token** (flag `access-tokens`) atau
  MCP token (subset terbatas, via OAuth).
- **OpenAPI spec bawaan**: `/api/main/doc` + `/api/main/doc/openapi.json` → kita bisa
  generate client dari spec (selaras prinsip contract-first §6.3).
- 29 modul command (`backend/src/app/rpc/commands/`), yang relevan:
  `files_create`, `files_update` (**headless write**, vektor `changes`), `files`
  (get), `files_snapshot`, `files_thumbnails`, `files_share` (**create-share-link**),
  `projects`, `teams`, `comments`, `viewer` (`get-view-only-bundle`, **tanpa auth**,
  share-link based), `webhooks`, `plugins`, `search`.
- Format data file = structured EDN/JSON (pages, shapes, komponen, **design tokens**,
  first-class, `common/types/tokens_lib.cljc`; v2.19 malah menambah library internal +
  file sync untuk tokens) → pas untuk generate kode di fase `develop`.

### 2. MCP server resmi (`mcp/`, pnpm workspace TS)

- Transport **Streamable HTTP** `/mcp` (SSE legacy dibuang); lokal via
  `npx -y @penpot/mcp@latest`; ada juga remote host resmi untuk kerja desain murni.
- Tool: `executeCode` (arbitrary JS di konteks plugin → akses penuh Penpot Plugin API),
  `exportShape` (png/svg; `selection`/`page` sebagai id spesial), `highLevelOverview`,
  `importImage`, `penpotApiInfo`.
- **Arsitektur & konstrain**: server bicara via WebSocket ke **MCP Plugin yang harus
  terbuka di UI Penpot**; UI plugin tidak boleh ditutup; tab browser harus aktif
  (browser membekukan tab idle → server menolak task). Di Chrome: "always keep site
  active"/pin tab. Rekomendasi resmi: model frontier + vision.
- Implikasi untuk kita: konstrain ini **hilang jika Penpot ter-embed di tab Design kita**
  (iframe selalu "aktif" selama tab platform terbuka), embed justru memperkuat jalur MCP.

### 3. Share links + viewer (kunci embed v0)

- `create-share-link`: scoped **per halaman** file, permission `who-comment` +
  `who-inspect` (inspect = lihat kode/HTML-CSS dari shape!) → pas untuk handoff
  desain→kode.
- Viewer bundle (`get-view-only-bundle`) tanpa auth via share-id; viewer menerapkan
  `changes` realtime (WebSocket sama dengan workspace) → **agent edit headless via API,
  user melihat update live di iframe viewer**. _(Verifikasi runtime saat PoC.)_

### 4. Exporter + render-wasm (render headless)

- `exporter/`: service Node, `POST /api/export/jobs` → job queue (Redis), render
  shape/file → **bitmap/SVG/PDF**. `render-wasm/`: engine Rust+Emscripten+Skia.
- Untuk Yuika: thumbnail artefak TaskNode, snapshot diff antar fase, bahan input
  model vision, semua tanpa membuka browser Penpot.

### 5. Plugin system (`plugins/`)

- Plugin dimuat via URL manifest (`manifest.json`), UI plugin = app web apa pun
  (Angular starter disediakan), akses `penpot.*` API ke file yang sedang terbuka
  (tipe lengkap: `plugins/libs/plugin-types/index.d.ts`).
- Untuk Yuika: jalur **v1+**, plugin resmi "Yuika" (di-host platform kita)
  yang dibuka otomatis di sesi embedded = jembatan live-control tanpa menunggu
  upstream; juga jalur white-label v2.
- Catatan: `penpot.ui.open(..., {hidden: true})` ada, plugin bisa jalan tersembunyi.

## Temuan embed (keputusan §12.15 + mekanisme D18)

- `docker/images/files/nginx-entrypoint.sh`: CSP default memuat `frame-ancestors 'self'`
  dan `frame-src 'self'`; komentar eksplisit: _frame-ancestors sengaja tidak bisa
  diperlonggar via env_, satu-satunya jalan = set `PENPOT_CSP_POLICY` utuh (deployment
  memilikinya penuh). Devenv nginx juga menambah `X-Frame-Options SAMEORIGIN`.
- → **Keputusan: self-host via docker-compose (wajib untuk embed)**, CSP di-overwrite:
  `frame-ancestors https://<origin-platform>` (+ `frame-src`/`connect-src` seperlunya).
  Cloud Penpot tetap berguna untuk akun pribadi/user luar, tapi bukan untuk studio.

## Arsitektur rekomendasi (selaras tangga embed §13.9)

```
v0 (ramping, flow utuh, golden path P2-DSN-6):
  Penpot self-host (docker, origin sendiri mis. penpot.local / subdomain)
  Agent (persona Designer, fase `design`)
    └─ RPC API + access token: create project/file, update-file (changes),
       create-share-link (per halaman)
  Tab Design (platform)
    └─ iframe share-link viewer (CSP di-overwrite) → user lihat update LIVE
  Fase `develop`
    └─ get-file / snapshot via RPC → shapes + design tokens → generate komponen
  Artefak TaskNode: thumbnail via exporter (png/svg)

v1 (live in-canvas):
  Jalankan MCP server resmi (lokal, Streamable HTTP) + plugin MCP dimuat di dalam
  sesi Penpot yang TER-EMBED di tab Design kita (iframe selalu aktif → konstrain
  "tab harus aktif" terpenuhi otomatis) → executeCode: agent menggambar live,
  user menyaksikan; exportShape → bahan vision/diff.

v2 (white-label):
  Plugin "Yuika" sendiri (opsional fork kecil UI Penpot) + SSO/autologin token
  + tema → "desain adalah bagian dari Yuika".
```

## Yang perlu diverifikasi saat PoC (jangan asumsi)

- [ ] Viewer share-link memang menerima push `changes` realtime di iframe (baca kode:
      ya; bukti runtime menyusul).
- [ ] Pembuatan access token: via UI profile settings, cek bisa via API/CLI untuk
      onboarding mulus ( RPC `access_token` module ada; periksa method create).
- [ ] Kompleksitas menulis `changes` headless (skema di `common/files/changes.cljc`),
      kalau terlalu rawan, v0 bisa geser ke MCP lebih awal (plugin jalan di iframe
      embedded; server MCP lokal kita sendiri).
- [ ] Pin versi stable (2.19.0 masih unreleased) + smoke upgrade (changelog breaking).
- [ ] Berat stack self-host (postgres + redis + exporter + media-processor + wasm),
      siapkan profil "lite" atau batasi service non-esensial untuk dev lokal.
- [ ] Rate limit / ukuran file, file besar + banyak update headless per turn.

## Dampak ke PLAN/TASKS

- §12.11 **terjawab** (laporan ini); §12.15 **terjawab**: self-host wajib (embed).
- **P2-DSN-1 selesai**; P2-DSN-2 (connector) mekanisme ditentukan: **RPC API + access
  token** sebagai jalur utama v0, MCP server resmi sebagai jalur v1 (bukan MCP-only).
- P2-DSN-3 (tab Design): iframe share-link viewer + CSP override self-host.
- P2-DSN-4 (design→kode): input = RPC get-file/tokens (bukan screenshot-only);
  exporter untuk artefak visual.
- Risiko baru masuk PLAN §11: ops self-host stack penuh (mitigasi profil docker lite,
  pin versi, exporter opsional-di-dev).
