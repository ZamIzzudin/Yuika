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

## Peta Fase & Gerbang

| Fase | Isi | Durai (3 dev) | Gerbang keluar |
|---|---|---|---|
| **W0–W7** | Demo internal (vertical slice) | 1 minggu | **G-DEMO** — demo 8 menit lulus |
| **P0** | Kernel penuh — bayar utang demo | ±3 minggu | **G-P0** — kernel production-grade |
| **P1** | MCP penuh · memory loop · delegation penuh · persona v1 · credits v1 | ±9 minggu | **G-ALPHA — SIAP TESTING #1 (internal alpha)** |
| **P2** | Mobile · desktop+relay · curator · cron · kanban · KB · vault · billing v2 | ±10 minggu | **G-BETA — SIAP TESTING #2 (closed beta)** |
| **P3** | Marketplace · teams · voice · self-host | ±3–4 bulan | G-P3 |
| **P4** | Workflow builder · eval · enterprise | berkelanjutan | — |

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
- [ ] **W2-C2** Prompt stack frozen per sesi ([core][persona][skills index]) · *C · 0.5d · dep W1-C1* → system_prompt tersimpan di sessions; test: prompt tidak berubah saat config berubah

## W3 (Rabu) — Approval + ekspresi + persona UX

*Exit: ekspresi reaktif 7 state; approval inline end-to-end; persona → sesi baru.*

- [x] **W3-A1** Approval engine wiring loop (pause/resume turn) + approvalPolicy file tools · *A · 1d* → write di luar reports/ mem-pause turn sampai user jawab — *verif: `delegation.test.ts` (approve → file jadi; deny → dibatalkan)*
- [x] **W3-A2** `run_command` allowlist + selalu approval · *A · 0.5d* → `node -v` jalan setelah approve; tolak = tool error — *verif: `run-command.test.ts`*
- [ ] **W3-B1** ApprovalCard UI (setujui/tolak → POST) · *B · 0.5d · dep W3-A1* → klik setujui melanjutkan turn
- [ ] **W3-B2** `PersonaPortrait` mapping `persona.state` (fallback CSS scaffold) · *B · 0.5d* → 7 state visual berbeda & reaktif
- [ ] **W3-B3** Persona picker → sesi baru bersih (reset state client) · *B · 0.25d*
- [ ] **W3-C1** Integrasi Rive placeholder (file komunitas / blob) — **timebox 3 jam** · *C · 0.5d* → `.riv` termuat via `@rive-app/react-canvas` ATAU fallback CSS tetap (keputusan tercatat)
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
- [ ] **W5-C2** USER.md stub (append 1 catatan preferensi per sesi — label preview) · *C · 0.25d*

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
- [ ] **P0-DATA-3** Approval pending persist (survive restart — ganti Map in-process) · *A · 1d*

### P0-CORE (loop robustness)

- [ ] **P0-CORE-1** AbortSignal end-to-end: cancel turn dari UI (interrupt & redirect) · *A · 2d* → tombol stop bekerja < 500ms
- [ ] **P0-CORE-2** Provider retry + fallback model (`YUI_MODEL_FALLBACK`) + cooldown · *A · 1.5d* → provider mati → fallback jalan otomatis
- [ ] **P0-CORE-3** Repetition guard + iteration budget proper (pola Hermes) · *A · 1d*
- [ ] **P0-CORE-4** Compression v0: summarize aux model saat context > 70% (checkpoint + arsip, satu-satunya mutasi history yang sah) · *A · 3d* → sesi 100+ turn tetap sehat; test invariant append-only kecuali checkpoint
- [ ] **P0-CORE-5** Contract tests CI: (a) history append-only (b) toolset+prompt frozen per sesi · *S · 1d* → gate PR gagal bila invariant dilanggar

### P0-DEL & P0-MCP

- [ ] **P0-DEL-1** Delegation job persist (queue di DB, survive restart, status) · *A · 2d*
- [ ] **P0-DEL-2** Cancel/steer anak dasar dari parent · *A · 1d · dep P0-DEL-1*
- [ ] **P0-MCP-1** MCP lifecycle: health check + reconnect backoff + park · *C · 2d* → server mati → reconnect otomatis tanpa crash turn
- [ ] **P0-MCP-2** Schema nyata MCP (`t.inputSchema`) menggantikan passthrough · *C · 1d*

### P0-QA & G-P0

- [ ] **P0-QA-1** E2E smoke Playwright: skenario demo §2 otomatis · *B · 2d · dep P0-INF-1*
- [ ] **P0-QA-2** Load ringan: 10 sesi paralel × 5 turn tanpa deadlock/leak · *A+B · 1d*
- [ ] **G-P0** Gerbang: smoke E2E green di CI · contract invariant tests green · sandbox escape test lulus · pino trace per turn terlihat · fallback model terbukti · **retro tim: pelajaran demo → backlog**

---

## P1 — Tiga prioritas penuh + persona v1 + credits v1 (±9 minggu)

### P1-MCP (prioritas #1 — lifecycle & UX penuh)

- [ ] **P1-MCP-1** Katalog internal 20 server + UI manajemen (install/uninstall, status) · *C+B · 3d*
- [ ] **P1-MCP-2** OAuth flow MCP di web (Authorization Code + PKCE; token di vault) · *C · 3d*
- [ ] **P1-MCP-3** Trust gate per-workspace + izin granular per tool + audit log panggilan · *C+A · 3d*
- [ ] **P1-MCP-4** MCP worker per-tenant di sandbox (bukan stdio bare) + egress policy · *A · 4d · dep P0-SEC-1*
- [ ] **P1-MCP-5** Sampling & elicitation MCP → server_requests ke klien (pola Hermes) · *C+B · 3d*
- [ ] **P1-MCP-6** Tool list changed → refresh registry next-session + notif UI · *C · 1d*

### P1-MEM (prioritas #2 — learning loop)

- [ ] **P1-MEM-1** `USER.md`/`MEMORY.md` manager (append dengan curasi, editable user, halaman "What Yui knows") · *C+B · 3d*
- [ ] **P1-MEM-2** Nudge pasca-task (prompt learn ringan, aux model) → usul skill/catatan · *C · 2d*
- [ ] **P1-MEM-3** Skill-create-from-experience: flow penuh (draft → validasi lint → simpan ke domain persona) · *C+A · 3d*
- [ ] **P1-MEM-4** Usage tracking per skill (use/view/patch; `.usage.json` per home) · *C · 1d*
- [ ] **P1-MEM-5** `session_search` tool (FTS) — agent menelusuri riwayatnya sendiri · *A · 2d*
- [ ] **P1-MEM-6** Memory per-domain persona + blok recall di prompt (frozen per sesi!) · *A · 2d*

### P1-DEL (prioritas #3 — delegation penuh)

- [ ] **P1-DEL-1** Batch paralel (cap per plan) + `delegation.max_concurrent` config · *A · 2d*
- [ ] **P1-DEL-2** Background jobs + notifikasi selesai (web push) · *A+B · 2d*
- [ ] **P1-DEL-3** Steering UI (arahkan/pause anak dari web) · *B · 2d · dep P0-DEL-2*
- [ ] **P1-DEL-4** Isolasi & redaksi konteks anak (anak tidak melihat tool call parent) — audit + test · *A · 1d*

### P1-PER (persona v1 penuh — pilar produk)

- [ ] **P1-PER-1** Art direction doc + pipeline Rive (spec: dimensi, state machine, input, penamaan) · *S+artist · 3d*
- [ ] **P1-PER-2** Aset Rive 6 persona × 7 state (batch: Conductor+Scholar+Scribe dulu) · *artist · berjalan paralel*
- [ ] **P1-PER-3** Ganti PersonaPortrait fallback → Rive runtime + pre-load · *B · 2d · dep P1-PER-2*
- [ ] **P1-PER-4** Growth tracking (usage → level → varian gratis unlock) + timeline UI · *C+B · 3d*
- [ ] **P1-PER-5** Persona acceptance test blind (perilaku beda nyata antar persona — anti "hanya kosmetik") · *S · 2d* → ≥80% penguji menebak persona benar dari output
- [ ] **P1-PER-6** 2 persona tambahan (Analyst, Operator) sesuai roster D9 · *C · 1d*

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

### G-BETA — SIAP TESTING #2 (closed beta)

- [ ] Mobile TestFlight/Play internal track terdistribusi ke 20 tester
- [ ] Push E2E (approval dari lock screen < 10 detik)
- [ ] Relay desktop: security review (scope tool, approval path) lulus
- [ ] Credits: audit akurasi bulan pertama + refund flow
- [ ] Support channel + feedback widget + triage SLA internal
- [ ] Analytics dasar (activation, retention, cost per workspace)
- [ ] Load: 100 sesi paralel, p95 turn-start < 2 dtk

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

## Konvensi Task Baru

1. Task baru masuk fase aktif dengan ID berikutnya — jangan sisipkan di tengah.
2. Task tanpa owner = belum siap dikerjakan.
3. Task > 2d harus dipecah saat planning.
4. Setiap bugfix P0/P1 menambah 1 test invariant bila relevan (pola Hermes: 1–2 invariant test per fix).
