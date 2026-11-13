# Contoh prompt lengkap untuk Picasso

Rencana desain yang buruk hampir selalu karena brief kosong ("desain dashboard
dong") - Picasso terpaksa menebak, dan hasilnya generik. Formula yang berhasil:
**konteks produk + kontrak proses (skill dibuka dulu) + aturan angka keras +
satu layar per turn**.

## Kapan buat project baru

Buat project baru (atau minimal minta file desain baru) bila:
- Session lama penuh percakapan kegagalan - model jangkar pada pola buruknya.
- File desain lama berisi hasil sampah - revisi di atasnya membawa beban.

Project baru = konteks bersih + file desain bersih. Prompt di bawah jadi
pesan PERTAMA ke Picasso di project itu.

## Prompt template (copy-paste, ganti bagian [kurung siku])

```
Konteks produk:
- Produk: [nama + satu kalimat apa ini, mis. "BukuKas, app pencatatan keuangan UMKM"]
- Audiens: [siapa pemakainya, mis. "pemilik warung 30-45 tahun, bukan orang teknis"]
- Platform: web desktop 1440 (atau mobile 390 - pilih SATU)
- Layar yang dibutuhkan (urut prioritas):
  1. [layar utama, mis. "dashboard ringkasan: saldo, arus kas 30 hari, transaksi terbaru"]
  2. [layar kedua]
  3. [layar ketiga]
- Vibe: [1-3 kata, mis. "tenang, bersih, terpercaya seperti bank digital"]
- Brand: [warna/font existing, atau "bebas dari style pack"]

Kontrak proses (WAJIB, jangan langkah):
1. Buka TIGA skill via skill_view SEBELUM mendesain: design-taste,
   design-style-library, ui-polish-craft. Kerjakan sesuai isi skillnya,
   bukan dari ingatan.
2. Sebelum menggambar, keluarkan one-line design read (product kind,
   audience, vibe, pack yang dipilih). Kalau arah masih ambigu, tanya
   SATU pertanyaan saja.
3. Pilih SATU style pack dari design-style-library, sebut nama + alasan
   satu baris. Pakai token pack APA ADANYA: palette, font, radius, spacing.
   Brand ku ada -> brand menang, pack hanya dipinjam strukturnya.
4. Buat file desain baru bernama "[Produk] Redesign v1". Kerjakan SATU
   LAYAR dulu (layar nomor 1). Selesai -> BERHENTI, minta reviewku,
   jangan lanjut layar kedua sebelum kubilang oke.

Aturan eksekusi (angka keras, melanggar = revisi):
- Grid 8px: semua spacing/padding kelipatan 8 (4 hanya untuk nudge optik).
- Konten tidak menempel tepi: margin layar 24 (desktop) / 16 (mobile),
  padding kartu dan panel 16-24.
- Padding sibling identik: semua kartu sebaris pakai padding yang sama.
- Dua gap per kontainer: dalam-grup 8-12, antar-grup 24-32; antar-grup
  HARUS terasa lebih besar dari dalam-grup.
- Satu primary action per layar, paling menonjol; sisanya lebih diam.
  Hierarki maksimal 3 level.
- Copy asli yang masuk akal untuk audiensku (bahasa mengikuti produk),
  DILARANG lorem ipsum, DILARANG emoji sebagai ikon/dekorasi.
- Ikon garis sederhana (stroke konsisten), bukan simbol penuh.
- Tiap layar punya SATU signature idea (bento, split hero, editorial
  column) - dilarang grid 3 kartu seragam ikon+judul+teks.

Mulai dari langkah 1 sekarang.
```

## Pola revisi setelah layar pertama jadi

Review satu layar, kirim catatan SPESIFIK ANGKA, sebut skill bila perlu:

```
Revisi layar 1 (jangan ubah yang lain):
- Kartu "Arus kas" nempel tepi; beri margin layar 24 dan padding kartu 20.
- Jarak antar kartu (8) terasa sama dengan jarak antar seksi; naikkan
  antar-seksi ke 32.
- Primary action sekarang ada 3; sisakan 1 tombol solid, sisanya ghost.
Setelah revisi, berhenti lagi untuk review.
```

Kenapa satu layar per turn: (a) review dini mencegah sampah terlipatgandakan
ke layar berikutnya; (b) iteration budget dipakai untuk satu layar penuh
bukan tiga layar setengah jadi.

## Setelah semua layar oke

- Minta QA mandiri: "jalankan checklist ui-polish-craft untuk semua layar,
  laporkan temuan sebelum aku cek sendiri."
- Handoff ke Hiro: "serahkan ke Hiro dengan design-to-code-handoff" -
  Picasso akan menyiapkan token + struktur untuk diterjemahkan jadi kode.
- Ekspor ke Figma (bila MCP Figma aktif): minta via skill figma-authoring.
