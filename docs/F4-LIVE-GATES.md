# F4 Live Gates — dua langkah terakhir (99% kode selesai)

Semua mekanika F4 sudah terpasang dan teruji otomatis. Yang tersisa adalah
dua gerbang yang secara definisi butuh provider live + keputusan manusia.
Estimasi total: 30-60 menit. Studio harus sudah dideploy ulang (D77+D78).

## Gate 1 — Blind test persona (P1-PER-5, target ≥80%)

1. Studio web → menu **Persona Studio** → tab **Blind test**.
2. Pilih 3-5 persona yang paling sering dipakai (mis. Maestro, Hiro, Neo,
   Poe) + prompt uji mana pun. **Start run**. Tunggu semua jawaban selesai
   (polling otomatis, ±1-3 menit tergantung model).
3. Baca jawaban anonim A/B/C/…, tebak penulis tiap jawaban dari gaya +
   prosesnya (bukan konten saja), **Submit guesses**.
4. Lulus = skor ≥80%. Catat hasilnya (mis. screenshot) sebagai bukti.

Kalau <80%: persona yang tertukar menandakan PERSONA.md mereka terlalu
mirip — pertajam bagian "How you work" (urutan langkah, alat yang disebut
pertama, format output khas), lalu run ulang prompt yang sama. Gerbang ini
justru alatnya menemukan mana persona yang perlu dipertegas.

## Gate 2 — Misi riset nyata → skill ready → assign (ROADMAP #9)

1. Studio web → **Persona Studio** → tab **Missions** → kartu
   *Riset dokumentasi Phaser* (persona yui-scholar) → tombol **Run**.
   Perlu research provider aktif (settings → provider) agar `web_search`
   jalan; tanpa itu mission masih bisa lulus dari materi Materials yang
   di-upload.
2. Setelah run selesai dan acceptance terpenuhi, scholar mengusulkan skill
   `phaser-basics` → tab **Skills** (menu utama) → review draft →
   **Accept** (status jadi ready).
3. Buat/buka project nyata → **Team/Roster** → assign yui-scholar ke
   project itu; readiness menampilkan skill `phaser-basics` (bukan
   kosong). Bukti end-to-end: arena latihan menghasilkan persona yang
   benar-benar dipakai kerja.

Setelah dua gerbang ini tercapai, tandai F4 100% di `docs/FEATURES.md`
(1.5 sisa → 0) dan lanjut ke F5 (publish prep).
