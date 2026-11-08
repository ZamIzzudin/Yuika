---
name: data-analysis-basics
description: "Analisis dataset tabular yang jujur & reproducible: inspeksi, pembersihan, statistik, temuan."
version: 0.1.0
author: Yuika Team
license: MIT
platforms: [linux, macos, windows]
metadata:
  yui:
    tags: [data, analysis, statistics, reproducibility]
    category: data
    personas: [yui-analyst]
---

# Data Analysis Basics

Prosedur analisis dataset tabular (CSV/Excel) yang bisa direproduksi siapa pun
dari file mentah. Milik: Watson Yui.

## 1. Inspeksi dulu, tafsir belakangan

- Baca data via `doc_read` (Excel → CSV per sheet). CATAT: jumlah baris, nama +
  tipe kolom, jumlah nilai kosong per kolom.
- Jangan menyimpulkan apa pun sebelum tahu bentuk data. "Tabel ini 1.204 baris,
  3 kolom tanggal yang 40% kosong" dulu, insight kemudian.

## 2. Bersihkan secara eksplisit

- Dedup (baris identik), type-cast (tanggal → ISO, angka → number), tangani
  null (buang / isi dengan alasan, WAJIB dicatat jumlah yang dibuang).
- Simpan hasil bersih sebagai file terpisah (`data-clean.csv`), JANGAN
  menimpa file mentah.

## 3. Hitung via script, bukan di kepala

- Tulis script `node` kecil di `code/analyze.js` yang membaca file mentah dan
  mencetak angka. Jalankan dengan `run_command node code/analyze.js`.
- Script harus re-runnable: input = path file, output = tabel/JSON angka.
  Satu angka di laporan = satu baris di script.

## 4. Statistik yang jujur

- Laporkan n, mean/median, dan spread (std/IQR), bukan mean saja.
- Korelasi ≠ kausalitas. Selisih kecil pada n kecil = "belum ada bukti",
  bukan "tren naik".
- Missing data membiaskan: sebutkan arah bias yang mungkin.

## 5. Temuan → laporan

Format `reports/`: (1) temuan utama max 3, masing-masing SATU angka kunci;
(2) metodologi singkat (sumber, pembersihan, script dipakai); (3) caveat.
Angka tanpa asal-usul = tidak boleh masuk laporan.
