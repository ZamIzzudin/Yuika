# 🧭 GRAND TOUR — Your-Yui dev-10

> **SATU alur cerita menguji SEMUA fitur besar sekaligus.** Tidak perlu
> membersihkan data di tengah jalan — babak pamungkasnya justru fitur
> **hapus project** yang sekaligus jadi pembersih akhir. Tanpa spoiler:
> ceritanya adalah meluncurkan sebuah produk mini end-to-end dengan tim
> persona, lalu menutup proyeknya dengan rapi.
>
> Format laporan: `GT-<babak>.<langkah> ✅/❌ — <yang terjadi>`
> Prasyarat: **restart dev server** (core banyak berubah), lalu buka
> http://localhost:3000.

---

## Babak 1 — Studio dibuka (project & persona)

1. Buat project baru: nama **"Petualangan Kopi Nusantara"** (apapun boleh),
   deskripsi bebas.
2. Di kartu persona tengah layar, perhatikan **badge growth** di setiap kartu
   (mis. "Baru · 3 turn") — termasuk kartu **Yui Planner** (bentuk ⭐).
3. Pilih **Yui Conductor** sebagai lead → sesi chat terbuka.
4. Sidebar kiri: tombol hanya **Dungeon** & **Pengaturan** (Trace sudah pindah
   jadi tab). Baris tab di atas chat: `Chat · 🧭 Trace · Tim · File · Papan ·
   Pohon · Roster · Sesi · Memori · Skill`.
5. Klik tab **🧭 Trace** → panel trace terbuka (hint bila belum ada turn).

## Babak 2 — Planning (Planner + consult) — M10

1. Kembali ke tab Chat, ganti persona via dropdown ke **Yui Planner**.
2. Kirim brief besar:
   > "Rencanakan landing page brand kopi: 3 varian produk, cerita petani,
   > newsletter. Tim kecil, budget hemat, jalan 2 minggu. Mulai dari rencana."
3. Biarkan Planner bekerja. Yang diharapkan: Planner bertanya/menulis asumsi
   (bukan langsung eksekusi) dan memanggil **consult** → kartu delegasi
   2–3 persona (Scholar/Analyst/Scribe) berjalan paralel.
4. Setelah consult selesai → Planner mensintesis; lalu minta ia menulis
   dokumen perencanaan → cek tab **File**: `docs/PLAN.md` ada (scope,
   keputusan, risiko).
5. Minta Planner menyusun task list → tab **Papan**: task dengan assignee
   persona, ada task verifikasi.
6. (Negatif) suruh Planner "langsung delegasikan coding ke Coder" → ia
   menolak/mengarahkan kembali (tanpa delegate_task, by design).

## Babak 3 — Eksekusi (Conductor + delegasi + trace + metering)

1. Ganti persona ke **Conductor** (sesi baru). Minta: "Eksekusi rencana dari
   docs/PLAN.md — delegasikan task ke persona yang tepat."
2. Amati kartu delegasi (Coder/Designer) di chat + tab **Tim** (org-chart
   hidup). Buka tab **🧭 Trace**: langkah per turn (🧠 model, 🔧 tool, 🤝
   delegasi) dengan status & token.
3. Settings → **Metering/Usage**: panggilan tiap persona tercatat rapi
   (termasuk anak delegasi & consult). Cek **saldo/burn-rate** bila aktif.

## Babak 4 — Persona yang tumbuh (fitur baru batch ini) — M13

1. Chat dengan **Scholar** (sesi baru). Sebutkan preferensi jelas, mis.:
   > "Catat: aku selalu mau sumber ditulis gaya APA dan perbandingan biaya
   > dalam tabel, bukan narasi."
   → harapkan Scholar memanggil `memory_append` scope **domain**.
2. Tab **Memori** (atau editor memori): muncul file domain `research`
   (lintas project) berisi catatan itu — USER.md & MEMORY.md tetap terpisah.
3. Buat sesi **Scholar** BARU di project BERBEDA (atau workspace global):
   minta riset kecil → jawabannya memakai preferensi tabel/APA tadi **tanpa
   Anda mengulang** (recall domain frozen di sesi baru).
4. Kartu persona: badge **growth naik** setelah turn selesai (turn done →
   level; lihat tooltip sesi/task/turn). Progress bar menuju level berikut.
5. (Kebijakan) domain memory TIDAK ikut mati saat project dihapus —
   diverifikasi di Babak 6 langkah 4.

## Babak 5 — Keamanan (approval & redaction) — M11

> Set `YUI_APPROVAL_TIMEOUT_MS=30000` di `.env` + restart sebelum babak ini
> (atau pakai default 5 menit dan kembali lagi nanti).

1. Minta Coder menjalankan `node script.js` (buat script kecil dulu via
   chat) → kartu approval muncul → **jangan dijawab**, tunggu deadline.
   → kartu expired, turn lanjut fail-closed (tool ditolak, bukan menggantung).
2. Ulangi, jawab "Setujui" → jalan normal tanpa expiry ganda.
3. Redaction: taruh file `kunci.txt` berisi `API_KEY=supersecretvalue123`
   di workspace project, minta agent membacanya → isi di chat
   `API_KEY=«redacted»`; kata normal ("skrip", "token usage: 12") tetap utuh.

## Babak 6 — Penutupan: hapus project = bersih-bersih (M9)

1. Pastikan semua yang ingin Anda lihat sudah dilihat — babak ini final.
2. Sidebar project → tombol ✕ (hover) → konfirmasi 2-langkah merah.
3. Ringkasan hasil muncul: sesi & event, task, file project, revisions —
   jumlah per kategori; **usage ledger dipertahankan** (akuntansi jujur),
   **skill persona dipertahankan**.
4. Verifikasi pasca-hapus: project hilang dari sidebar; file workspace
   project hilang; **memori domain persona tetap ada** (Babak 4 langkah 5);
   Usage/Metering tetap memuat riwayat (baris jadi historis).
5. Selesai — data bersih, siap Grand Tour berikutnya tanpa sisa-sisa.

---

## Ringkas hasil test

| Babak | Fitur yang diuji | Rujukan detail |
|---|---|---|
| 1 | project, persona picker+growth badge, struktur tab, trace tab | TEST-PLAN M1/M8.2 |
| 2 | Planner, consult paralel, PLAN.md, task list | TEST-PLAN M10 |
| 3 | Conductor, delegasi, TeamTree, trace, metering | TEST-PLAN M2/M4/M8.2 |
| 4 | memory domain, recall lintas project, growth level | TEST-PLAN M13 |
| 5 | approval timeout, redaction secrets | TEST-PLAN M11 |
| 6 | hapus project + kebijakan artefak | TEST-PLAN M9 |
