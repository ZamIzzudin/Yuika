# TASKS.md — Checklist Delegasi & Roadmap Development (awal → siap testing)

> Pasangan `PLAN.md` (mengapa) dan `DEMO-WEEK-1.md` (eksekusi minggu demo).
> **Dokumen ini = sumber kebenaran progres tim.** Update tiap sinkron pagi (15 menit).
>
> **Cara pakai:**
> - Format task: `- [ ] **ID** — deskripsi · *Owner · est · dep*` → Acceptance singkat.
> - Owner: **A** (Dev A / core), **B** (Dev B / web+api), **C** (Dev C / persona+skill+MCP), **S** (semua/bersama).
> - Status: kosong = belum · `[x]` selesai · `~` in-progress · `!` blocked (tulis blocker di bawah task).
> - **Jangan hapus baris.** Est dalam hari-orang (d). Ubah est hanya lewat sinkron pagi.
> - Aturan urutan: task tanpa `dep` boleh diambil bebas; task bertanda `dep: X` menunggu X selesai.
>
> **Update sesi dev (agent):** migrasi pnpm→npm selesai · suite test core 21 test green (loop,
> file-tools, store, delegation, run-command, registry) · fix: SSE dedupe, forwarding approval
> delegation, path-escape prefix bug, bug skillsDir runner, EventDraft distributive, extensionAlias
> webpack, zod v3 API. Yang belum: verifikasi model ASLI (W1-A1/A2 butuh API key) & dry run W4-S1.
>
> **Update sesi dev 2 (branch `dev/w5-polish`):** Orin SVG animasi jadi portrait (W3-B2/C1/B3),
> USER.md stub (W5-C2), test prompt stack frozen (W2-C2) — total 24+3 test green.
>
> **Update sesi dev 3:** UI overhaul penuh ala OpenBot (design token netral + aksen tunggal,
> chat tanpa-bubble agent / bubble terang user, steps lipat, empty state per-persona, tab-ready) ·
> fix provider GLM 400/1210 (normalisasi `exclusiveMinimum` boolean di tool schema) ·
> **PLAN v0.4: pilar Studio Proyek** (§13 — D14–D17) → task baru di **P1-PRJ**, **P2-FLOW**,
> **P2-STU**. Referensi: `D:\projects\openbot`; pen.dev menyusul di-clone (P2-STU-6).
>
> **Update sesi dev 4:** **pen.dev → Penpot** (pen.dev tidak open source; repo
> `D:\projects\penpot` sedang di-clone — eksplorasi menyusul P2-DSN-1) · **PLAN v0.5**
> (D18–D21): TaskTree & TaskList monitoring (P1-PRJ-7, P2-FLOW-7) · **Dungeon** arena
> latihan persona → skill lifecycle `draft→tested→ready` → assign gating (P1-DUN) ·
> **pipeline desain→kode Penpot** (P2-DSN) · **multi-model per persona** (P1-MDL).
> Detail konsep: PLAN §13.7–13.10.
>
> **Update sesi dev 5 (putusan user):** **Yui Designer masuk roster** (D9 = 7, PLAN §7.4 —
> task P1-PER-7) · **Penpot wajib ter-embed di platform** (bukan app terpisah) — scope v0
> **ramping tapi flow utuh**: agent buat (fase design) → user lihat live di tab Design →
> develop baca → kode — tanpa keluar platform (tangga embed PLAN §13.9; D18 diperinci).
>
> **Update sesi dev 6 (P2-DSN-1 selesai):** eksplorasi Penpot (`docs/refs/penpot.md`) —
> **embed wajib self-host** (CSP `frame-ancestors`, cloud tak bisa di-iframe; §12.15
> terjawab) · v0 = agent via **RPC API** (`update-file` headless) + **iframe share-link
> viewer** (update live) · v1 = **MCP server resmi** (plugin hidup di sesi embedded —
> konstrain “tab aktif” terpenuhi otomatis) · render headless via exporter WASM ·
> OpenAPI spec bawaan (`/api/main/doc`) → client digenerate.
>
> **P1-PRJ-1+2+3+4+5+6+7 & P1-MCP-3 selesai (sesi dev 7):** project first-class (store/REST/roster tasklist/UI drawer), TaskTree dari replay event, **MCP trust gate fail-closed** (`mcp-trust.json` + deny per-tool + audit + connect/disconnect dinamis + panel sidebar) dan **binding MCP project×persona (D17)** — agent Conductor ter-bind memanggil tool filesystem live (audit terisi). 65 test green. Skenario test mandiri: `docs/TEST-SCENARIO-STUDIO-P1.md`.
>
> **Polish sesi dev 8 (feedback user):** resume percakapan project (klik project = buka sesi terbaru via replay SSE, riwayat sesi + tombol sesi baru), UX project lead (PersonaPicker keluar dari sidebar; Conductor lead otomatis, persona via kartu tengah/dropdown header, composer aktif di state kosong), **panel proyek = bagian utama shell** (pola IDE: sidebar | chat | panel 520px, toggle layar penuh) dengan **tab Tasklist | Tim (org-chart struktur delegasi live: lead + anak delegasi + bench roster) | Pohon (TaskTree nested) | Roster | Sesi**, **tracing performa `[yui:trace]`** (durasi provider per iterasi / tool / menunggu approval / delegasi — diagnosis "landing page 15 menit"; `YUI_TRACE=0` untuk matikan), approval **"Setujui & ingat"** per sesi (loop di-cache per sesi) + file policy `code|docs|reports` bebas-approval (kode produk mendarat di `code/`, bukan `reports/`). Lanjut: analisis hasil tracing → optimasi loop (P0-CORE-3/4), P1-MCP-1, P2-FLOW-7.
>
> **Sesi dev 9 (Studio OS shell + kanban + katalog MCP + memory loop):** shell final = **satu area konten dengan tab bar** (`Chat | Tim | Papan | Pohon | Roster | Sesi | Memori`) — chat jadi tab pertama, bukan split dua panel; dot live di tab (agent bekerja / delegasi berjalan). **P2-FLOW-7 v0**: tab Papan = kanban 4 kolom drag&drop HTML5 (tanpa lib) → PATCH status, kartu subtask+assignee+artefak, auto-refresh saat `todo_*`. **P1-MCP-1**: katalog 20 server kurasi (`packages/core/src/mcp/catalog.ts`) + UI install/uninstall di panel MCP (form env untuk API key, badge risiko, pencarian; `POST/DELETE /api/mcp/install`, `GET /api/mcp/catalog`) — install hanya menulis deklarasi ke `mcp.json`, **tetap fail-closed**: harus Trust dulu sebelum terhubung. **P1-MEM-1**: USER.md/MEMORY.md manager + tool `memory_append` + tab Memori (editor); catatan di-inject ke system prompt sesi baru (USER.md yang dulu ditulis-tak-dibaca kini dibaca). **P1-MEM-2**: learn nudge pasca-task — aux call ringan pasca-turn ber-tool → 0/1 catatan via memory_append + event `memory.noted` (chip di chat). Sesi delegasi anak kini mewarisi projectId parent. **Fix katalog (feedback test user)**: 4 command server salah-diverifikasi registry (fetch→`@kazuph/mcp-fetch`, git→uvx, sqlite→`mcp-server-sqlite-npx`, time tetap uvx); field `runtime`+`setupNote` (badge "Python/uvx" + hint). **Dukungan uv end-to-end**: deteksi otomatis (`mcp/uv.ts` — PATH + fallback path absolut `%USERPROFILE%\.local\bin`, cache 30 dtk), tombol **Install uv** satu-klik (installer resmi astral.sh, konfirmasi eksplisit UI, REST `GET/POST /api/mcp/runtime`), connect `uvx` otomatis pakai path absolut → **tanpa restart dev server**; baris server Python disable "Butuh uv" bila belum ada. +2 test uv. **Konsistensi desain (feedback user "seirama dengan chat")**: FIX BUG token `--yui-space-5` tak terdefinisi (semua padding pane & modal jadi 0 → konten terpinggir), **form kit global** (semua input/select/textarea satu DNA composer — hapus 5 styling duplikat), **glass ala macOS** untuk modal Pengaturan + dropdown persona (disetujui user). **Robustness (trace user)**: routing artefak kode (`.html` dll di `reports/` → `code/`, fix "landing page mendarat di reports"), provider timeout+retry, budget graceful, guard repetisi. +22 test total sesi. **Polish (feedback user): menu ⚙ Pengaturan** (modal: nav seksi + lebar) — panel MCP pindah dari dasar sidebar (sesak) ke seksi "MCP & Tools"; seksi baru **"Provider & Model"**: base URL / API key (password, kosong=keep, tak pernah dikirim balik — hanya 4 digit terakhir) / model utama / fallback, **swap panas** (provider baru in-memory + `.env` diperbarui via `updateEnvFile` + loopCache dikosongkan; delegateDeps di-mutasi via getter) — REST `GET/PUT /api/settings/provider`; +3 test env-file. Catatan: fitur core butuh **restart dev server**.
>
> **Update sesi dev 7 (maskot v4):** `OrinPortrait` rewrite ke **Orin v4** (docs/Orin v4 —
> Pilih Maskot): satu rig mata untuk semua bentuk, identitas persona = bentuk —
> conductor=bola #F2620F, scholar=awan #F5A00A, scribe=tetes #2B8CF0, coder=kotak #12D1A0,
> designer=segitiga #F0278E (`orinShapes.tsx` dipakai portrait + PersonaFace mini) ·
> mapping state baru: working→speaking (halo), awaiting_input→listening (mata besar) ·
> typecheck 3/3, 28 test green, build ✓. Siap Rive: satu .riv, input `shape` 0–4.

## Peta Fase & Gerbang

| Fase | Isi | Durai (3 dev) | Gerbang keluar |
|---|---|---|---|
| **W0–W7** | Demo internal (vertical slice) | 1 minggu | **G-DEMO** — demo 8 menit lulus |
| **P0** | Kernel penuh — bayar utang demo | ±3 minggu | **G-P0** — kernel production-grade |
| **P1** | MCP penuh · memory loop · delegation penuh · persona v1 · credits v1 | ±9 minggu | **G-ALPHA — SIAP TESTING #1 (internal alpha)** |
| **P2** | Mobile · desktop+relay · curator · cron · kanban · KB · vault · billing v2 | ±10 minggu | **G-BETA — SIAP TESTING #2 (closed beta)** |
| **P3** | Marketplace · teams · voice · self-host | ±3–4 bulan | G-P3 |
| **P4** | Workflow builder · eval · enterprise | berkelanjutan | — |

> **Track Studio (v0.4–v0.5, PLAN §13):** P1-PRJ + P1-DUN + P1-MDL numpang di P1;
> P2-FLOW + P2-STU + P2-DSN numpang di P2. Gerbang tambahan masuk G-BETA. UI hasil
> sesi dev 3 sudah tab-ready.

---

## W0 — Pra-Demo (Hari 0, sebelum Senin)

- [ ] **W0-1** Pilih & uji model tool-calling (2–3 kandidat, prompt dengan 2 tool call berantai) · *S · 0.5d* → keputusan model + catat latency; kunci di `.env` `YUI_MODEL`
- [ ] **W0-2** Siapkan 2 API key provider (utama + cadangan) & budget demo · *A · 0.25d* → `.env` lokal tiap dev valid
- [ ] **W0-3** Review scaffold ini bersama: struktur, kontrak, pembagian A/B/C · *S · 0.5d* → tiap dev paham jalur kodenya; catat pertanyaan
- [ ] **W0-4** `npm install && npm run dev` jalan di 3 mesin (Windows/mac/linux) · *S · 0.25d* → chat streaming dummy muncul di `localhost:3000`
- [ ] **W0-5** Bagi peran final & blok kalender fokus (2× 3 jam/hari tanpa meeting) · *S · 0.1d*

## W1 (Senin) — Fondasi & walking skeleton

*Exit: chat web streaming balasan LLM + persona picker tampil 4 persona.*

- [ ] **W1-A1** Finalisasi `ProviderAdapter` + `OpenAICompatProvider` streaming (scaffold → uji dgn model asli) · *A · 0.5d* → stream 200 token tampil tanpa error
- [ ] **W1-A2** `AgentLoop` v1 tanpa tools: user → stream → assistant → persist · *A · 1d · dep W1-A1* → turn tunggal hijau end-to-end
- [x] **W1-A3** Vitest loop vs fake provider (stream, final, append-only) · *A · 0.5d · dep W1-A2* → `npm test` green — *verif: `loop.test.ts` (happy path, 2-round tool, error provider)*
- [ ] **W1-B1** Bekukan penamaan kontrak (review `packages/contracts`, tambah field bila kurang — SEKALI) · *B · 0.25d* → tidak ada rename event setelah hari ini
- [ ] **W1-B2** Route `POST /api/sessions` + `GET /api/personas` tersambung runtime · *B · 0.5d · dep W0-4* → Postman/insomnia OK
- [ ] **W1-B3** Chat shell + SSE route live (tanpa replay dulu) · *B · 1d · dep W1-B2* → delta teks streaming di UI
- [ ] **W1-C1** Persona loader + 4 persona seed final (teks) · *C · 0.5d* → `GET /api/personas` 4 entri tervalidasi
- [x] **W1-C2** Skill loader + 5 skill seed (lint manual: desc ≤60 char) · *C · 0.5d* → semua SKILL.md parse tanpa error — *verif: 5/5 parse via delegation test (loader melempar bila rusak)*
- [ ] **W1-C3** PersonaPicker UI (kartu + pilih → buat sesi) · *C · 0.5d · dep W1-B2* → klik persona → sessionId

## W2 (Selasa) — Registry & tools

*Exit: agent baca/tulis file & fetch URL; memilih & membaca skill sesuai tugas.*

- [x] **W2-A1** Registry dispatch + validasi zod + approval gate (sudah di scaffold — uji + polish) · *A · 0.5d* → `registry.test.ts` green
- [x] **W2-A2** File tools (read/write/list) + path safety test (path escape ditolak) · *A · 0.5d · dep W2-A1* → unit test escape case green — *verif: `file-tools.test.ts`; fix prefix-escape (`ws` vs `ws-evil`) + regression test*
- [ ] **W2-A3** `web_fetch` + truncation + timeout · *A · 0.5d* → URL nyata → teks bersih
- [x] **W2-A4** Multi-round tool calls di loop (tool_calls → results → iterasi) · *A · 1d · dep W2-A1* → scenario "list lalu baca file" 2 round sukses — *verif: `loop.test.ts` 2-round chained (fake provider)*
- [ ] **W2-B1** Tool activity feed UI (tool.call/result inline) · *B · 0.5d · dep W1-B3* → tiap call terlihat real-time
- [x] **W2-B2** Session store append-only + replay `?since=` + events route · *B · 1d* → refresh → feed ter-replay — *verif: `store.test.ts` (id monotonic, since eksklusif, frozen prompt); SSE route kini dedupe by id*
- [ ] **W2-C1** `skills_list`/`skill_view` tools · *C · 0.5d* → agent bisa memuat skill web-research
- [x] **W2-C2** Prompt stack frozen per sesi ([core][persona][skills index]) · *C · 0.5d · dep W1-C1* → system_prompt tersimpan di sessions; test: prompt tidak berubah saat config berubah — *verif: `prompt-stack.test.ts` (frozen + sesi baru baca config baru)*

## W3 (Rabu) — Approval + ekspresi + persona UX

*Exit: ekspresi reaktif 7 state; approval inline end-to-end; persona → sesi baru.*

- [x] **W3-A1** Approval engine wiring loop (pause/resume turn) + approvalPolicy file tools · *A · 1d* → write di luar reports/ mem-pause turn sampai user jawab — *verif: `delegation.test.ts` (approve → file jadi; deny → dibatalkan)*
- [x] **W3-A2** `run_command` allowlist + selalu approval · *A · 0.5d* → `node -v` jalan setelah approve; tolak = tool error — *verif: `run-command.test.ts`*
- [ ] **W3-B1** ApprovalCard UI (setujui/tolak → POST) · *B · 0.5d · dep W3-A1* → klik setujui melanjutkan turn
- [x] **W3-B2** `PersonaPortrait` mapping `persona.state` (fallback CSS scaffold) · *B · 0.5d* → 7 state visual berbeda & reaktif — *verif: Orin SVG animasi (rig dari docs/Orin v2); tint per persona; Rive menyusul P1-PER-2*
- [x] **W3-B3** Persona picker → sesi baru bersih (reset state client) · *B · 0.25d* — *verif: `pick()` reset items/personaState/lastEventId/openAssistant*
- [x] **W3-C1** Integrasi Rive placeholder (file komunitas / blob) — **timebox 3 jam** · *C · 0.5d* → `.riv` termuat via `@rive-app/react-canvas` ATAU fallback CSS tetap (keputusan tercatat) — *keputusan: fallback = Orin SVG animasi (rig & keyframe final dari `docs/Orin v2`); .riv dibangun di P1-PER-2 dengan hirarki bone identik*
- [ ] **W3-C2** Persona.yaml final 4 persona + deskripsi UX (≤60 char) · *C · 0.25d*

## W4 (Kamis) — Delegation & MCP

*Exit: skenario penuh §2 jalan kasar end-to-end.*

- [x] **W4-A1** `delegate_task` + child runner (persona anak, toolset anak minus delegate_task) · *A · 1.5d · dep W2-A4* → Conductor → Scholar jalan, ringkasan kembali — *verif fake provider; fix bug skillsDir (dulu crash saat spawn anak); real-model E2E menyusul W4-S1*
- [x] **W4-A2** Events delegation.* (started/progress/done) ke stream parent + sesi anak tersimpan · *A · 0.5d · dep W4-A1* — *verif: `delegation.test.ts`; + forwarding approval anak → parent (blocker skenario §2 langkah 6)*
- [ ] **W4-B1** DelegationCard UI (kartu persona anak + progress + summary) · *B · 1d · dep W4-A2* → progres anak live di parent
- [ ] **W4-B2** Resume/replay stabil (refresh saat turn jalan; reconnect SSE) · *B · 0.5d · dep W2-B2*
- [ ] **W4-C1** MCP client stdio + register prefix `mcp__` (scaffold → uji `server-fetch`) · *C · 1d* → tool `mcp__fetch__fetch` terpanggil agent
- [ ] **W4-C2** `server-filesystem` scoped `workspace/reports` + config `mcp.json` · *C · 0.5d · dep W4-C1*
- [ ] **W4-S1** Dry run kasar skenario penuh + daftar bug P0 · *S · 0.5d*

## W5 (Jumat) — Integrasi, tuning, polish

*Exit: skenario lulus 2× berturut tanpa intervensi manual.*

- [ ] **W5-S1** Triage bug P0/P1 (papan kasar di file/note) · *S · 0.25d*
- [ ] **W5-A1** Fix P0 core (race SSE→store, error provider → session.error bersih) · *A · 1d*
- [ ] **W5-B1** Polish UI (dark theme konsisten, empty/error state, layout) · *B · 1d*
- [ ] **W5-C1** **Prompt iteration Conductor** (3 varian, uji blind 5 prompt beda) · *C · 1d* → dekomposisi+delegasi konsisten ≥4/5
- [x] **W5-C2** USER.md stub (append 1 catatan preferensi per sesi — label preview) · *C · 0.25d* — *verif: `prompt-stack.test.ts` + smoke API; loop belajar sungguhan = P1-MEM*

## W6 (Sabtu) — Dry run & rekam

- [ ] **W6-S1** Dry run penuh 2× + rekam video backup (layar+audio) · *S · 1d*
- [ ] **W6-S2** Freeze scope 12.00 — setelah itu hanya P0/P1 · *S*
- [ ] **W6-S3** Tulis `docs/demo-runbook.md` (klik-by-klik + fallback) · *S · 0.25d*

## W7 (Minggu) — Rehearsal & buffer

- [ ] **W7-S1** Rehearsal di perangkat & jaringan demo sebenarnya · *S · 0.5d*
- [ ] **W7-S2** Siapkan: key cadangan aktif, `YUI_MODEL_FALLBACK`, DB fresh, `workspace/reports` bersih, laptop+video cadangan · *S · 0.25d*
- [ ] **W7-S3** BUFFER 100% (tanpa fitur baru) · *S · sisa hari*

## G-DEMO — Gerbang Demo (definisi selesai W)

- [ ] Chat streaming dari provider OpenAI-compatible
- [ ] Persona picker → sesi baru; 4 persona tampil
- [ ] Ekspresi bereaksi ≥5 state nyata
- [ ] Agent memuat skill via `skills_list`→`skill_view` dan mengikutinya
- [ ] ≥1 tool MCP dipanggil sukses
- [ ] Conductor mendekomposisi & mendelegasikan ke ≥2 persona; progress+ringkasan tampil
- [ ] Approval inline; approve lanjut, deny dihormati
- [ ] Refresh → resume via replay; pertanyaan lanjutan dijawab dari konteks
- [ ] Semua tipe UI dari `@yui/contracts` (grep tipe tangan = 0)
- [ ] Video backup tersimpan

---

## P0 — Kernel penuh: bayar utang demo (±3 minggu)

> Tujuan: kernel production-grade. Grep `DEMO-SHORTCUT` di repo = daftar utang.

### P0-INF (infra & arsitektur)

- [ ] **P0-INF-1** Split `apps/api` (service terpisah Fastify) — core keluar dari proses Next.js · *A · 2d* → web bicara HTTP ke api, bukan import in-process
- [ ] **P0-INF-2** Konfigurasi terpusat (env module + validasi zod + fail-fast) · *A · 0.5d*
- [ ] **P0-INF-3** Logging terstruktur (pino) + `traceId` per turn ter-propagasi ke semua event/log · *B · 1d*
- [ ] **P0-INF-4** Error taxonomy konsisten (provider/tool/internal + kode) · *A · 1d*
- [ ] **P0-INF-5** Docker compose dev (web+api+db) + README update · *B · 1d*
- [ ] **P0-INF-6** CI: lint+typecheck+test di PR (GitHub Actions), turbo cache · *B · 1d*

### P0-SEC (sandbox & keamanan)

- [ ] **P0-SEC-1** Sandbox container untuk `run_command` (Docker exec, resource cap, timeout, network default-deny) · *A · 3d · dep P0-INF-5* → perintah berjalan di container sekali-pakai; egress diblokir default
- [ ] **P0-SEC-2** Redaction secrets dari log & tool result (pola `redact` Hermes) · *B · 1d* → test: key menyamar di semua jalur output
- [ ] **P0-SEC-3** Path policy ketat + workspace isolation test suite · *A · 1d*
- [ ] **P0-SEC-4** Approval timeout + auto-deny policy (ganti shortcut no-deadline) · *A · 0.5d*

### P0-DATA (persistence)

- [ ] **P0-DATA-1** Migrasi SQLite → Postgres (Drizzle): sessions/messages/events/jobs + migration script · *B · 2d · dep P0-INF-5*
- [ ] **P0-DATA-2** Retention & housekeeping (events > N hari → arsip) · *B · 1d · dep P0-DATA-1*
- [x] **P0-DATA-3** Approval pending persist (survive restart — ganti Map in-process) · *A · 1d* → ✅ dev-10: tabel `approvals` + `approval_memory` (SQLite) — request pending tercatat; restart → sweep `expirePendingApprovals()` menandai **expired** + event `approval.expired` (kartu UI “Kedaluwarsa — server direstart”, bukan 404); **“Setujui & ingat” lintas restart** (dimuat ulang per engine); live promise tetap in-process (turn mati bersama proses — resume turn = pekerjaan P1)

### P0-CORE (loop robustness)

- [x] **P0-CORE-1** AbortSignal end-to-end: cancel turn dari UI (interrupt & redirect) · *A · 2d* → tombol stop bekerja < 500ms — ✅ v0 sesi dev 10 (`f429e8d`): AbortController per sesi di runtime → signal ke provider (OpenAI SDK abort HTTP in-flight, tak menunggu timeout 120 dtk) + loop checks (awal iterasi / catch provider = abort bukan error / antar tool round); keluar **graceful** — parsial tersimpan + catatan "turn dibatalkan user" + event `turn.cancelled` + persona idle; REST `/api/sessions/:id/cancel`; tombol ■ di composer. Sisa: propagasi ke sesi anak delegasi (anak lanjut di background) & redirect mid-delegation
- [x] **P0-CORE-2** Provider retry + fallback model (`YUI_MODEL_FALLBACK`) + cooldown · *A · 1.5d* → provider mati → fallback jalan otomatis — ✦ parsial sesi dev 9 (timeout 120 dtk + retry transien ×2); ✅ **penuh sesi dev 10** (`43387b5`): loop attempt-chain primary → fallback SEKALI (fallback sukses → iterasi lanjut di fallback, jangan bolak-balik), `markUnhealthy` → cooldown 5 mnt (resolve berikutnya langsung fallback, tak buang 2 retry lagi ke model sekarat); fallback bisa dari `YUI_MODEL_FALLBACK`, persona.yaml, atau override Settings; +2 test loop (fallback aktif, both-fail tetap session.error bersih)
- [ ] **P0-CORE-3** Repetition guard + iteration budget proper (pola Hermes) · *A · 1d* — ✦ parsial sesi dev 9: guard tool-round identik 3× → nudge sistem; budget 12→16 iter (`YUI_MAX_ITER`) + **budget-habis kini graceful** (pesan "ketik lanjutkan" + state done, bukan error mentah)
- [ ] **P0-CORE-4** Compression v0: summarize aux model saat context > 70% (checkpoint + arsip, satu-satunya mutasi history yang sah) · *A · 3d* → sesi 100+ turn tetap sehat; test invariant append-only kecuali checkpoint
- [ ] **P0-CORE-5** Contract tests CI: (a) history append-only (b) toolset+prompt frozen per sesi · *S · 1d* → gate PR gagal bila invariant dilanggar

### P0-DEL & P0-MCP

- [ ] **P0-DEL-1** Delegation job persist (queue di DB, survive restart, status) · *A · 2d*
- [ ] **P0-DEL-2** Cancel/steer anak dasar dari parent · *A · 1d · dep P0-DEL-1*
- [x] **P0-MCP-1** MCP lifecycle: health check + reconnect backoff + park · *C · 2d* → server mati → reconnect otomatis tanpa crash turn — ✅ dev-10: `transport.onclose/onerror → onDown` (penutupan disengaja difilter flag) → lepas tools + **reconnect backoff 2s/5s/15s/60s/5mnt**; gagal 5× → **PARKED** (badge + tombol ↻ `POST /api/mcp/servers` bypass backoff); **health check ping 30 dtk** (deteksi hang tanpa crash); status `state/lastError/nextRetryAt` di panel MCP
- [ ] **P0-MCP-2** Schema nyata MCP (`t.inputSchema`) menggantikan passthrough · *C · 1d*

### P0-QA & G-P0

- [ ] **P0-QA-1** E2E smoke Playwright: skenario demo §2 otomatis · *B · 2d · dep P0-INF-1*
- [ ] **P0-QA-2** Load ringan: 10 sesi paralel × 5 turn tanpa deadlock/leak · *A+B · 1d*
- [ ] **G-P0** Gerbang: smoke E2E green di CI · contract invariant tests green · sandbox escape test lulus · pino trace per turn terlihat · fallback model terbukti · **retro tim: pelajaran demo → backlog**

---

## P1 — Tiga prioritas penuh + persona v1 + credits v1 (±9 minggu)

### P1-MCP (prioritas #1 — lifecycle & UX penuh)

- [x] **P1-MCP-1** Katalog internal 20 server + UI manajemen (install/uninstall, status) · *C+B · 3d* — ✅ sesi dev 9: katalog kurasi 20 entri (files/web/data/dev/komunikasi/memori; `McpCatalogEntry` kontrak zod + risk rendah|sedang|tinggi + env keys berlabel), install = tulis deklarasi `mcp.json` via `installFromCatalog` (env kosong tidak ditulis, required divalidasi) — **tanpa auto-connect** (fail-closed MCP-3: Trust manual dulu), uninstall = disconnect + hapus; runtime `installMcpServer/uninstallMcpServer` reload config in-memory (`reloadMcpConfig` + substitusi `{workspace}`); REST `GET /api/mcp/catalog`, `POST/DELETE /api/mcp/install`; UI panel MCP: daftar terpasang (badge) + katalog dengan pencarian + form API key (input password) + tombol Lepas; +4 test (env required, timpa, uninstall, entri lama utuh)
- [ ] **P1-MCP-2** OAuth flow MCP di web (Authorization Code + PKCE; token di vault) · *C · 3d*
- [x] **P1-MCP-3** Trust gate per-workspace + izin granular per tool + audit log panggilan · *C+A · 3d* — ✅ sesi dev 7: `workspace/mcp-trust.json` deklaratif **fail-closed** (tanpa trust = server TIDAK dihubungkan; file rusak → tetap tertutup), deny list per tool dievaluasi di handler + REST PUT memicu connect/disconnect dinamis + re-register, setiap panggilan tool MCP ter-audit (server/tool/sesi/hasil/durasi), REST `/api/mcp/servers` + `/api/mcp/audit`, panel MCP di sidebar (toggle trust, status live, audit tail); +8 test; smoke live: untrust→putus, trust→14 tools, deny→ditolak, audit terisi. (Katalog install UI = P1-MCP-1; OAuth = P1-MCP-2)
- [ ] **P1-MCP-4** MCP worker per-tenant di sandbox (bukan stdio bare) + egress policy · *A · 4d · dep P0-SEC-1*
- [ ] **P1-MCP-5** Sampling & elicitation MCP → server_requests ke klien (pola Hermes) · *C+B · 3d*
- [ ] **P1-MCP-6** Tool list changed → refresh registry next-session + notif UI · *C · 1d*

### P1-MEM (prioritas #2 — learning loop)

- [x] **P1-MEM-1** `USER.md`/`MEMORY.md` manager (append dengan curasi, editable user, halaman "What Yui knows") · *C+B · 3d* — ✅ sesi dev 9: `memory/manager.ts` (read/save penuh dari editor + **appendCurated** dedupe inti catatan + guard + header transparan; USER.md workspace global, MEMORY.md per project), **tool `memory_append`** (scope user|project, tanpa approval — catatan additive milik user; scope project hanya sesi project) di 4 toolset persona, **inject ke system prompt saat sesi dibuat** (frozen, cache discipline — `memoryPromptSection` di runtime & delegasi anak; anak kini mewarisi projectId parent → binding roster anak jalan), REST `GET/PUT /api/memory`, UI **tab "Memori"** (editor dua dokumen + tombol Simpan + flash tersimpan); USER.md yang dulu ditulis-tak-dibaca kini benar-benar dibaca agent; +10 test (manager 6 + tool 4)
- [x] **P1-MEM-2** Nudge pasca-task (prompt learn ringan, aux model) → usul skill/catatan · *C · 2d* — ✅ sesi dev 9: `memory/nudge.ts` — aux call ringan pasca-turn yang melibatkan tool (fire-and-forget, tak memblokir UI): prompt kecil dengan bar tinggi "ragu → none" → verdict JSON {note, scope} → masuk lewat **tool memory_append** (kurasi+dedupe sama) → event baru **`memory.noted`** (chip "✎ Yui mencatat" di chat, kontrak + UI + test). Parse toleran code-fence; provider gagal/JSON rusak → skip aman. Config: `YUI_LEARN_MODEL` (default model utama), `YUI_LEARN=0` matikan. Trace `[yui:trace] nudge …ms → tercatat/skip`. +6 test nudge +2 test kontrak event
- [x] **P1-MEM-3** Skill-create-from-experience: flow penuh (draft → validasi lint → simpan ke domain persona) · *C+A · 3d* — ✅ sesi dev 9 (v0, scope global dulu): `skills/manager.ts` (propose → draf `skills/drafts/<slug>/SKILL.md` status draft; **Terima** = lint parse frontmatter + pindah aktif + buang status; **Tolak** = hapus; duplikat nama ditolak), tool **`skill_propose`** (bar tinggi: pola terbukti & reusable, bukan preferensi → itu memory_append; tanpa approval — validasi user eksplisit di UI) + event `skill.proposed` (chip "🛠 Yui mengusulkan skill" di chat), tab **Skill** (draf: lihat/edit inline → Terima/Tolak; siap pakai: daftar aktif), REST `/api/skills` GET/PUT/POST/DELETE, `skill_propose` di 4 toolsets + hint Learning di PERSONA.md conductor. Fix: `YAML.stringify({})` → "{}" (truthy trap), `listSkills` exclude folder drafts/. "Domain persona" (skill milik persona tertentu, P1-DUN-2) menyusul. +7 test
- [x] **P1-MEM-4** Usage tracking per skill (use/view/patch; `.usage.json` per home) · *C · 1d* — ✅ sesi dev 10 (`75a1ad5`): `.usage.json` per folder skill (views ← `skill_view`, patches ← edit draft & accept — ikut pindah folder saat aktif; used menyusul dihubungkan dungeon/P1-DUN-2), tampil di tab Skill (👁 n · ✎ n · ⚑ n), +1 test
- [x] **P1-MEM-5** `session_search` tool (FTS) — agent menelusuri riwayatnya sendiri · *A · 2d* — ✅ v0 sesi dev 10: `SessionStore.searchMessages` (LIKE, recency, snippet ±60 char, hanya user/assistant — tool result dikecualikan) + tool `session_search` (scope project default / all lintas proyek, hint kapan dipakai) di 5 toolsets persona; FTS5 menyusul bila volume riwayat membesar; +1 test
- [ ] **P1-MEM-6** Memory per-domain persona + blok recall di prompt (frozen per sesi!) · *A · 2d*

### P1-DEL (prioritas #3 — delegation penuh)

- [ ] **P1-DEL-1** Batch paralel (cap per plan) + `delegation.max_concurrent` config · *A · 2d*
- [ ] **P1-DEL-2** Background jobs + notifikasi selesai (web push) · *A+B · 2d*
- [ ] **P1-DEL-3** Steering UI (arahkan/pause anak dari web) · *B · 2d · dep P0-DEL-2*
- [ ] **P1-DEL-4** Isolasi & redaksi konteks anak (anak tidak melihat tool call parent) — audit + test · *A · 1d*

### P1-PER (persona v1 penuh — pilar produk)

- [ ] **P1-PER-1** Art direction doc + pipeline Rive (spec: dimensi, state machine, input, penamaan) · *S+artist · 3d*
- [ ] **P1-PER-2** Aset Rive 6 persona × 7 state (batch: Conductor+Scholar+Scribe dulu) · *artist · berjalan paralel*
  - ✎ dev-10: **Scribe berevolusi jadi persona dokumen** — upload (pdf/xlsx/csv) via tab File → `uploads/`, tool `doc_read` (unpdf + SheetJS), PERSONA.md: baca-dulu-baru-tulis. Menyusul: docx, offset paging doc_read, tabel hasil ekstraksi di UI.
- [ ] **P1-PER-3** Ganti PersonaPortrait fallback → Rive runtime + pre-load · *B · 2d · dep P1-PER-2*
- [ ] **P1-PER-4** Growth tracking (usage → level → varian gratis unlock) + timeline UI · *C+B · 3d*
- [ ] **P1-PER-5** Persona acceptance test blind (perilaku beda nyata antar persona — anti "hanya kosmetik") · *S · 2d* → ≥80% penguji menebak persona benar dari output
- [x] **P1-PER-6** 2 persona tambahan (Analyst, Operator) sesuai roster D9 · *C · 1d* — ✅ v0 dev-10: **Yui Analyst** (expertise data: doc_read + run_command script reproducible, PERSONA.md inspeksi→bersih→hitung→lapor) + **Yui Operator** (otomasi/devops: run_command + mcp__* binding Tailscale, disiplin approval & verifikasi post-aksi); skill seed **data-analysis-basics** (category data, persona analyst) + kategori `data` masuk gating fase research; conductor can_spawn diperbaiki (typo `yui_designer` → hyphen) + 2 persona baru; bentuk Orin: Analyst=diamond, Operator=hex; +3 test roster D9 (manifest valid, delegation koheren, toolset benar)
- [x] **P1-PER-7** **Persona Yui Designer** (roster ke-7 — putusan user v0.5, §7.4): manifest + PERSONA.md + skill seed (design-system basics, design→code handoff, Penpot operation) + potret/tint · *C · 1d* → GET /api/personas menampilkan Designer; delegasi dari Conductor jalan — ✅ sesi dev 10: persona.yaml (spawnable_by conductor) + PERSONA.md (fase design, handoff = HTML satu-file ke `code/` + memo keputusan ke `reports/`) + toolsets + 2 skill seed aktif (`design-system-basics`, `design-to-code-handoff` — format SKILL.md, tags personas yui-designer); shape "tri" Orin sudah tersedia sejak rig v4. Skill Penpot operation menyusul P2-DSN-2

### P1-CRED (SaaS credits v1 — wajib sebelum alpha)

- [ ] **P1-CRED-1** Skema ledger + usage events (per turn: token in/out/cache, sandbox detik) · *A · 2d*
- [ ] **P1-CRED-2** Admission control hold→settle + saldo cache · *A · 2d · dep P1-CRED-1*
- [ ] **P1-CRED-3** Rate limit per workspace (turn/menit, delegation concurrency) · *A · 1d*
- [ ] **P1-CRED-4** UI saldo + burn-rate + attribution per persona/job · *B · 2d · dep P1-CRED-1*
- [ ] **P1-CRED-5** Billing v1: plan sederhana + top-up (Stripe) + webhook · *B · 3d*
- [ ] **P1-CRED-6** Uji akurasi metering: selisih vs tagihan provider < 2% · *A · 1d*

### P1-INF

- [ ] **P1-INF-1** Auth (email+password → magic link) + workspace + tenant scope middleware · *B · 3d*
- [ ] **P1-INF-2** Adapter Anthropic + Gemini + router kualitas/biaya · *A · 2d*
- [ ] **P1-INF-3** Aux routing (title/compression/skill-extract → model murah) · *A · 1d*
- [ ] **P1-INF-4** Observability: trace view per turn (pino + tabel DB) · *B · 2d*
- [ ] **P1-INF-5** Deploy staging (VPS/Fly) + domain + TLS · *B · 1d*

### P1-PRJ — Project entity v0 (Studio §13.2; D14)

- [x] **P1-PRJ-1** Kontrak `Project*` di `@yui/contracts` (ProjectInfo, TaskItem, roster, binding) + tabel DB + CRUD REST `/api/projects` · *A+B · 2d* → create/list/get project; semua tipe dari contracts — ✅ sesi dev 7: `contracts/project.ts` (ProjectInfo/TaskItem/RosterEntry/McpToolBinding + WORKFLOW_PHASES), `core/project/store.ts` (tabel projects+project_tasks), runtime `createProject` (mkdir `workspace/projects/<id>/{code,docs,reports}`), REST GET/POST `/api/projects` + GET/PATCH `/api/projects/[id]`; +5 test contracts, +3 test core; smoke live: create→201, list, patch archive, 404
- [x] **P1-PRJ-2** Isolasi root per project `workspace/projects/<id>/{code,docs,reports}` — file tools & path policy menghormati scope project · *A · 1d · dep P1-PRJ-1* → test: project A tidak bisa baca path project B — ✅ sesi dev 7: kolom `sessions.project_id` (migrasi idempotent db lama) + `CreateSessionRequest.projectId`; loop dibuat dengan workspace efektif per sesi (`effectiveWorkspace`) → semua file-ops + delegation anak otomatis scoped; smoke live: agent tulis `reports/halo.md` → mendarat di root project, workspace global kosong
- [x] **P1-PRJ-3** Roster agent per project (`project.yaml`: persona + peran + fase) — loader + validasi + tampil di UI · *C · 2d · dep P1-PRJ-1* → assign 3 persona ke project demo; roster ter-replay — ✅ sesi dev 7: kontrak `ProjectManifest`+`RosterEntry`, `core/project/roster.ts` (load/save YAML deklaratif), runtime `getProjectRoster/saveProjectRoster` (validasi persona ada + anti-duplikat), REST GET/PUT `/api/projects/[id]/roster`, UI roster di drawer proyek (assign/hapus + fase chips); smoke live: 3 persona assigned, project.yaml ter-replay, unknown persona → 400; +4 test
- [x] **P1-PRJ-4** Tasklist per project (CRUD + status todo/doing/review/done + assignee persona) + tool `todo` agent melihat/menambah task · *C · 1d · dep P1-PRJ-1* → agent menandai task selesai dari turn — ✅ sesi dev 7: ProjectStore CRUD task lengkap (update parsial, refs append bebas duplikat), tools `todo_list/todo_add/todo_update` (scoped sesi project; sesi global → error informatif; cross-project ditolak), REST GET/POST `/api/projects/[id]/tasks` + PATCH `/[taskId]`; toolset persona diperbarui (Conductor full, worker list+update); smoke live: Conductor add→done dari turn; +5 test
- [x] **P1-PRJ-5** Binding MCP project×persona (D17): koneksi server di level project, tool `mcp__<srv>__*` hanya muncul di toolset persona yang di-bind · *C · 2d · dep P1-MCP-3* → test: persona tanpa binding tidak melihat tool MCP — ✅ sesi dev 7: binding dari `project.yaml` (roster entry `mcp:[{server,tools}]`), `applyMcpBinding` di loop — sesi tanpa project/persona tanpa binding → SEMUA `mcp__*` disembunyikan (fail-closed); binding penuh (`tools:[]`) = prefix `mcp__<srv>__*`, tool spesifik = nama persis; delegation anak mengikuti roster persona anak; UI: pilihan "Bind MCP" saat assign roster + chips binding; smoke live GLM: Conductor ter-bind memanggil `mcp__filesystem__list_allowed_directories` → audit terisi; +3 test filter
- [x] **P1-PRJ-6** UI: project picker + project home (shell v0: chat + roster sidebar) — sesi melekat ke project · *B · 2d · dep P1-PRJ-3* → buka project → sesi persona di scope project — ✅ sesi dev 7: `ProjectPanel` (sidebar: buat/pilih project, persist localStorage), sesi dibuat dengan `projectId`, badge project di chat-header, panel drawer kanan = roster (assign/hapus persona) + tasklist (tambah manual, cycle status, auto-refresh saat agent panggil `todo_*`); **UX sesi dev 7 (usulan user):** PersonaPicker dihapus dari sidebar (sisa: Proyek + MCP) — klik project = sesi PROJECT LEAD otomatis (Conductor; persona spesialis dijangkau via delegasi, bukan pilihan manual), scope Workspace memilih persona lewat kartu di tengah layar, ganti persona = dropdown wajah di chat-header; composer kini juga tampil di state kosong (dulu hanya tag saran); **resume percakapan:** klik project yang sudah punya sesi = sesi TERBARU dibuka ulang via replay SSE (`?since=0`, context berlanjut — smoke live: agent mengulang jawaban turn sebelumnya), bagian “Sesi” di drawer = riwayat + tombol “+ Sesi baru (Conductor)”, REST `GET /api/sessions?projectId=` + `listProjectSessions` (terbaru-dulu dari last event)
- [x] **P1-PRJ-7** TaskTree model (D19): TaskNode hierarki `{id,parent,title,status,assignee,refs(job/step),artefak}` + event `task.node.*`; TaskList = proyeksi flat dari tree · *A · 1.5d · dep P1-PRJ-1* → refresh → pohon utuh dari replay (tanpa state kedua) — ✅ sesi dev 7: kontrak `TaskNode`+`ProjectEvent` (discriminated union `task.node.created/updated`), tabel `project_events` (append-only) — ProjectStore menulis event DI TRANSAKSI yang sama dengan mutasi task (REST & tool `todo_*` semua lewat sini → tak bisa drift), proyektor murni `taskTreeFromEvents` + `flattenTree`, REST GET `/api/projects/[id]/tree`, `parentId` di CreateTaskRequest + `addArtefak` di UpdateTaskRequest; smoke live: pohon nested + artefak ter-replay; +4 test (total 49)

### P1-DUN — Dungeon: arena latihan persona (Studio §13.8; D20)

- [x] **P1-DUN-1** Tipe ruang `dungeon` (bukan project produksi) + format misi `mission.yaml` (goal, sumber belajar, acceptance, skill target) + runner sesi sandbox terisolasi · *C · 1d* → misi contoh "riset dokumentasi Phaser" parse & jalan — ✅ v0 dev-10: kolom `projects.kind` (migration ringan); misi di `workspace/dungeons/<slug>/mission.yaml` (zod `Mission`, seed **phaser-research**); runner = ruangan project kind `dungeon` (session otomatis sandbox ke folder misi via machinery P1-PRJ-2), prompt misi WAJIB ditutup `skill_propose`; run async + persist `runs.json` (restart → sweep failed; 1 run aktif/misi); REST `/api/dungeons`; UI v0 di tab Skill. Arena penuh = P1-DUN-4
- [x] **P1-DUN-2** Skill inventory per persona: registry skill milik + lifecycle `draft→tested→ready` (sambungan flow P1-MEM-3) + UI daftar "apa yang persona ini bisa" · *C+B · 2d* → persona menampilkan skill + statusnya — ✅ v0 dev-10: loader parse `metadata.yui.status` + `personas` (default seed = ready); **accept draft = `tested`** (review manusia; blind-eval DUN-3 yang naikkan `ready`); `setSkillStatus` untuk DUN-3; tab Skill tampil chip status (`◐ diuji manusia`/`✓ siap`) + persona pemilik; dungeon run menghasilkan draft milik persona
- [x] **P1-DUN-3** Eval acceptance skill: misi verifikasi buta otomatis (hanya lulus bila skill benar) + threshold `tested→ready` (§12.17) · *S · 2d · dep P1-DUN-1* → skill lulus eval berubah jadi `ready` — ✅ v0 dev-10: evaluator buta = **sesi hakim fresh** persona misi di ruangan dungeon yang sama (anti-bias: nilai hanya dari kriteria acceptance + bukti folder + `skill_view`); verdict `VERDICT: LULUS/GAGAL` baris terakhir (parser ambil TERAKHIR, anti draft di tengah); lulus → `setSkillStatus` ready; hasil persist `.eval.json` per skill (pending/pass/fail + alasan + judgeSessionId); trigger manual tombol **Eval buta** di tab Skill (REST `POST /api/skills/eval`, async — polling field `eval` GET /api/skills); hanya skill `tested` dengan misi target cocok yang bisa dieval
- [ ] **P1-DUN-4** Dungeon UI (arena): pilih persona → jalankan misi → progress live → skill dihasilkan · *B · 2d · dep P1-DUN-1..3* → 1 persona selesai misi research nyata & skill-nya `ready`
- [x] **P1-DUN-5** Assign gating: roster project menampilkan skill readiness persona; persona tanpa skill fase ditandai “belum siap” · *C · 1d · dep P1-DUN-2 + P1-PRJ-3* → roster menandai siap/belum per fase — ✅ v0 dev-10: peta fase→kategori skill (`readiness.ts`: research/design/develop/testing/documentation; planning & delivery = inti tanpa gating); readiness = skill milik persona (tested/ready, draft tidak) kategori fase; REST roster GET + field `readiness`; UI roster chip per fase `research ✓ / ✕` (tooltip skill siap / hint latih di Dungeon)

### P1-MDL — Multi-model per persona (Studio §13.10; D21)

- [x] **P1-MDL-1** Kontrak & runtime: `model` + `model_fallback` per persona di persona.yaml; parent & tiap delegation anak resolve model persona masing-masing · *A · 1d* → Conductor & Scholar jalan di model berbeda dalam 1 run — ✅ sesi dev 10 (`43387b5`): `model-router.ts` (urutan resolusi: **override file Settings** `data/model-overrides.json` → **persona.yaml** `model.primary.name/.fallback` → default env getter hot-swap); `LoopDeps.routeModel(personaId)` — loop & delegasi anak resolve per persona; UI Settings tabel "Model per persona" (blur = simpan, kosong = default) + REST `/api/settings/models`; kontrak `ModelRoutes`/persona `ModelRoute.name/fallback`; +11 test router. P1-MDL-2 (router kualitas/biaya) & MDL-3 (indikator biaya) menyusul
- [ ] **P1-MDL-2** Router model: map peran→model + smoke test kecil per model (tool-call 2 langkah; quirk dinetralkan `normalizeToolSchema` — pelajaran GLM 1210) · *A · 1.5d · dep P1-MDL-1* → model gagal smoke → fallback otomatis
- [ ] **P1-MDL-3** UI settings: model picker per persona + indikator biaya + metering per persona tetap akurat (sambung P1-CRED-4) · *B · 1d · dep P1-MDL-1* → ganti model persona tanpa restart

### G-ALPHA — SIAP TESTING #1 (internal alpha)

- [ ] Smoke E2E (P0-QA-1) + skenario persona blind test green di staging
- [ ] Metering akurat (<2%) & saldo tidak pernah minus
- [ ] Sandbox: no-escape checklist lulus (path, network, resource, fork bomb)
- [ ] 10 pengguna internal aktif 1 minggu tanpa data loss (session resume 100%)
- [ ] Trace + error dashboard bisa dipakai debugging harian
- [ ] Runbook alpha (known issues + cara lapor)

---

## P2 — Multi-platform & UX penuh (±10 minggu)

### P2-MOB (mobile)

- [ ] **P2-MOB-1** Expo app: shell + generated client dari kontrak · *B · 3d*
- [ ] **P2-MOB-2** Chat streaming + resume di mobile · *B · 3d*
- [ ] **P2-MOB-3** Push notification (Expo Notifications + FCM/APNs) + tap→approve · *B · 3d*
- [ ] **P2-MOB-4** Persona picker + portrait (Rive RN runtime) · *B · 2d*
- [ ] **P2-MOB-5** Mission Control mini (delegation/cron monitor) · *B · 2d*

### P2-DTL (desktop)

- [ ] **P2-DTL-1** Tauri shell + reuse UI web · *B · 2d*
- [ ] **P2-DTL-2** Device relay worker (ambil job eksekusi lokal, report hasil; approval ketat) · *A · 4d*
- [ ] **P2-DTL-3** Auto-update + packaging (NSIS/MSI/DMG) · *B · 2d*

### P2-AGT (autonomy & knowledge)

- [ ] **P2-AGT-1** Cron v1 natural-language + blueprint templates + push delivery · *A · 3d*
- [ ] **P2-AGT-2** Kanban review gates (request_review/approve/request_changes) + UI · *C+A · 3d*
- [ ] **P2-AGT-3** Curator v1 (archive skill basi per persona; konsolidasi opt-in) · *C · 2d*
- [ ] **P2-AGT-4** Knowledge base: upload → ekstrak → index (pgvector) → pin di context · *C+A · 4d*
- [ ] **P2-AGT-5** Vault secrets per workspace (envelope encryption) · *A · 2d*

### P2-BIL & P2-GROW

- [ ] **P2-BIL-1** Billing v2: langganan premium (D11 entitlement lintas platform), invoice, dunning · *B · 3d*
- [ ] **P2-GROW-1** Desain skin/event/achievement (D10) — spec + mockup, tanpa implement · *S · 2d*
- [ ] **P2-GROW-2** Growth timeline UI penuh (level, varian unlock, riwayat skill) · *C+B · 3d*

### P2-FLOW — Workflow engine & monitoring (Studio §13.3; D15)

- [ ] **P2-FLOW-1** Format `workflow.yaml` deklaratif (fase, mode sequential/parallel, steps {persona,task,depends_on}, gate default ON) + validator zod di contracts + template 7 fase (planning→riset→desain→develop→testing→dokumentasi→deliverable) · *C+A · 2d · dep P1-PRJ-3* → template valid parse & lint
- [ ] **P2-FLOW-2** Engine v0: run = DAG → job graph di queue; fase sequential satu-per-satu, fase parallel N delegation anak (cap per project) · *A · 4d · dep P0-DEL-1* → run template di project demo jalan E2E
- [ ] **P2-FLOW-3** Human gate antar fase (reuse approval engine: "fase X selesai — lanjut?") + resume run pasca-restart via replay event · *A · 2d · dep P2-FLOW-2* → kill server mid-run → restart → run lanjut dari fase terakhir
- [ ] **P2-FLOW-4** Event `workflow.started/phase.entered/phase.done/step.started/step.done/workflow.done` (aditif ke YuiEvent) + replay `?since=` · *A · 1d · dep P2-FLOW-2* → board di-refresh → state run utuh
- [ ] **P2-FLOW-5** Monitoring board UI: kolom fase, kartu agent jalan (sequential satu kolom / paralel berdampingan), progress persona, hasil per langkah — live via SSE · *B · 3d · dep P2-FLOW-4* → 2 persona paralel terlihat jalan bersamaan + hasil terkumpul
- [ ] **P2-FLOW-6** Steering mid-run: pause/stop step, reassign ke persona lain, suntik instruksi (pola OpenBot Stop/Resume/Reassign) · *B · 2d · dep P2-FLOW-5* → reassign mid-run tercatat di event & audit
- [ ] **P2-FLOW-7** TaskTree board UI (D19): pohon task→subtask→step dengan kartu agent & status live; sequential/paralel terbaca dari struktur; klik node → sesi agent + steering · *B · 2d · dep P1-PRJ-7 + P2-FLOW-4* → pohon delegasi live; refresh → utuh via replay — *v0 sesi dev 8: tab **Papan** = kanban 4 kolom (Belum/Kerja/Reviu/Selesai) dari flatten TaskTree + task pra-migrasi, drag&drop HTML5 → PATCH status (sinkron tasklist & pohon, auto-refresh saat agent `todo_*`); sisa: kartu agent per langkah + klik node → sesi & steering (dep P2-FLOW-4)*

### P2-STU — Workbench multi-tab & surface (Studio §13.5; D16)

- [ ] **P2-STU-1** Tab shell v0: tab chat/file/board/monitor dalam project home (state per tab; layout kolom desktop) · *B · 2d · dep P1-PRJ-6* → pindah tab tanpa kehilangan state chat
- [ ] **P2-STU-2** Terminal tab: `xterm.js` ↔ PTY di sandbox (generalisasi `run_command`); user & agent share sesi terminal; approval untuk perintah berisiko · *A+B · 4d · dep P0-SEC-1* → agent menjalankan CLI & output muncul di tab yang user lihat
- [x] **P2-STU-3** File tab: tree + viewer + diff hasil edit agent (di atas file tools) · *B · 2d · dep P1-PRJ-2* → diff write_file agent terlihat — ✅ v0 sesi dev 10 (`75a1ad5`) + diff penuh (`4136722`): tab **File** (tree + viewer ≤256 KB, `safeProjectPath` anti-traversal) & **`FileRevisionStore`** — write_file merekam snapshot isi LAMA pra-timpan (cap 20/file, no-op & >256 KB skip) → dropdown "revisi…" di viewer → `diffLines` (LCS, subpath `@yui/core/project/diff`) → diff ±N baris berwarna; +11 test
  - ✎ fix test-user: tree kini via `projectRoot()` absolut (dulu readdir relatif cwd Next → selalu `[]`); auto-refresh 5 dtk + tombol ↻ + ⬆ Upload dokumen.
  - ✎ fix test-user #2: **file tak bisa dibuka** — effect reset di FileTab bergantung identitas `loadTree` (dep `sel`) → tiap klik file sel ter-reset null; kini reset hanya saat ganti project (latest-ref).
  - ✎ **Tim = infinite canvas** (request user): hold-drag = pan (Pointer Events + capture), scroll = geser, Ctrl+scroll/tombol ± = zoom (35–250%), ⌂ reset; grid dot ikut bergeser; tanpa dependency baru.
- [ ] **P2-STU-4** Browser tab v0 read-only: server-side proxy + render (screenshot/DOM), domain allowlist per project, **security review = gerbang** (risiko §11) · *A · 4d · dep P0-SEC-1* → agent membuka URL riset & user melihat halaman yang sama
- [ ] **P2-STU-5** MCP Figma connector (OAuth P1-MCP-2; bind ke persona design — D17) · *C · 2d · dep P1-PRJ-5* → persona design membaca frame Figma di fase desain
- [ ] **P2-STU-6** ~~Eksplorasi pen.dev~~ → **digantikan Penpot** (pen.dev tidak open source — keputusan D18): pindah ke **P2-DSN-1** (eksplorasi repo `D:\projects\penpot`; deliverable sama: laporan referensi)
- [ ] **P2-STU-7** Docs tab: viewer/editor markdown deliverable + ringkasan run · *B · 1d · dep P1-PRJ-6* → laporan run terbuka sebagai doc

### P2-DSN — Pipeline desain→kode via Penpot (Studio §13.9; D18)

- [x] **P2-DSN-1** Eksplorasi Penpot (repo `D:\projects\penpot`, tunggu clone selesai): API publik, plugin system, export/tokens, kemampuan render, **+ opsi mekanisme embed** (iframe scoped / komponen frontend / plugin — rekomendasi untuk tab Design) → laporan `docs/refs/penpot.md` + keputusan cloud vs self-host (§12.15) · *C · 1d* → peta kemampuan API vs kebutuhan studio + rekomendasi mekanisme embed — *verif: `docs/refs/penpot.md` — keputusan: self-host (CSP) + RPC API v0 + iframe share-link viewer + MCP resmi v1 + exporter WASM untuk artefak; checklist verifikasi runtime disiapkan*
- [ ] **P2-DSN-2** Penpot connector — **mekanisme diputuskan (DSN-1)**: jalur utama v0 = **RPC API + access token** (create/update file headless via `update-file`, share-link per halaman, snapshot); MCP server resmi = jalur v1 (Streamable HTTP `/mcp`, plugin di sesi embedded); binding ke persona Designer (D17) · *C · 2d · dep P2-DSN-1 + P1-PRJ-5* → persona Designer membuat/mengubah file Penpot dari dalam turn (headless)
- [ ] **P2-DSN-3** Tab Design = canvas Penpot **TER-EMBED di platform** (bukan link/app terpisah — D18): scope v0 ramping — lihat, navigasi halaman/frame, zoom, artefak ter-link ke node TaskTree; mekanisme embed sesuai DSN-1 · *B · 2d · dep P2-DSN-2 + P2-STU-1* → desain fase `design` terlihat live di tab tanpa keluar app
- [ ] **P2-DSN-4** Pipeline design→kode: fase `develop` membaca file Penpot (shapes + tokens via API) → generate komponen kode → diff di tab File → acceptance di human gate · *A+C · 3d · dep P2-DSN-2 + P2-FLOW-2* → frame sederhana → komponen kode + diff (ekspektasi v0: komponen+tokens, bukan pixel-perfect — D18)
- [ ] **P2-DSN-5** Persona Designer final (roster ke-7 — sudah diputuskan, lihat P1-PER-7): skill seed Penpot dilatih lewat dungeon + misi acceptance · *C · 1d · dep P2-DSN-2 + P1-PER-7* → Designer lulus misi dungeon Penpot → skill `ready`
- [ ] **P2-DSN-6** **Golden path flow ramping** (garansi flow utuh walau fitur lean): E2E test alur — agent Designer buat frame (fase `design`) → user lihat live di tab ter-embed → fase `develop` baca → generate komponen → diff — semua tanpa keluar platform · *S · 1d · dep P2-DSN-3 + P2-DSN-4* → skrip golden path hijau 2× berturut

### G-BETA — SIAP TESTING #2 (closed beta)

- [ ] Mobile TestFlight/Play internal track terdistribusi ke 20 tester
- [ ] Push E2E (approval dari lock screen < 10 detik)
- [ ] Relay desktop: security review (scope tool, approval path) lulus
- [ ] Credits: audit akurasi bulan pertama + refund flow
- [ ] Support channel + feedback widget + triage SLA internal
- [ ] Analytics dasar (activation, retention, cost per workspace)
- [ ] Load: 100 sesi paralel, p95 turn-start < 2 dtk
- [ ] **(Studio)** Run workflow 7-fase template E2E di project demo (≥2 fase paralel) — monitoring board live, resume mid-run lulus
- [ ] **(Studio)** Terminal & browser tab: security review lulus (path, egress, SSRF, allowlist) · binding MCP Figma bekerja di satu persona saja
- [ ] **(Studio v0.5)** TaskTree board live: pohon delegasi utuh via replay; steering per node jalan
- [ ] **(Studio v0.5)** Pipeline Penpot E2E minimal **ter-embed**: canvas hidup di tab Design (user tidak keluar platform); persona Designer produksi file di fase `design` → dikonversi komponen kode di fase `develop`; golden path (P2-DSN-6) hijau
- [ ] **(Dungeon)** ≥1 persona dilatih lewat misi research nyata (mis. Phaser) → skill `ready` → di-assign ke project; gating terlihat di roster
- [ ] **(Multi-model)** ≥2 model berbeda aktif untuk persona berbeda dalam satu run; fallback per persona terbukti; metering per persona akurat

---

## P3 — Ekosistem (coarse; rinci saat masuk fase)

- [ ] Marketplace: persona (fork/remix) + skill + MCP — review otomatis (lint/scan/sandbox smoke) + moderasi + rev-share
- [ ] Teams: multi-user workspace, pool credits, role & permission
- [ ] Voice per persona (STT/TTS streaming)
- [ ] Self-host edition (docker-compose + license server D11 + grace offline)
- [ ] Curator konsolidasi LLM opt-in + backup/rollback

## P4 — Skala (coarse)

- [ ] Visual workflow builder (node graph)
- [ ] Eval harness perilaku persona (regression suite — pola batch_runner Hermes)
- [ ] Sandbox microVM (Firecracker/gVisor) plan enterprise
- [ ] Enterprise: SSO, audit export, BYO-KMS, SLA

---

## Watchlist Risiko (ringkas — detail PLAN §11)

| Risiko minggu demo | Mitigasi sekarang |
|---|---|
| Model ogah mendelegasikan | W0-1 pilih model kuat; W5-C1 3 varian prompt; fallback skenario tanpa Conductor |
| Rive makan waktu | Timebox 3 jam (W3-C1) → fallback CSS sudah final ABI-nya |
| Scope creep | OUT list DEMO-WEEK-1 §3.2; reviewer tolak PR di luar scope |
| SSE race / resume | W4-B2 + W5-A1; replay `?since=` adalah kontrak, bukan bonus |
| Utang demo menumpuk | P0 = fase membayar `DEMO-SHORTCUT`; grep rutin; G-P0 tidak boleh dilewati |
| Workflow engine scope creep | D15: DAG deklaratif template dulu; builder visual = P4; gate antar fase default ON; state hanya lewat event |
| Browser embed = permukaan serangan | D16: proxy server-side default-deny, allowlist per project; review = gerbang P2-STU-4 |
| Paralel = biaya & race | Cap concurrency per project; metering per step; replay untuk debug race (event = sumber kebenaran tunggal) |
| Studio menggeser kernel | Urutan P1-PRJ → P2-FLOW → P2-STU; kernel tidak boleh tahu UI (contract-first) |
| Dungeon skill basah | Eval acceptance wajib (blind test P1-PER-5) + curator (P2-AGT-3); misi hanya di sandbox; tanpa lulus = tetap `draft` (D20) |
| Multi-model quirk & biaya | Normalisasi schema terpusat (GLM 1210) + smoke test per model + fallback per persona + metering/budget per persona (D21) |
| Penpot ops & API berubah | Mulai token API (cloud/self-host ringan); adapter tipis + pin versi; self-host penuh bareng D11 (D18) |

## Konvensi Task Baru

1. Task baru masuk fase aktif dengan ID berikutnya — jangan sisipkan di tengah.
2. Task tanpa owner = belum siap dikerjakan.
3. Task > 2d harus dipecah saat planning.
4. Setiap bugfix P0/P1 menambah 1 test invariant bila relevan (pola Hermes: 1–2 invariant test per fix).
