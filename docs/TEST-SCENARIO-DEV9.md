# Skenario Test — Sesi Dev 9 (Studio OS: shell tab, kanban, katalog MCP, memory loop, Pengaturan)

> Durasi ±25 menit · Semua fitur sesi dev 8 + 9 · DB & workspace sudah dibersihkan total.
> Saat menemukan masalah, catat huruf skenario + screenshot. Kirim potongan log
> `[yui:trace]` dari terminal untuk analisis performa.
>
> **Reset ulang kapan saja**: matikan dev server → `npm run data:clean` → `npm run dev`
> (`npm run data:status` untuk lihat saja; opsi `--keep-mcp --keep-user`).

## 0. Persiapan (1 menit)

1. **Restart dev server** (matikan yang jalan → `npm run dev`) — memastikan core terbaru
   (nudge, settings swap, katalog MCP) aktif, bukan build lama di memori.
2. Buka `localhost:3000` — sidebar hanya berisi **Proyek** + **⚙ Pengaturan** di bawah.

## A. Pengaturan & MCP (4 menit)

1. Klik **⚙ Pengaturan** → seksi **Provider & Model**:
   - Terlihat Base URL, model aktif, dan indikasi key `…4 digit terakhir` (key TIDAK tampil penuh ✔)
2. Pindah ke seksi **MCP & Tools**:
   - Baris status runtime: **"Python/uvx: belum terpasang [Install uv]"**
   - Klik **Install uv** → konfirmasi "Ya, install" → tunggu ±30–120 dtk → status jadi
     "Python/uvx: siap ✓" (tanpa restart dev server — koneksi pakai path absolut)
   - **Katalog (20)** tampil lega — cari "fetch" → klik **Pasang**
   - Baris `fetch` muncul di daftar atas dengan status `untrusted` → klik **Trust**
   - Tunggu ±5–15 dtk (npx unduh) → status jadi `N tools` (titik hijau)
   - Opsional setelah uv terpasang: coba **Git** atau **Time** (badge Python/uvx)
   - Coba **Lepas** salah satu, lalu pasang lagi (opsional)
3. Tutup pengaturan (✕ / Esc). File `mcp.json` di root sekarang berisi entri baru — cek bila penasaran.

✅ Lolos bila: katalog 20 entri, install → untrusted → trust → terhubung dengan jumlah tool.

## B. Project + delegasi + org-chart Tim (6 menit)

1. **+ Proyek baru** → nama bebas (mis. "Toko Bunga") → klik → sesi Conductor terbuka otomatis.
2. Chat: *"Buatkan rencana dan landing page sederhana untuk toko bunga: riset singkat gaya
   landing page modern, lalu tulis kodenya. Simpan hasil di tempat yang sesuai."*
3. Selagi agent bekerja → klik tab **Tim**:
   - Kartu lead **Yui Conductor** + status live (berpikir/bekerja)
   - Kartu anak muncul saat delegasi (Scholar/Coder) dengan goal + status
   - Setelah selesai: kartu anak jadi **selesai** + ringkasan; bench "Siaga" menampilkan persona roster
4. Tab **Papan**: task/subtask dari agent muncul di kolom (Belum/Kerja/Reviu/Selesai).
   - Seret kartu antar kolom → status berubah ✔ (cek tab **Pohon** / tasklist ikut)
5. Tab **Sesi**: riwayat sesi proyek + tombol **+ Sesi baru (Conductor)**.

✅ Lolos bila: org-chart hidup saat delegasi, kanban drag&drop mengubah status, file kode
mendarat di `workspace/projects/p_*/code/` (bukan `reports/`).

## C. Approval & "Setujui & ingat" (3 menit)

1. Minta agent menulis file di luar `code|docs|reports`, mis. *"simpan catatan di
   `workspace/notes-test.txt`"* → kartu approval muncul di chat.
2. Klik **Setujui & ingat** → file dibuat.
3. Minta lagi file lain di root: *"simpan juga `workspace/notes-test-2.txt`"* → **tanpa** approval
   kedua kalinya (remember per sesi).

✅ Lolos bila: approval pertama muncul, kedua bebas, kedua file ada.

## D. Memory loop (5 menit)

1. Tab **Memori** → bagian "Tentang Anda": tambahkan baris `- Saya suka jawaban singkat
   tanpa basa-basi` → **Simpan** (✓ Tersimpan).
2. **+ Sesi baru** (tab Sesi) → tanya apa pun → jawaban seharusnya lebih ringkas.
3. Di sesi proyek, minta eksplisit: *"Catat di memori bahwa proyek ini memakai Next.js
   dan SQLite."* → agent memanggil `memory_append` → chip **"✎ Yui mencatat"** muncul di chat.
4. Minta ulang perintah yang sama → harus **di-skip** (dedupe, agent bilang catatan sudah ada).
5. Pasca-task nudge: setelah turn ber-tool yang mengandung preferensi (mis. *"buatkan deskripsi
   produk singkat — aku nggak suka bertele-tele"*), tunggu ±2–3 dtk → chip ✎ muncul otomatis
   (bila nudge menilai ada yang layak dicatat; bisa juga skip — lihat trace).
6. Tab **Memori** → dua dokumen berisi catatan; Anda bisa edit/hapus bebas → Simpan.

✅ Lolos bila: edit manual dibaca sesi baru, `memory_append` jalan + chip, dedupe bekerja,
USER.md/MEMORY.md isinya persis yang tampil di tab Memori.

## E. Settings: ganti model panas (2 menit)

1. **⚙ Pengaturan** → Provider & Model → Model utama ganti (mis. `glm/glm-5`) → **Simpan**.
2. Buat sesi baru → tanya sesuatu → jawaban datang (cek trace: model yang terpakai).
3. Kembalikan model semula (`glm/glm-5.1`) → Simpan.
4. (Opsional) cek `.env`: `YUI_MODEL` terganti, baris lain utuh.

✅ Lolos bila: tanpa restart, sesi baru memakai model baru; `.env` tertata.

## F. Skill dari pengalaman (3 menit) — P1-MEM-3

1. Di sesi proyek setelah satu alur kerja selesai (mis. landing page barusan), minta:
   *"Jadikan skill cara kerja barusan — usulkan lewat skill_propose."*
2. Chip **"🛠 Yui mengusulkan skill"** muncul di chat.
3. Tab **Skill**: draf tampil (nama, deskripsi, isi) → klik **Edit** → ubah deskripsi → **Simpan**.
4. Klik **Terima** → draf pindah ke "Siap pakai" (lint lolos).
5. Sesi baru → tanya agent *"skill apa saja yang kamu punya?"* → skill baru terdaftar via `skills_list`.
6. Uji duplikat: minta agent usulkan nama yang sama lagi → harus ditolak dengan pesan jelas.

✅ Lolos bila: draf → edit → terima → terlihat agent di sesi baru; tolak menghapus bersih.

## G. Trace performa (2 menit)

Setelah skenario B selesai, salin dari terminal baris-baris `[yui:trace]` terakhir —
terutama `turn=… SELESAI total=…ms iter=…` dan `nudge turn=…` — lalu kirimkan
(bahan optimasi P0-CORE-3/4).

## Checklist ringkas

| Skenario | Fitur | ✔ |
|---|---|---|
| A | Katalog MCP 20 + install/trust/lepas | ☐ |
| B | Tab Tim org-chart live + Papan drag&drop + Pohon | ☐ |
| C | Approval + Setujui & ingat + file policy | ☐ |
| D | USER.md/MEMORY.md + memory_append + dedupe + nudge | ☐ |
| E | Settings swap model panas | ☐ |
| F | Skill dari pengalaman: usul → edit → terima → dipakai agent | ☐ |
| G | Log trace terkumpul | ☐ |

## H. Multi-model per persona + fallback (5 menit) — P1-MDL-1 / P0-CORE-2

*Prasyarat: restart dev server (semua fitur sesi dev 10 aktif setelah restart).*

1. ⚙ Pengaturan → seksi Provider & Model → tabel **Model per persona**:
   set `Yui Coder` → model `glm/glm-5` (blur = simpan; kosongkan = kembali default).
2. Model fallback global: isi "Model fallback" `glm/glm-5` → Simpan.
3. Sesi baru Coder → kerjakan sesuatu → trace (konsol) menampilkan model
   `glm/glm-5` untuk sesi Coder, sementara sesi Conductor tetap `glm/glm-5.1`.
4. Delegasi dari Conductor ke Coder → anak memakai model Coder (cek trace).
5. (Fallback) sementara set model utama ke nama model yang TIDAK ada (mis.
   `glm/tidak-ada`) di Settings → jadikan default → turn baru: harus otomatis
   jatuh ke fallback (`FALLBACK AKTIF` di trace) dan tetap menghasilkan jawaban.
   Kembalikan seperti semula. (Cooldown 5 mnt — model sekarat tak dicoba ulang.)

✅ Lolos bila: dua model beda terlihat di trace dalam satu run delegasi; model
   mati → fallback mulus tanpa error di chat.

## I. Tab File + persona Designer (5 menit) — P2-STU-3 v0 / P1-PER-7

1. Persona picker → **Yui Designer** muncul (roster ke-7, bentuk segitiga Orin).
2. Sesi project (Conductor) → delegasikan "buatkan mockup landing sederhana" ke
   **Yui Designer** → artefak mendarat di `code/`.
3. Tab **File** → tree memperlihatkan `code/` & `reports/` → klik file mockup →
   isinya tampil di viewer.
4. (Negatif) URL manual `/api/projects/<id>/files?path=../.env` → ditolak
   "path di luar project".
5. Designer bisa memuat skill seed-nya: tanya "skill apa yang kamu punya?" →
   `design-system-basics` & `design-to-code-handoff` terlihat; setelah dipakai,
   tab Skill menunjukkan 👁 naik.

✅ Lolos bila: mockup Designer terbaca di tab File tanpa keluar app; traversal
   ditolak; usage tracking naik.

## J. Stop turn + diff file + riwayat sesi (7 menit) — P0-CORE-1 / P2-STU-3 / P1-MEM-5

1. **Stop**: kirim tugas besar (mis. "buat landing page lengkap") → saat agent
   bekerja, klik tombol **■** di samping tombol kirim → turn berhenti < 1 dtk,
   chip "turn dibatalkan — progres & parsial tersimpan", TIDAK ada error merah.
   Ketik "lanjutkan" → agent lanjut dari konteks yang tersimpan.
2. **Diff**: tab File → file `code/…` yang sudah ditulis agent → dropdown
   "revisi…" muncul bila agent menimpa file ≥2× → pilih revisi → diff +/− baris
   berwarna. (Negatif) file yang tak pernah ditimpa → tanpa dropdown.)
3. **session_search**: sesi baru di proyek yang sama → tanya "keputusan apa saja
   yang pernah kita ambil soal X?" → agent memanggil `session_search` dan
   menemukan diskusi sesi sebelumnya (cek chip tool call di chat).

✅ Lolos bila: stop tanpa error + lanjut mulus; diff akurat; riwayat ditemukan
   lintas sesi dalam proyek yang sama.

## K. Fix batch #2 — file tree, diagram Tim, dokumen scribe, tailscale (10 menit)

1. **File tree**: buka proyek lama → tab File → file & folder (assets/code/docs/
   reports/scripts) kini TAMPIL (bug: dulu readdir relatif cwd Next → selalu
   kosong). Tombol ↻ Segarkan + auto-refresh 5 dtk.
2. **read_file paging**: minta coder baca file besar → respons menyertakan
   `nextOffset` — agent lanjut paging, TIDAK menulis script node ekstra
   (pola tail-mockup.js hilang). Tool baru `search_files` (grep).
3. **Tim = diagram hierarki**: conductor root tengah; anak sejajar; delegasi
   designer→coder tampil sebagai cabang di bawah designer dengan label
   "dari Yui Designer"; tugas + durasi (◐ 3m 12d) di tiap cabang.
4. **Pohon**: node doing/review menampilkan durasi berjalan.
5. **Scribe dokumen**: tab File → ⬆ Upload dokumen (pdf/xlsx/csv) → pilih
   persona Yui Scribe → "rangkum uploads/laporan.pdf" → scribe memanggil
   `doc_read` dan merangkum isinya.
6. **Tailscale MCP**: panel MCP → katalog → install "Tailscale Tunnel" →
   Trust → tanya agent "cek status tailscale" → tool ts_status.
   (Butuh tailscale CLI terpasang & login.)
   (perbaikan sesi ini: klik file kini benar-benar membuka isinya — dulu efek
   reset salah-saling-kunci; tab Tim kini kanvas bebas: tahan & geser untuk
   pan, scroll = geser, Ctrl+scroll / tombol ± = zoom, ⌂ = reset.)
