# Skenario Test — Sesi Dev 9 (Studio OS: shell tab, kanban, katalog MCP, memory loop, Pengaturan)

> Durasi ±25 menit · Semua fitur sesi dev 8 + 9 · DB & workspace sudah dibersihkan total.
> Saat menemukan masalah, catat huruf skenario + screenshot. Kirim potongan log
> `[yui:trace]` dari terminal untuk analisis performa.

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

## F. Trace performa (2 menit)

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
| F | Log trace terkumpul | ☐ |
