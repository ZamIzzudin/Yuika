# TEST PLAN — Batch Dev-10 (fitur sejak fix #3, belum diuji user)

> Dokumen ini = skema testing lengkap untuk **semua fitur yang belum Anda uji**.
> Fix batch #1–#3 (s/d commit `13068e7`) sudah Anda konfirmasi — tidak diulang di sini,
> hanya dicek regresinya singkat (Batch M6).
>
> Skenario L di `TEST-SCENARIO-DEV9.md` sudah diperluas & digantikan dokumen ini.

## Batch yang belum diuji (5 commit, 9 fitur)

| Batch | Fitur | Commit | Prioritas | Est. waktu |
|---|---|---|---|---|
| M1 | Approval persist (P0-DATA-3) | `5a1ccf6` | **P0** | 10 mnt |
| M2 | MCP reconnect otomatis (P0-MCP-1) | `5a1ccf6` | **P0** | 10 mnt (+opsional 8 mtn) |
| M3 | Dungeon + lifecycle skill + gating (DUN-1/2/3/5) | `7a238cc` `306313c` | **P1 inti** | 30–45 mnt |
| M4 | Persona Analyst & Operator (PER-6) | `e12a3d5` | P1 | 15 mnt |
| M5 | Smoke test model (MDL-2) | `6ea3b6f` | P1 | 10 mnt |
| M6 | Regresi cepat area tersentuh | — | P1 | 5 mnt |

**Total: ±80–95 menit** (M3 paling lama karena menunggu LLM bekerja).

---

## 0. Persiapan (WAJIB — 2 menit)

1. **Restart dev server** (`npm run dev`). Semua batch ini menyentuh `@yui/core`
   — quirk runtime singleton: perubahan core TIDAK ter-apply via HMR.
2. Pastikan `.env` punya `YUI_API_KEY` aktif (M3/M4/M5 memanggil model sungguhan).
3. **Jangan** `npm run data:clean` — M1 butuh approval yang menggantung lintas
   restart, dan dungeon run lama (bila ada) ikut terhapus.
4. Siapkan 1 file kecil untuk M4: `contoh-data.csv` berisi ~10 baris, kolom
   `nama,kategori,jumlah`. (Buat manual di Notepad bila perlu.)

Format laporan per kasus: `M1.1 ✅` / `M1.2 ❌ — <yang terjadi>`.

---

## Batch M1 — Approval persist (P0-DATA-3)

> Yang diuji: approval tercatat di SQLite, bertahan restart, dan
> "Setujui & ingat" diingat lintas restart.

- [ ] **M1.1 (P0) — Approval kedaluwarsa saat server direstart**
  1. Buat sesi persona **Coder** (atau persona lain punya `run_command`).
  2. Kirim: `jalankan node -e "console.log(42)"` → muncul **kartu approval**
     (tool `run_command`).
  3. **JANGAN klik apa pun.** Matikan dev server (Ctrl+C), nyalakan lagi.
  4. Buka kembali sesi yang sama → refresh browser.
  - ✅ Kartu approval berubah **"Kedaluwarsa — server direstart saat menunggu"**
    (bukan error, bukan kartu yang masih bisa diklik).
  - ✅ Chat tetap bisa dipakai untuk turn baru.

- [ ] **M1.2 (P0) — "Setujui & ingat" bertahan restart**
  1. Minta agent menjalankan perintah `node` lagi → kartu approval muncul.
  2. Klik **"Setujui & ingat"** → perintah jalan.
  3. Restart dev server, refresh browser.
  4. Minta `node` lagi di sesi yang sama.
  - ✅ TIDAK muncul kartu approval lagi — perintah langsung jalan
    (keputusan diingat dari DB, bukan memori proses).

- [ ] **M1.3 (P1) — Approval biasa tetap normal**
  1. Minta perintah `node` baru → kartu muncul → klik "Tolak".
  - ✅ Perintah dibatalkan dengan pesan rapi; minta lagi → kartu muncul LAGI
    (tolak tidak diingat permanen, hanya "setujui & ingat").

---

## Batch M2 — MCP reconnect otomatis (P0-MCP-1)

> Yang diuji: server MCP mati → terdeteksi → tools dilepas → reconnect backoff;
> 5× gagal → parkir + tombol retry.

- [ ] **M2.1 (P0) — Mati → "sambung ulang…" → hidup lagi otomatis**
  1. Panel MCP (Settings → MCP): pastikan satu server **connected**
    (mis. `tailscale` in-repo).
  2. Buka Task Manager → cari proses anak server MCP (node yang menjalankan
     `mcp-servers/.../index.mjs`) → **End task**.
  3. Lihat panel MCP (refresh bila perlu).
  - ✅ Badge berubah **"sambung ulang… (Ns)"** — N turun mundur (backoff
    2→5→15→60 dtk) dan alat MCP hilang dari toolset agent.
  4. Tunggu hitungan habis (maks 60 dtk) — reconnect otomatis.
  - ✅ Kembali **connected** dan tools MCP bisa dipakai lagi
    (minta agent `ts_status` bila Tailscale ter-bind).

- [ ] **M2.2 (P1) — Health check: hang tanpa crash ikut terdeteksi**
  - Cukup amati 30–60 dtk: server yang hidup tapi diam (zombie) juga
    ditandai turun oleh ping berkala — badge tidak bohong "connected".
  - ✅ (informasional — tak perlu aksi khusus)

- [ ] **M2.3 (P2, opsional — butuh ±8 menit) — Parkir setelah 5× gagal**
  1. Ulangi M2.1, tapi JANGAN hidupkan server lagi; biarkan retry berjalan
     sampai ke-5 (total ±7 menit: 2+5+15+60+300 dtk → ganti jadi coba lagi cepat).
  - ✅ Badge **"parkir — 5× gagal"** + `lastError` tampil; retry berhenti
    (tidak spam permintaan).
  2. Hidupkan/klik **↻** → coba lagi langsung (tanpa menunggu backoff).

---

## Batch M3 — Dungeon (halaman terpisah) + lifecycle skill + gating (DUN-1/2/3/4/5) — INTI

> Yang diuji: Dungeon kini **HALAMAN TERPISAH** (tombol ⚔ Dungeon di sidebar,
> bukan di tab Skill). Anda bisa MEMBUAT latihan sendiri: pilih persona, mode
> riset mandiri ATAU upload bahan ajar → persona belajar → skill draf →
> diterima (tested) → eval buta (ready) → roster gating ikut berubah.

### Bagian 1 — Halaman Dungeon & misi bawaan (DUN-1 + DUN-4)

- [ ] **M3.1 (P0) — Halaman Dungeon terbuka & misi seed tampil**
  1. Sidebar → tombol **⚔ Dungeon** (di atas ⚙ Pengaturan).
  - ✅ Halaman "Dungeon — arena latihan persona" terbuka (main berganti,
    sidebar tetap). Ada form "Buat latihan baru" + list **Latihan bawaan**
    berisi "Riset dokumentasi Phaser".
  2. Cek `workspace/dungeons/phaser-research/mission.yaml` ada.

- [ ] **M3.2 (P0) — Buat latihan sendiri: MODE RISET MANDIRI**
  1. Form: pilih persona (mis. **Scholar**) → nama skill `tailwind-spacing` →
     deskripsi singkat → mode **🔍 Riset mandiri** → (opsional isi URL awal) →
     kriteria lulus biarkan default → **Buat & latih**.
  - ✅ Kartu baru muncul di **Latihan Anda** (badge persona, skill target),
    `workspace/dungeons/tailwind-spacing/mission.yaml` dibuat.
  2. Klik **Jalankan** → "berjalan…" → tunggu selesai.
  - ✅ Status **"✓ selesai"** + ringkasan; file kerja HANYA di folder misi
    (sandbox terisolasi — tidak bocor ke workspace produksi).

- [ ] **M3.3 (P0) — MODE BAHAN AJAR: upload file → persona pelajari**
  1. Siapkan file bahan (mis. `panduan-css.md` berisi materi apa pun).
  2. Form: persona **Scribe** → skill `css-panduan-internal` → mode **📚 Bahan
     ajar (file)** → **Buat latihan**.
  3. Di kartu misi → **⬃ Bahan ajar** → pilih file → unggah.
  - ✅ Chip `materials/panduan-css.md` muncul di kartu (tercatat sebagai
    sumber misi di mission.yaml).
  4. **Jalankan** → tunggu selesai.
  - ✅ Persona membaca file tsb (read_file/doc_read) dan skill hasilnya
    merangkum ISI FILE (cek draf skill di tab Skill).

- [ ] **M3.4 (P1) — Hapus latihan & guard 1 run aktif + restart sweep**
  1. Jalankan misi → saat "berjalan" klik Jalankan lagi → ditolak "sedang
     berjalan". 🗑 pada latihan user → terhapus dari list & disk.
  2. Restart dev server saat misi berjalan → refresh.
  - ✅ Status berubah "✕ gagal — server direstart saat misi berjalan".
  3. **BOOT HEAL sesi chat (baru):** restart server saat TURN CHAT/delegasi
     berjalan (persona "berpikir") → refresh.
  - ✅ Chip persona kembali **idle** (bukan "berpikir" selamanya) + muncul
     pesan "Turn sebelumnya terputus — dev server direstart…"; kartu delegasi
     anak menutup dengan "_(terputus — server direstart…)_; composer aktif
     kembali. Terminal server mencetak `[yui:heal] N turn terputus ditutup`.

### Bagian 2 — Lifecycle skill (DUN-2 + DUN-3)

- [ ] **M3.5 (P0) — Misi menghasilkan DRAF skill**
  1. Setelah M3.2/M3.3 selesai, buka project apa pun → tab **Skill**.
  - ✅ Ada draf dari misi (nama = skill target). Persona pemilik & "draft".
  2. Buka draf → isi body = prosedur hasil praktik (bukan teori kosong).

- [ ] **M3.6 (P0) — Terima draf → status "tested"**
  1. Klik **Terima** pada draf.
  - ✅ Pindah ke "Siap pakai" dengan chip **"◐ diuji manusia"**.

- [ ] **M3.7 (P0) — Eval buta → verdict**
  1. Klik tombol **"Eval buta"** pada skill tested tadi.
  - ✅ Chip **"◐ evaluasi buta berjalan… (hakim sedang memeriksa bukti)"**;
    tombol disabled. (5–10 menit — hakim membaca bukti di folder misi.)
  2. Setelah selesai, salah satu:
  - ✅ **"✓ lulus eval buta"** → chip status jadi **"✓ siap"** (ready); ATAU
  - ✅ **"✕ belum lulus — <alasan konkret>"** → status tetap "◐ diuji manusia",
    tombol Eval buta bisa diklik lagi.
  3. Cek `packages/skills/…` atau folder data skill: ada file `.eval.json`
    (verdict + alasan + judgeSessionId).

### Bagian 3 — Gating roster (DUN-5)

- [ ] **M3.8 (P0) — Roster menampilkan readiness per fase**
  1. Buka project apa pun → tab **Roster** → assign persona dengan fase
    (mis. Scholar, role "peneliti", fase `research`).
  - ✅ Baris roster menampilkan chip **`research ✓`** ( Scholar punya skill
    research siap: web-research / phaser-basics) — hover = nama skillnya.
  2. Assign persona TANPA skill fase tsb (mis. Coder + fase `design`).
  - ✅ Chip **`design ✕`** merah — hover = saran "latih persona di Dungeon".
  3. Jika M3.7 lulus: persona pemilik skill latihan kini siap di fasenya —
    chip ✓ konsisten dengan inventory.

---

## Batch M4 — Persona Analyst & Operator (PER-6)

- [ ] **M4.1 (P0) — 7 persona muncul + bentuk Orin benar**
  1. Refresh → persona picker.
  - ✅ 7 persona: Conductor, Scholar, Scribe, Coder, Designer, **Analyst**,
    **Operator**.
  2. Pilih **Analyst** → maskot Orin **bentuk diamond**; pilih **Operator** →
    **bentuk hex**. (Warna beda dari 5 persona lama.)

- [ ] **M4.2 (P0) — Analyst: doc_read + analisis CSV**
  1. Buat project → tab File → **⬆ Upload** `contoh-data.csv`.
  2. Sesi persona **Analyst**, minta: `analisis file contoh-data.csv di uploads — berapa baris per kategori?`
  - ✅ Memakai `doc_read` (bukan read_file mentah) membaca CSV.
  - ✅ Menulis script kecil di `code/` lalu `run_command node …` → **kartu
    approval muncul** untuk perintah (disiplin approval tetap jalan).
  - ✅ Jawaban menyebut jumlah baris/missing data secara eksplisit
    (PERSONA.md: inspeksi dulu, angka reproducible).

- [ ] **M4.3 (P1) — Operator: gaya verifikasi + MCP**
  1. Sesi persona **Operator**:
     `cek status tailscale` (asumsi Tailscale MCP di-trust & binding di roster).
  - ✅ Memakai tool `ts_status` / `ts_serve_status` (binding `mcp__*`), dan
    MENUTUP jawaban dengan bukti ("Selesai. Verifikasi: …"), bukan janji.
  2. Jika Tailscale tidak dipasang: minta `list_files` + ringkas isi folder —
    cukup untuk melihat gaya kerjanya (read-before-run).

- [ ] **M4.4 (P0) — Delegasi ke persona baru sah**
  1. Sesi **Conductor** di project: `minta yui-analyst menghitung jumlah baris uploads/contoh-data.csv di project ini`.
  - ✅ Delegasi jalan (node baru di tab Tim), TANPA error "persona tidak dikenal"
    (typo lama `yui_designer` juga sudah diperbaiki — Designer kini sah pula).

---

## Batch M5 — Smoke test model (MDL-2)

- [ ] **M5.1 (P0) — Tombol "Uji semua model"**
  1. Settings → seksi model → klik **"Uji semua model"**.
  - ✅ Daftar model aktif (default + fallback + route tiap persona) muncul
    dengan badge **✓/✕ + latensi** (mis. `✓ glm/glm-5.1 · 3.2s`).
  2. Setiap model ✓ = tool-call 2 langkah benar-benar lulus
    (bukan sekadar ping HTTP).

- [ ] **M5.2 (P0) — Model rusak → fallback otomatis aktif**
  1. Settings → isi kolom model default dengan nama **yang salah** (mis.
    `glm/model-hantu`) → simpan (blur).
  - ✅ Smoke otomatis jalan di background setelah simpan provider/model.
  2. Buka kembali seksi model → hasil: `✕ glm/model-hantu …` + keterangan
    **"fallback otomatis aktif"**.
  3. Chat 1 turn → tetap dapat jawaban (router memakai fallback karena model
    utama di-cap unhealthy 5 menit).
  4. **Pulihkan**: kembalikan nama model benar → "Uji semua model" → ✓ kembali.
  - ✅ Setelah lulus, model utama dipakai lagi (cooldown dibersihkan).

---

## Batch M6 — Regresi cepat area yang tersentung (5 menit)

- [ ] **M6.1** Tab File: klik file → tetap terbuka + revisi/diff jalan
  (fix #3 tidak regresi oleh perubahan TaskDrawer/roster).
- [ ] **M6.2** Tab Tim: hold-drag pan + Ctrl+scroll zoom tetap jalan.
- [ ] **M6.3** Settings → "Model per persona": blur-save masih tersimpan
  (panel smoke baru tidak merusak editor lama).
- [ ] **M6.4** Chat biasa 1 turn persona lama (mis. Scribe) — jalan normal.

---

## Format laporan balik

Cukup salin & isi:

```
M1.1 ✅   M1.2 ✅   M1.3 ✅
M2.1 ❌ — <yang terjadi>   M2.2 ✅   M2.3 (skip)
M3.1 ✅ … M3.7 ✅
M4.1 ✅ … M4.4 ✅
M5.1 ✅   M5.2 ✅
M6.1–M6.4 ✅
```

Prioritas kalau waktu mepet: **M1.1 → M2.1 → M3.1–M3.3 → M3.5–M3.7 → M5.2**
(sisanya menyusul) — itu tulang punggung reliabilitas + alur dungeon penuh.

## Batch M7 — Metering ledger (P1-CRED-1) — BARU dev-10

> Yang diuji: setiap panggilan model tercatat jujur (tanpa estimasi) — angka
> hanya muncul bila provider melapor usage. Panel: ⚙ Pengaturan → Metering.

- [ ] **M7.1 (P0) — Turn chat ter-meter**
  1. Restart dev server (tabel baru dibuat otomatis di db).
  2. Kirim 1–2 turn chat biasa (apa pun).
  3. Buka ⚙ Pengaturan → **Metering**.
  - ✅ "N panggilan model · X token masuk · Y token keluar" muncul (>0);
    tabel per persona berisi persona yang dipakai; tabel per model berisi
    model aktif; feed "Terbaru" menampilkan latensi.
  - ❌ Bila 0 terus padahal chat jalan → provider tidak mengirim usage
    (laporkan — jangan sampai metering diam-diam kosong).

- [ ] **M7.2 (P1) — Delegasi: persona anak ikut tercatat**
  1. Di project, minta Conductor mendelegasikan ke spesialis (mis. Scholar).
  2. Setelah selesai, cek panel Metering.
  - ✅ Baris persona anak (mis. scholar) muncul dengan panggilan & token
    sendiri — attribution per persona akurat.

- [ ] **M7.3 (P2) — Rentang & konsistensi**
  1. Tombol "1 jam" → hanya event ≥1 jam; "Semua" → total ≥ sebelumnya.
  2. `curl localhost:3000/api/usage` → JSON summary sama dengan panel.

- [ ] **M7.4 (P2) — Indikator biaya (P1-MDL-3)**
  1. Setelah M7.1, buka Metering → klik "Harga model (indikator biaya)".
  2. Isi harga model aktif (mis. masuk 0.6 / keluar 2.2 per 1 jt, USD) —
     klik di luar input.
  - ✅ Kolom "Est. biaya" per model & total di atas terisi angka ≠ "—";
     kembali lagi setelah refresh tetap tersimpan (model-prices.json).
  3. Kosongkan harga → kolom kembali "—" (bukan 0).

### M7.5 (P1-CRED-2/3/4) — Budget, admission control & rate limit
> Prasyarat: M7.4 lolos (harga model terisi — angka saldo butuh price book).
> Restart dev server sekali sebelum batch ini.

1. Buka Settings → Metering → panel **Saldo & Batas** (paling atas).
  - ✅ Terlihat: belanja Hari ini & Total (dengan bar bila limit diset),
     burn-rate/jam (rata² 24 j), hold aktif; mode default "warn", semua limit
     "— tanpa batas".
  - ✅ Bila ada model belum dihargai: hint "angka = batas bawah (jujur)".

2. **Mode block + limit harian**: set "Limit harian" ke angka KECIL di bawah
   belanja hari ini (mis. 0.001) → ganti mode ke "block".
  - ✅ Kirim chat apa pun → muncul pesan merah "Budget harian … tercapai — turn
     DITOLAK (mode block)" dan TIDAK ada panggilan model (cekan cepat: jumlah
     panggilan di metering tidak bertambah).
  - ✅ Panel menunjukkan bar merah 100% + badge limit-hit.
3. Kembalikan mode ke **"warn"** → kirim chat lagi.
  - ✅ Turn TETAP jalan; sebelum jawaban muncul chip "⚠ Budget … (mode warn)".
4. Kosongkan "Limit harian" (input kosong → blur) → chat normal tanpa warning.
5. **Rate limit**: set "Turn / menit" = 2 → kirim 3 turn cepat berturut-turut.
  - ✅ Yang ke-3 ditolak: "Rate limit workspace tercapai (2 turn/menit)".
     Kosongkan kembali untuk test lanjutan.
6. **Cap delegasi**: set "Delegasi paralel" = 1 → minta Conductor mendelegasi
   2 persona sekaligus dalam satu prompt.
  - ✅ Delegasi kedua ditolak dengan pesan "batas delegation paralel (1)
     tercapai — atur di Settings → Metering"; kembalikan ke kosong/2 setelahnya.
7. **Attribution matrix**: pastikan sudah pernah pakai ≥2 persona dengan model
   berbeda (mis. override model satu persona di Settings → Provider) → buka
   Metering.
  - ✅ Tabel "Attribution biaya (persona × model)" muncul: baris per kombinasi,
     token & est. biaya; model tanpa harga = "—".
8. Refresh halaman → semua setting budget tetap (data/budget.json).

### M8.1 (P2) — Multi-provider: adapter Anthropic & Gemini (P1-INF-2)
> Tanpa key Anthropic/Gemini pun bisa diverifikasi sebagian (UI & persist);
> bagian streaming butuh key masing-masing (opsional).

1. Settings → Provider & Model → dropdown **Jenis provider** muncul
   (OpenAI-compatible / Anthropic / Gemini) — saat ini "OpenAI-compatible".
  - ✅ Ganti ke "Anthropic" → placeholder Base URL berubah
     (https://api.anthropic.com) → tombol Simpan aktif → simpan.
  - ✅ Buka Settings lagi / refresh → jenis tetap "Anthropic" (.env:
     YUI_PROVIDER_KIND).
  - ✅ Terminal tidak error; smoke test model jalan (gagal = wajar bila key
     bukan Anthropic — pastikan pesan gagal rapi, lalu kembalikan ke
     OpenAI-compatible + baseUrl GLM & model glm-5.1 → simpan → smoke hijau
     kembali, chat normal).
2. (Opsional, butuh key Anthropic) jenis Anthropic + key `sk-ant-…` + model
   `claude-sonnet-4-5` → kirim chat:
  - ✅ Streaming jawaban jalan; minta persona memakai tool (mis. tulis file) →
     tool-call dieksekusi; Metering mencatat token (usage Anthropic terparse).
3. (Opsional, butuh key Gemini) jenis Gemini + key AI Studio + model
   `gemini-2.5-flash` → sama seperti langkah 2 (tool-call + metering).

### M8.2 (P2) — Trace view per turn (P1-INF-4)
> Prasyarat: minimal satu sesi dengan ≥2 turn (ada tool-call lebih bagus,
> mis. minta persona menulis file / Conductor mendelegasi).

1. Buka sesi chat apa pun → tombol **Trace** di sidebar (aktif setelah sesi
   dipilih).
  - ✅ Panel "🧭 Trace sesi" terbuka; daftar turn TERBARU di atas dengan status
     (selesai/berjalan/error), jam mulai→selesai, ringkasan "N langkah · M×
     model · X+Y tok".
2. Buka (expand) satu turn.
  - ✅ Langkah kronologis: 🧠 panggilan model (nama model + durasi ms), 🔧 tool
     (nama + argumen ringkas), 🤝 delegasi, ❌ error bila ada.
3. Kirim chat baru → biarkan berjalan → panel Trace terbuka.
  - ✅ Turn baru muncul dengan status "berjalan…" ter-expanse & langkah
     bertambah otomatis (poll 3 dtk) tanpa refresh.
4. Bandingkan token per turn di Trace vs angka di Settings → Metering.
  - ✅ Konsisten (sumber sama: ledger).
5. Tombol "← Kembali ke chat" menutup panel; chat state tidak hilang.

### M8.3 (P2) — Model aux & provider settings (P1-INF-3)
1. Settings → Provider & Model → field baru **"Model aux"** (di bawah fallback).
  - ✅ Isi model murah (mis. `glm/glm-5-flash`) → Simpan → buka Settings lagi /
     refresh: tetap terisi (.env YUI_AUX_MODEL).
2. Kirim satu turn yang memakai tool (mis. minta tulis file) — learn nudge jalan
   pasca-turn.
  - ✅ Terminal `[yui:trace] nudge …` tetap muncul; Settings → Metering: muncul
     baris model aux (panggilan nudge kini ter-meter — dulu tak tercatat).
3. Kosongkan Model aux → Simpan → refresh.
  - ✅ Field kosong; .env baris YUI_AUX_MODEL hilang; nudge berikutnya pakai
     model utama (Metering: tidak ada lagi baris model aux).
4. (Bonus regression) kosongkan juga Model fallback → Simpan → restart server.
  - ✅ Fallback tetap kosong (dulu: nilai lama "hidup lagi" dari .env).

### M9 (P1) — Hapus project + bersih artefak (P1-PRJ-8)
> Siapkan: project "Uji Hapus" berisi ≥1 sesi dengan turn (biar ada event), ≥1
> task, 1 file via tab File/upload, dan biarkan persona mencatat sesuatu sekali
> (memory project). Project lain biarkan tetap ada sebagai pembanding.

1. Sidebar Proyek → hover baris "Uji Hapus" → tombol ✕ muncul di kanan.
  - ✅ Klik ✕ → kotak konfirmasi merah muncul (bukan langsung hapus), berisi
     penjelasan apa yang dihapus & catatan "skill & metering tetap tersimpan".
2. Klik "Batal" → konfirmasi tertutup, project masih ada.
3. Klik ✕ lagi → "Hapus permanen".
  - ✅ Project lenyap dari daftar; muncul ringkasan "… dihapus — N sesi, M task,
     file & memory project dibersihkan…".
4. Verifikasi artefak benar-benar bersih:
  - ✅ Workspace folder `workspace/projects/<id-project>` hilang (cek file
     explorer); sesi project tak lagi muncul; tab Task/Papan project 404/error
     wajar.
5. Project pembanding: pilih & buka sesinya.
  - ✅ Sesi, task, file, revisi (dropdown "revisi…" di tab File) masih utuh.
6. Jika project yang dihapus sedang AKTIF (dipilih di sidebar):
  - ✅ UI otomatis kembali ke Workspace global (tidak nyangkut di scope mati).
7. Skill yang pernah dipelajari persona dari project itu (tab Skills):
  - ✅ Masih ada — TIDAK ikut terhapus (by design, keputusan Anda).
8. Settings → Metering: baris usage project terhapus.
  - ✅ Tetap tercatat (akuntansi jujur — by design), tidak di-reset.
