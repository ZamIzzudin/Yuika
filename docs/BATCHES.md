# BATCHES.md — Peta Batch Fitur (memori sesi)

> **Fungsi file ini:** pengelompokkan task TASKS.md menjadi **batch fitur utuh**
> (satu batch = satu pengalaman pengguna yang bisa didemokan), supaya sesi
> development baru langsung tahu pilihan jalur kerja tanpa harus menyusun ulang.
> TASKS.md tetap sumber kebenaran STATUS per task; file ini = sumber
> rencana batch + urutan eksekusi + acceptance per batch.
>
> **Aturan update:** batch dipilih → tandai status `IN-PROGRESS` + tanggal;
> selesai → `DONE` + commit. **Jangan hapus baris.** Est dalam hari-orang (d).
> Terakhir disusun: 2026-11 (setelah spec portal v1 dibekukan).

## Status batch

| # | Batch | Est | Status | Bisa mulai |
|---|---|---|---|---|
| 1 | Remote Control | ~9d | TERSEDIA | ✅ sekarang |
| 2 | Agent Developer | ~8d | TERSDIA | ✅ sekarang |
| 3 | Agent 24/7 | ~8d | TERSEDIA | ✅ sekarang |
| 4 | Otak Yuika | ~8d | TERSEDIA | ✅ sekarang |
| 5 | Workflow Engine | ~14d | TERSEDIA | ✅ sekarang |
| 6 | Workbench Studio | ~7d | TERSEDIA | ✅ sekarang |
| 7 | Design→Code (Penpot) | ~9d | TERSEDIA | ⚠️ setelah Batch 6 (STU-1) |
| 8 | Mobile Remote MVP | ~13d | TERSEDIA | ⛔ butuh Batch 1 + portal READY |
| 9 | Desktop App | ~8d | TERSEDIA | ⛔ butuh Batch 1 |
| 10 | Launch Prep | ~5d | TERSEDIA | ✅ sekarang |
| 11 | Monetisasi | ~10d | DEFER (keputusan user: free tier) | — |

Rekomendasi urutan (saat file ini disusun): **1** (selaras sesi portal paralel)
→ **2** atau **5** → 3/4/6 → 7 → 8/9 → 10. Batch boleh dijalankan berbeda
urutan atas instruksi user.

---

## Batch 1 · Remote Control — kendalikan host dari perangkat lain

**Apa yang Anda dapat:** host Yuika (apps/api) dipasangkan ke akun portal via
pairing token (Settings → tab Portal), lalu dikendalikan dari perangkat lain:
kirim prompt, lihat streaming delta, approve/reject approval dari jauh —
semua E2E encrypted. Dibuktikan lewat `/dev/remote` (browser kedua) sebelum
mobile ada. Ini jalur kritis menuju Batch 8 (mobile) & 9 (desktop).

**Task & urutan eksekusi:**

1. [ ] **P1-PRT-1** `packages/relay-client` SDK (2d) — connect + auth challenge,
   register_host/join (dhPub), list_hosts, seal/open, reconnect backoff +
   sticky host_back, typed API. **Implementasi terhadap `docs/portal/SPEC-PROTOCOL.md`
   (mirror FROZEN).** Acceptance: mock-ws unit test + **suite golden vectors
   `docs/portal/vectors/proto1.json` hijau di repo ini** (pola test:
   `yuika-portal/packages/crypto/__tests__/vectors.test.ts`).
2. [ ] **P1-PRT-2** Kontrak remote (1d) — blok zod `RemoteAction`/`RemoteEvent`
   disalin VERBATIM dari `docs/portal/CONTRACTS-REMOTE.md` ke
   `packages/contracts/src/remote.ts` + barrel. Jangan ubah shape sepihak.
3. [ ] **P1-PRT-3** Host mode di `apps/api` (3d) — device store gaya auth.db
   (kunci device di proses host, BUKAN browser), REST `/api/portal/pair|status|unlink`,
   UI Settings → tab Portal (paste token → claim → linked), relay host worker:
   RemoteAction → runtime (re-use handler route) + bus YuiEvent → envelope
   per-recipient (seq counter per sesi), badge "N remote connected" di web.
   PENTING: host online tanpa tab browser terbuka.
4. [ ] **P1-PRT-4** `/dev/remote` (1d) — halaman remote uji (pair token, join,
   kirim prompt, stream delta, approve). Bisa pakai mock relay in-process.
5. [ ] **P1-PRT-5** Relay support (1d) — **dikerjakan sesi portal** (T1 di
   SESSION-GUIDE portal); sesi Yuika cukup pantau `yuika-portal/docs/TASKS.md`.
6. [ ] **P1-PRT-6** Gerbang e2e (2d) — host + 2 remote live sesi sama, approval
   dari remote, drop → resume snapshot; playwright (relay in-process).
   **Prasyarat: portal menandai "PORTAL READY FOR INTEGRATION".**

**Acceptance batch:** skenario SPEC-PROTOCOL §11 butir 1–9 hijau via /dev/remote
+ gerbang e2e; badge remote connected tampil; host tetap diremotable tanpa tab
web terbuka.

**Paralelisme:** PRT-1..4 tidak butuh portal T1 selesai (spec sudah beku;
relay mock in-process). Hanya PRT-6 menunggu portal READY.

---

## Batch 2 · Agent Developer — agent bisa build project beneran

**Apa yang Anda dapat:** agent mengerjakan project nyata end-to-end: `npm
install` aman di sandbox (egress policy), menjalankan CLI/dev-server, dan Anda
melihat + ikut mengendalikan terminal yang sama di tab Terminal. Membuka
skenario "buat app React dari nol sampai jalan" yang selama ini terblokir.

**Task & urutan:**

1. [ ] **P1-MCP-4** MCP worker per-tenant di sandbox + egress policy (4d) —
   MCP server stdio jalan di worker terisolasi (bukan bare stdio), egress
   allowlist per project (npm registry, host tertentu), batas resource.
   Dep: P0-SEC-1 ✅.
2. [ ] **P2-STU-2** Terminal tab (4d) — `xterm.js` ↔ PTY (generalisasi
   `run_command`); sesi terminal shared user & agent; approval untuk
   perintah berisiko. Acceptance: agent menjalankan CLI & output muncul
   di tab yang user lihat; user bisa mengetik di sesi yang sama.

**Acceptance batch:** e2e — agent diberi brief "buat Vite React app, install
deps, jalankan dev server": npm install lulus egress, perintah tampak di
tab Terminal, approval muncul untuk perintah berisiko, dev server jalan.

**Catatan:** jika diinginkan scope lebih kecil, P1-MCP-4 sendiri sudah fitur
(install deps aman); STU-2 menyusul.

---

## Batch 3 · Agent 24/7 — kerja di background + bangunkan user

**Apa yang Anda dapat:** delegation/agent tetap jalan walau tab ditutup
(background jobs), notifikasi web push saat selesai, cron natural-language
("tiap pagi rangkum berita AI") dengan template blueprint, dan kanban review
gates — agent meminta review, Anda approve/request-changes dari board.

**Task & urutan:**

1. [ ] **P1-DEL-2** Background jobs + web push (2d) — job delegasi selamat dari
   restart (persist), service worker push saat selesai/gagal.
2. [ ] **P2-AGT-1** Cron v1 (3d) — natural-language schedule → blueprint;
   template cron; hasil dikirim via push/log sesi.
3. [ ] **P2-AGT-2** Kanban review gates (3d) — tool `request_review/approve/
   request_changes` + UI gate di board; agent berhenti menunggu review.

**Acceptance batch:** mulai delegation → tutup tab → restart server → job
lanjut; selesai → push notif; cron jalan sesuai jadwal; agent pause di
"Reviu" sampai user approve dari board.

---

## Batch 4 · Otak Yuika — knowledge base, vault, curator

**Apa yang Anda dapat:** Yuika mengingat dokumen Anda — upload PDF/doc →
ekstrak → index pgvector → agent menyit saat relevan; secrets per workspace
terenkripsi (API key tidak numpang di chat/.env); skill basi otomatis
diarsipkan curator.

**Task & urutan:**

1. [ ] **P2-AGT-5** Vault secrets per workspace (2d) — envelope encryption;
   inject ke env tool run tanpa bocor ke konteks model.
2. [ ] **P2-AGT-4** Knowledge base (4d) — upload → ekstrak → chunk → pgvector
   index → retrieval tool + pin konteks per project.
3. [ ] **P2-AGT-3** Curator v1 (2d) — deteksi skill basi/tumpang tindih per
   persona → arsip, konsolidasi opt-in.

**Acceptance batch:** upload 3 dokumen → tanya hal yang jawabannya hanya ada
di dokumen → agent menyit dengan sitasi; secret terpakai di run tanpa muncul
di trace/chat; curator mengarsipkan skill duplikat.

---

## Batch 5 · Workflow Engine — jantung Multi-Project Agent OS

**Apa yang Anda dapat:** definisikan project besar sebagai `workflow.yaml`
7 fase; engine menjalankan DAG (fase sequential/paralel, steps per persona),
human gate antar fase, board live kolom fase dengan kartu agent berjalan,
resume pasca-restart; Planner menghasilkan task list 30+ task dengan
acceptance + validator coverage. Ini diferensiasi produk utama (PLAN §13 + D22).

**Task & urutan:**

1. [ ] **P2-FLOW-1** Format `workflow.yaml` + validator zod + template 7 fase (2d)
2. [ ] **P2-FLOW-2** Engine v0: DAG → job graph queue (4d)
3. [ ] **P2-FLOW-3** Human gate antar fase + resume via replay (2d)
4. [ ] **P2-FLOW-4** Event workflow.* + replay `?since=` (1d)
5. [ ] **P2-FLOW-5** Monitoring board UI live (3d)
6. [ ] **P2-PM-3** Task list detail + validator coverage dari Planner (2d)

Lanjutan (batch berikutnya / lanjutan batch ini): FLOW-6 steering mid-run,
FLOW-7 TaskTree board penuh, PM-4 RACI, PM-5 dashboard, PM-6 iterasi berantai
(+11d) — catat di sini saat batch dieksekusi.

**Acceptance batch:** run template 7 fase di project demo E2E; kill server
mid-run → restart → lanjut dari fase terakhir; 2 persona paralel terlihat
di board; brief besar → Planner hasilkan ≥30 task validator-hijau.

---

## Batch 6 · Workbench Studio — satu layar untuk semua

**Apa yang Anda dapat:** workbench multi-tab penuh: tab shell (state per tab,
tidak kehilangan chat saat pindah), tab Docs (deliverable markdown + ringkasan
run), tab Browser read-only (agent riset URL → Anda melihat halamannya).

**Task & urutan:**

1. [ ] **P2-STU-1** Tab shell v0 (2d) — state per tab, layout kolom desktop
2. [ ] **P2-STU-7** Docs tab (1d) — viewer markdown deliverable + ringkasan run
3. [ ] **P2-STU-4** Browser tab read-only (4d) — server-side proxy + render
   (screenshot/DOM), domain allowlist per project; **security review = gerbang**

**Acceptance batch:** pindah-pindah tab tanpa kehilangan state; laporan run
terbaca sebagai doc; agent membuka URL riset dan user melihat halaman sama;
security review lulus (SSRF checklist).

---

## Batch 7 · Design→Code — pipeline Penpot ter-embed

**Apa yang Anda dapat:** persona Designer membuat/mengubah file Penpot
headless dari dalam turn; **tab Design** = canvas Penpot ter-embed live
(keputusan D18: wajib embed, bukan link); fase develop membaca shapes+tokens
→ generate komponen → diff di tab File; golden path E2E tanpa keluar platform.

**Task & urutan (dep: STU-1 dari Batch 6):**

1. [ ] **P2-DSN-2** Penpot connector RPC API + access token (2d)
2. [ ] **P2-DSN-3** Tab Design ter-embed (iframe share-link viewer v0) (2d)
3. [ ] **P2-DSN-4** Pipeline design→kode (fase develop generate komponen) (3d)
4. [ ] **P2-DSN-5** Persona Designer: skill Penpot via dungeon → ready (1d)
5. [ ] **P2-DSN-6** Golden path E2E (agent buat frame → user lihat live →
   generate komponen → diff) — hijau 2× berturut (1d)

**Acceptance batch:** golden path DSN-6 hijau; artefak ter-link ke node
TaskTree.

---

## Batch 8 · Mobile Remote MVP — HP sebagai remote pertama

**Apa yang Anda dapat:** app Expo = remote: pair via QR portal, pilih host
dari `list_hosts`, chat streaming via relay, **push notification tap→approve**,
picker persona + portrait SVG Orin, mission control mini. Semua via
`@yuika/relay-client` + kontrak RemoteAction/RemoteEvent (action-based).

**Prasyarat:** Batch 1 selesai + portal "PORTAL READY FOR INTEGRATION".

**Task & urutan:**

1. [ ] **P2-MOB-1** Expo shell + generated client + pair/pilih host/join (3d)
2. [ ] **P2-MOB-2** Chat streaming + resume (envelope delta + snapshot) (3d)
3. [ ] **P2-MOB-3** Push notification tap→approve (3d)
4. [ ] **P2-MOB-4** Persona picker + portrait SVG (2d)
5. [ ] **P2-MOB-5** Mission Control mini (2d)

**Acceptance batch:** dari HP — kirim prompt ke host web/desktop, streaming
terlihat, approval masuk push dan di-approve, sesi resume setelah reconnect.

---

## Batch 9 · Desktop App — Tauri host/remote switch

**Apa yang Anda dapat:** aplikasi desktop (reuse UI web) dengan **switch mode
HOST/REMOTE**: host = develop lokal (runtime berjalan di shell), remote =
kirim action ke host lain termasuk web-host. Auto-update + packaging.

**Prasyarat:** Batch 1 (relay-client + host worker reuse).

**Task & urutan:**

1. [ ] **P2-DTL-1** Tauri shell + reuse UI web + mode switch onboarding (2d)
2. [ ] **P2-DTL-2** Host mode dalam Tauri (P1-PRT-3 worker berjalan lokal;
   approval ketat tetap prinsip) (4d)
3. [ ] **P2-DTL-3** Auto-update + packaging NSIS/MSI/DMG (2d)

**Acceptance batch:** installer jalan di Windows; mode remote mengendalikan
web-host di mesin lain; update otomatis teruji.

---

## Batch 10 · Launch Prep — siap ditunjuk ke luar

**Apa yang Anda dapat:** staging publik (domain+TLS), legalitas lisensi
rapi, artefak internal dibersihkan, CONTRIBUTING — plus checklist G-ALPHA
(10 pengguna internal 1 minggu tanpa data loss).

**Task:**

1. [ ] **P1-INF-5** Deploy staging (VPS/Fly) + domain + TLS (1d)
2. [ ] **PUB-1** THIRD-PARTY-NOTICES.md (0.5d)
3. [ ] **PUB-2** Keputusan lisensi final: proprietary / BSL 1.1 (0.5d — user)
4. [ ] **PUB-3** Bersih-bersih artefak internal (docs/Orin*.html dst.) (1d)
5. [ ] **PUB-4** CONTRIBUTING.md + CLA/DCO (1d)
6. [ ] **P1-PER-5** Persona blind test (butuh penguji manusia) + G-ALPHA checklist

**Acceptance batch:** staging live + smoke e2e hijau di staging + runbook alpha.

---

## Batch 11 · Monetisasi — DEFER (keputusan user: free tier sampai launching)

Berisi: P1-CRED-5 (Stripe v1) · P1-CRED-6 (audit metering <2%) · P2-BIL-1
(billing v2 + entitlement lintas platform via `accounts.plan` portal) ·
P2-GROW-1/2 (skin/event/achievement + growth timeline). Hook entitlement
sudah disiapkan di portal (D23). **Jangan dikerjakan tanpa instruksi user.**

---

## Catatan lintas batch

- **Sinkron dengan sesi portal**: sebelum Batch 1 gerbang (PRT-6) dan Batch 8,
  cek `yuika-portal/docs/TASKS.md` baris "PORTAL READY FOR INTEGRATION".
  Kontrak beku = `docs/portal/` (hash vectors di README-nya).
- **Batch 2/3/4/5/6 mandiri** — aman dijalankan paralel dengan sesi portal
  tanpa konflik file.
- Est = perkiraan; ubah hanya via kesepakatan sinkron (aturan TASKS.md).
