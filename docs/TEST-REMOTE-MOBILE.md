# TEST-REMOTE-MOBILE — Mission Control Mobile (Remote v1.2)

> Panduan verifikasi end-to-end untuk overhaul remote mobile project-oriented.
> Prasyarat: studio/deploy terbaru (dispatch v1.2) + APK mobile build baru +
> host online (desktop atau studio compose). Login portal sudah teruji (FIX
> sebelumnya); dokumen ini meng-cover 15 catatan uji pengguna.

## Setup

1. Studio host: `https://studio.notu.dev` (deploy terbaru) ATAU desktop host.
2. Mobile: APK hasil build `yuika-mobile` main terbaru (build `9eadb0a` ke atas
   + rewrite mission control).
3. Akun yang sama antara host dan HP.
4. Data: minimal 1 project dengan beberapa task + 1 sesi berjalan.

## A. Daftar fitur yang bisa diuji

| # | Fitur | Lokasi di HP |
| --- | --- | --- |
| 1 | Markdown di bubble chat (heading, list, code block, bold, link) | Project → Chat → buka sesi |
| 2 | Log/tool TIDAK muncul sebagai bubble | sama (role `tool` disembunyikan) |
| 3 | Skeleton loading state semua fetch | Projects / Tasks / Files / Team / Activity / Settings |
| 4 | Daftar sesi selalu segar (auto refresh pasca turn) | Project → Chat |
| 5 | Tampilan selaras studio (card gelap, chip, aksen biru) | semua layar |
| 6 | Auto-scroll ke bubble terbaru | chat (scroll manual ke atas → TIDAK dipaksa turun; dekat bawah → ikut) |
| 7 | Mission control per project: tasks, files, team, activity, terminal, browser, chat | Project screen (7 tab) |
| 8 | Maskot persona + display name resmi (Maestro/Rommel/…) | semua kartu persona, header chat |
| 9 | List project ringkas (task stats, delegasi aktif, sesi terakhir) | tab Projects |
| 10 | Ganti persona untuk chat baru | Chat → + New chat |
| 11 | Toggle Safety / Hardcore mode | Settings → Approval mode |
| 12 | Settings penuh: usage, MCP, provider, budget, reset | tab Settings (TANPA sign-out host) |
| 13 | Persona training/update | TIDAK DIIMPLEMENTASI (disepakati; UI disederhanakan) |
| 14 | Tab terminal di mobile (shared, detach-only) | Project → Terminal |
| 15 | Live browser mobile | tab Screens / Project → Browser |

## B. Test case E2E (urut eksekusi)

### MC-1 Login & daftar host

1. Buka APK → Sign in (portal) → halaman Hosts.
2. **PASS**: host studio/desktop muncul dengan `seen Xm ago`; pull-to-refresh bekerja.

### MC-2 Masuk host → tab Projects

1. Tap host → status header "Live" (titik hijau).
2. **PASS**: skeleton tampil lalu kartu project muncul: nama, deskripsi, chip
   `N doing/todo/done`, delegasi running bila ada, "Last: <judul sesi>".
3. Pull-to-refresh me-reload tanpa error.

### MC-3 Project mission control — Tasks

1. Tap "Open mission control" → tab Chat default; pilih tab **Tasks**.
2. **PASS**: tree task (indentasi anak) + titik warna status + maskot assignee;
   hitungan total task di atas.

### MC-4 Files + viewer

1. Tab **Files** → folder bisa collapse/expand (tap).
2. Tap file teks → viewer monospace + nama + `relPath`.
3. File > 64 KB → chip `truncated` + catatan preview.
4. **PASS** semua di atas; kembali (‹) tidak crash.

### MC-5 Team + delegasi

1. Tab **Team** → kartu roster (maskot + display name + role).
2. Jalankan delegation dari web (atau minta persona) → refresh → job muncul
   dengan chip status + "Open live session →".
3. **PASS**: tap live session membuka chat sesi anak.

### MC-6 Activity feed

1. Tab **Activity** → baris log terbaru di atas (label monospace, persona
   display name, waktu, ikon kind; error merah).
2. **PASS**: tidak ada JSON mentah di chat (bandingkan: yang panjang hanya di sini).

### MC-7 Chat: sesi baru + persona picker

1. Tab **Chat** → "+ New chat" → sheet daftar persona (maskot + name + model).
2. Pilih persona → chat terbuka kosong, header maskot + display name.
3. Kirim "Summarize this project in 3 bullets".
4. **PASS**: jawaban streaming; markdown ter-render (bullet, bold, `code`);
   auto-scroll mengikuti saat dekat bawah.

### MC-8 Chat: markdown + filter tool

1. Minta persona menjalankan tool riset (mis. "search news about X").
2. **PASS**: bubble hanya user/assistant; log tool panjang TIDAK jadi bubble;
   hasilnya tetap dirangkum assistant.

### MC-9 Chat: error & Stop

1. Saat turn berjalan → tombol **Stop** muncul → tap.
2. Putuskan provider sementara (opsional) → kirim prompt → chip error merah
   muncul, state kembali idle.
3. **PASS** dua skenario.

### MC-10 Sesi stale fix (#4)

1. Di web studio, buat/jalankan sesi project baru.
2. Di HP tetap di tab Chat project yang sama → tanpa reload manual.
3. **PASS**: sesi baru muncul otomatis setelah turn selesai (refresh on
   `message.done`), dan setelah kembali dari chat.

### MC-11 Terminal (shared)

1. Tab **Terminal** → "Open terminal" → replay + prompt muncul (mono, hitam).
2. Ketik `dir` / `ls` → output streaming real-time; Run per baris.
3. Detach → kembali → **Terminal** lagi → buka ulang → **PASS**: output lama
   masih ada (replay) karena PTY shared tetap hidup di host.
4. Di studio web buka terminal yang sama → **PASS**: saling melihat output
   (shared), detaching HP tidak mematikan.

### MC-12 Browser live

1. Dari web/chat minta persona membuka halaman (screen manager aktif).
2. HP tab **Screens** → kartu screen (persona, url, status running).
3. Tap → viewer: frame pertama ≤ 15 dtk, refresh ~1fps, judul + url.
4. Kembali → **PASS**: frame berhenti (unwatch) dan host log menunjukkan
   watcher lepas.

### MC-13 Settings: modes & budget

1. Tab **Settings** → Approval mode "Safety mode" aktif.
2. Tap "Hardcore mode" → **PASS** chip/label berubah; jalankan aksi berisiko
   di host → TIDAK ada approval masuk (auto-approve). Kembalikan ke Safety.
3. Budget: angka Today/All time tampil; set Daily limit angka → Save →
   **PASS** "Saved" + nilai bertahan setelah refresh.

### MC-14 Settings: provider swap

1. Provider card: ganti Model → Save → **PASS** "Saved — host applied".
2. Verifikasi di studio Settings → model host berubah (swap panas).
3. API key kosong → **PASS**: `API key set` tetap (tidak terhapus).

### MC-15 Settings: model routes & usage

1. Model routes: isi override utk satu persona → Save → chip model berganti
   dari `default` ke model itu; kosongkan + Save → kembali `default`.
2. Usage: angka calls/token + matrix persona×model (cost / `unpriced`).

### MC-16 Settings: MCP

1. MCP servers: status per server; tombol Retry (bila putus) dan
   Trust/Revoke. **PASS**: aksi tercermin di studio Settings → MCP.

### MC-17 Reset (work)

1. Danger zone → pilih "Reset work data" → ketik `RESET` → Run reset.
2. **PASS**: alert "Reset acknowledged"; host offline lalu kembali online;
   project/sesi kosong; provider + link portal tetap (scope work).
3. JANGAN uji factory di host produksi (link portal hilang).

### MC-18 Approval overlay

1. Mode Safety aktif; host menjalankan aksi berisiko.
2. **PASS**: kartu approval muncul di HP (di atas tab bar) meski sedang di
   layar lain; Approve/Reject bekerja; resolved otomatis hilang.

### MC-19 Reconnect & stale-safe

1. Redeploy/restart host saat HP terbuka → "Host offline" lalu reconnect
   otomatis; layar aktif pulih (fetch ulang).
2. Airplane mode 30 dtk → kembali → **PASS**: reconnect + data segar tanpa
   relogin (watchdog relay ≤ ~75 dtk).

## C. Yang SENGAJA tidak ada (di luar lingkup)

- Persona training/update (catatan #13) — UI disederhanakan, backlog.
- Sign-out host dari HP (#12) — tetap host-only.
- Terminal kill (mobile hanya detach — shared dengan studio).
- Frame-rate tinggi live browser (~1fps by design, SCR-7).
