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
| 1 | Remote Control | ~9d | **DONE (2026-11-06)** — semua P1-PRT ✅; live cross-repo smoke 8/8 (`scripts/live-portal-smoke.mts`) | ✅ sekarang |
| 2 | Agent Developer | ~8d | **DONE (2026-11-07)** — P1-MCP-4 + P2-STU-2 ✅; e2e T1-T3 hijau | ✅ sekarang |
| 3 | Agent 24/7 | ~8d | TERSEDIA | ✅ sekarang |
| 4 | Otak Yuika | ~8d | TERSEDIA | ✅ sekarang |
| 5 | Workflow Engine | ~14d | **DONE (2026-11-08)** | ✅ sekarang |
| 6 | Workbench Studio | ~7d | **DONE (2026-11-08)** — STU-1 + STU-7 + STU-4 ✅ (security review lulus) | ✅ sekarang |
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
   **Prasyarat: portal menandai "PORTAL READY FOR INTEGRATION".** — ✅ TERBIT
   (2026-11-07, portal `70f84ed` + `docs/INTEGRATION.md`) → uji portal nyata
   SELESAI: `scripts/portal-integration.mts` **45/45 PASS** vs web+relay
   produksi (INTEGRATION §5 penuh, tanpa patch dua repo) + flow manual user
   `docs/TEST-FLOW-PORTAL-INTEGRATION.md` (lihat TASKS P1-PRT-6).

**Acceptance batch:** skenario SPEC-PROTOCOL §11 butir 1–9 hijau via /dev/remote
+ gerbang e2e; badge remote connected tampil; host tetap diremotable tanpa tab
web terbuka.

**HASIL (2026-11-06): DONE.** Butir 1–7 = unit relay-client 12 test; butir 8 =
vectors 45 test dua backend; butir 9 = claim route (409 clash sudah teruji di
portal). Gerbang e2e G1–G6 hijau (2 test/37 dtk, SpecRelay double) + **live
smoke lintas repo 8/8** vs relay PRODUKSI yuika-portal (T1 done sesi paralel,
commit portal `0d0752d`). Commit: `4e58968` `ff50d39` `09b5d1d` `bfd4a72`
`a8a31d3` + gerbang. Sisa non-blokir: uji ulang penuh via portal web +
staging setelah portal T2+T4 (gerbang PORTAL READY — ✅ terbit 2026-11-07;
integrasi portal nyata IN-PROGRESS, hasil dicatat di TASKS P1-PRT-6).

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
   Dep: P0-SEC-1 ✅. — ✅ (2026-11-07)
2. [ ] **P2-STU-2** Terminal tab (4d) — `xterm.js` ↔ PTY (generalisasi
   `run_command`); sesi terminal shared user & agent; approval untuk
   perintah berisiko. Acceptance: agent menjalankan CLI & output muncul
   di tab yang user lihat; user bisa mengetik di sesi yang sama.
   — ✅ (2026-11-07)

**Acceptance batch:** e2e — agent diberi brief "buat Vite React app, install
deps, jalankan dev server": npm install lulus egress, perintah tampak di
tab Terminal, approval muncul untuk perintah berisiko, dev server jalan.

**HASIL (2026-11-07): DONE.** e2e `terminal.spec.ts` T1-T3 hijau (user mengetik

**Tindak lanjut CP-3 (2026-11-07): SSO login via portal** — P1-PRT-7 sisi Yuika

**Portal-only auth (2026-11-08): local account dihapus** — P1-PRT-8: register/login

**Auto-link browser (CP-4, 2026-11-08)** — P1-PRT-9 sisi Yuika: SSO login

**CP-5 unlink device (2026-11-08)** — P1-PRT-10: bye 4001 permanen
(SDK tak reconnect); host → pairing ulang (note "unlinked"); web device →
row dihapus + sesi dicabut (guard everAuthed utk relay asing). Hook
unlink() di relay double + unit & e2e hijau.otomatis meng-claim device web di portal (presence; tanpa token manual).
Token Web manual diusulkan dihapus (CP-4, portal) — web = host/presence,
bukan remote.lokal hilang dari API (404), AuthGate tanpa form kredensial (portal-only +
mode terbuka), identitas = portal_account_id (anti-takeover via 409).
Akun & signup kini SATU tempat: yuika-portal.SELESAI (tombol "Sign in with Yuika Portal" + callback + sesi Yuika; api unit 6/6,
e2e penuh 8/8 via portal-double) — endpoint portal nyata menunggu sesi portal
(lihat TASKS P1-PRT-7 + portal docs/CHANGE-PROPOSALS.md CP-3 accepted).di tab; agent `node -v` muncul di SESI SAMA tanpa approval; `npm publish` →
approval card → Approve once → jalan) + suite penuh 7/7. Unit: egress proxy 5,
terminal 7, mcp-worker 3, api terminal-routes 3; typecheck 6/6. CATATAN jujur:
(a) e2e jalan di fallback shell lokal (env dev tanpa Docker) — jalur
container+proxy terkover unit/kontrak (argv flag, proxy allow/deny hermetic);
verifikasi live `npm install` dalam container menunggu Docker Desktop; (b) PTY
asli (node-pty) belum — v1 pipe murni + lokal-echo di xterm; (c) MCP worker
sandbox opt-in per server (mcp.json `sandbox`), bukan default paksa.

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

**HASIL FLOW-1..4 (2026-11-08):** contracts workflow.ts (schema+lint+template 7 fase, test 7)
· engine v0 (sequential/parallel topo-wave, delegation reuse, persist workflow_runs, REST
runs/gate/stop/template) · gate + resume boot (gate re-ask, step tak diulang) · event
workflow.* aditif di sesi lead (replay gratis). Bukti: turbo 5/5, engine 7/7, typecheck 6/6.
FLOW-5 ✅: tab Flow (board fase live + gate UI). FLOW-6 ✅: steer/pause/resume/reassign (engine+REST+UI; pause saat
gate = paused langsung; reassign persist tahan restart). PM-3 ✅: task detail
first-class (description/acceptance/dependsOn/estimate/phase di `TaskItem` +
event + store + todo tools) + validator `lintTaskList` (DAG, coverage 7 fase,
kelengkapan) + REST `/tasks/validate`; skenario brief besar: 35 task via
`todo_add` → validator hijau.

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
**HASIL (2026-11-08):** STU-1 ✅ (diamendemen sesuai feedback user: satu
tab = satu halaman — chat tertutup penuh saat tab lain aktif, tab aktif
lebar penuh; chat disembunyikan CSS bukan unmount sehingga draft/streaming
selamat; penggabungan tab Board/Tools disepakati menyusul). STU-7 ✅ lalu **di-merge ke tab Files** (feedback user: satu konsep artefak — seksi Run reports + viewer markdown toggle Rendered/Source; tab Docs dihapus, 10→9 tab; + FIX bug 401 "authentication required" di FileTab: semua request kini authFetch). STU-4 ✅ tab Browser read-only via proxy core
(allowlist per project, SSRF guard IP+DNS, redirect re-validated, content-type
whitelist, cap 2MB, sanitizer) + iframe sandbox kosong + riwayat kunjungan
agent/user (browser_visits) + `docs/SECURITY-REVIEW-BROWSER.md` (gerbang
lulus). Bukti: e2e workbench 3/3, unit reader 7/7, api kontrak; total e2e
13/13, turbo 5/5, typecheck 6/6.

**Konsolidasi tab (keputusan user, mulai 2026-11-08):** (1) satu tab = satu halaman (STU-1 diamendemen, `0e7e2d1`); (2) Docs dihapus, diserap tab Files — seksi Run reports + viewer markdown Rendered/Source + FIX 401 auth (`192795e`); (3) Workflow = alat conductor: tombol pintu di header chat conductor + CTA empty state + branding board; Team dipertahankan; assign/Task-Board dibahas menyusul; (4) **tab Flow dihapus — workflow digabung ke tab Team dengan konsep/visual Team** (WorkflowTree: pohon run→fase→step + kontrol lengkap di atas canvas delegasi; pintu conductor → Team; tab 9→8; e2e FLOW-5/6 hijau di tab Team). (5) **Arsitektur final (hari yang sama): kendali workflow = WorkflowRunBar di chat conductor** (brief/steer/gate/pause; engine menerima leadSessionId = sesi chat), **Team = canvas murni** (run aktif jadi root delegasi, fase implisit; WorkflowTree dihapus), **reassign step = tab Task** (WorkflowStepsCard); e2e FLOW-5/6 rewrite full via chat+Team+Task. (6) **tahap 2: satu composer** — brief/steer digabung ke input chat (run hidup → steer; toggle Workflow Mode sejajar Hardcore → brief; selain itu chat biasa; bar = strip status murni; pill AuthGate pindah top-right → final: AuthPill inline footer sidebar). (7) fix tree kembar Team canvas: run dgn lead = sesi root digabung ke kartu root (satu tree); run lead sesi lain tetap root terpisah..
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
- **BATCH FIX (2026-11): feedback test E2E manual user — 9 item**: FLOW-8 task↔fase binding + sweep + doing marker (engine), tombol Workflow header dihapus, policy browser allowAll per-project, merge Terminal→Browser (panel VS Code: hide/resize, Shell+Commands), run_command → Commands log (REST baru), Langkah kerja keluar dari chat (tinggal di Logs/Trace), dot tab center. Regresi: template fase id docs/deliverable → documentation/delivery. Bukti: typecheck 6/6 · turbo 5/5 · engine 15/15 · reader 9/9 · run-command 8/8 · e2e 15/15.
- **RESEARCH ENGINE — SELESAI (2026-11)** (perbaikan nomor: "Batch 7" resmi = Design→Code di atas; entri ini sebelumnya salah nomor): packages/core/src/research/ (router + 10 provider + robots + throttle + cache SQLite + budget) & tools web_search/web_fetch baru (SSRF guard menutup celah fetch-polos lama; Readability→markdown; hasil parsial + errors jujur). Disetujui + RS-1b news/market/social (riset bebas topik: berita, harga crypto live/saham delayed, sentimen publik Reddit/Bluesky). Bukti: core vitest 337+20 baru (research.test.ts 20/20 hermetic), typecheck 6/6, turbo 5/5, e2e 15/15.
- **LIVE BROWSER 8a-8c (rancangan)** — diserap **P2-SCR (Batch 14a, DISETUJUI)**; lihat entri Batch 14a + PLAN-WORKSHOP-LIVESCREEN-VAULT §2.
- **BATCH 12 · VAULT V0 — DISETUJUI (2026-11, user: "A setuju")**: P2-VLT-1 store AES-256-GCM + REST metadata-only; VLT-2 kartu protected + tools vault_request/list/forget (+ switch "Save to Vault" run-only, adaptasi rokazo); VLT-3 secret_http origin-bound + command variables (nama reserved, redact); VLT-5 redaksi nilai aktif per-run + e2e negatif "nilai tidak muncul di trace/event/log/konteks model". VLT-4 fill_login MENYUSUL (butuh SCR-3 + related-origins utk SSO + scrub hidden field di semua run scope). Supersede P2-AGT-5. Threat model jujur: kunci+ciphertext di disk sama ≠ anti-attacker-filesystem; nilai utama = tak pernah lewat model.
- **BATCH 14a · LIVE SCREEN (SCHOLAR) — DISETUJUI (2026-11, user: "B setuju")**: P2-SCR-1 screencast+input+Chromium manager; SCR-2 agent shared-session CDP + takeover user↔persona (lease pola fence + max-wait bound); SCR-3 profil persist per project×persona + selector screen + EKSKLUSI .yuika/browser/* dari tab Files/artefak; SCR-4 request_takeover kartu non-blocking + deadline. MENYUSUL (C): SCR-5 DevTools, SCR-6 watch QA, SCR-7 remote watch, P1-PER-8 Sherlock, P2-DUN-x, VLT-4, Batch 13 Workshop (staging/VPS-first; Docker absen di mesin dev user).
- **URUTAN EKSEKUSI (disetujui user 2026-11)**: hygiene (selesai) → **Batch 12 Vault v0** (jalan) → Batch 14a Screen (mulai SCR-0 probe) → blok C.
- **BATCH 12 · VAULT V0 — SELESAI (2026-11)**: VLT-1 store AES-256-GCM per record (AAD id|name|kind|scope|project|persona; master key YUI_VAULT_KEY → vault.key 0600 auto-gen + warning backup; vault.db terpisah; purge run-only saat turn baru/dispose) · VLT-2 kartu protected (event vault.requested/resolved metadata-only; deadline auto-skip; input di-clear DOM-side; toggle Save to Vault — off = run-only) + tools vault_request/vault_list/vault_forget + REST metadata-only (GET /api/vault, POST fill/:id(+skip), DELETE /:name) · VLT-3 secret_http (origin-bound: redirect DITOLAK + HTTPS wajib kecuali loopback; bearer/x-api-key/custom header disuntik backend; 30 dtk deadline; 1MB/20k cap; response redact ganda) + command variables run_command (env record, nilai WAJIB vault:<name> — nilai polos DITOLAK supaya rahasia tak pernah lewat model; nama reserved LD_*/GIT_*/NPM_CONFIG_*/YUI_*/PATH/NODE_OPTIONS/...; sandbox -e & local env; stdout/stderr redact) · VLT-5 redaksi nilai aktif proses-wide (plain+base64+base64url+urlencode, refcount release) + audit vault.used metadata-only + toolset scholar/coder/analyst (+conductor dgn vault_forget) + e2e negatif "nilai tak muncul di event/hasil tool/meta/ciphertext". Bukti: vault.test.ts 17/17 · typecheck 6/6 · turbo 5/5 · e2e 15/15. Bug ditemukan selagi test: redactActive variants all-or-nothing saat urlencode identik → fixed (dedup per varian).
- **FIX riset (2026-11-07, project p_861f2edc)**: turn Scholar menggantung selamanya — dns.lookup tanpa timeout (race 5 dtk), domainThrottle livelock self-requeue (reservasi sekali), ddg selalu dipanggil +10 dtk/search (kini hanya bila hasil site-router < 3, race 5 dtk), watchdog tool withTimeout 25/45 dtk, budget query 10→30/jam, pesan error EN. Test: research.test.ts 24/24.
- Est = perkiraan; ubah hanya via kesepakatan sinkron (aturan TASKS.md).
