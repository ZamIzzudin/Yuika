# YOUR-YUI — Blueprint Platform Agent Multi-Platform

> Dokumen perencanaan **v0.6** — diperbarui setelah putaran keputusan kedua (lihat §2),
> perluasan visi Studio Proyek (§13), dan pilar v0.5 (§13.7–13.10).
> Disusun dari pembelajaran mendalam `hermes-agent` (Nous Research) + brainstorming
> konsep dari ekosistem tools lain. Status: draft aktif — eksekusi demo dimulai.
>
> **Changelog v0.6:** **Persona Project Manager (Liebert Yui — D22)** untuk project skala
> besar: division of labor planning (Planner: brainstorm `consult` multi-persona → dokumen
> perencanaan → task list detail dengan acceptance/depends_on/assignee) vs eksekusi
> (Conductor: delegasi sequential/paralel) · matriks tanggung jawab + metrik keluaran per
> fase flow · dashboard progres terukur · iterasi = run berantai (§13.3.1, P2-PM).
>
> **Changelog v0.5:** **Penpot menggantikan pen.dev** (open source — §12.11, §13.9) ·
> **TaskTree & TaskList** sebagai struktur pemantauan delegasi (§13.7) · **Dungeon** =
> arena latihan persona: misi → skill (draft→tested→ready) → assign gating (§13.8) ·
> **Multi-model per persona** (persona.yaml `model`+`fallback`, §13.10) · pipeline
> **desain→kode** di fase develop (§13.9) · keputusan D18–D21.
> Putusan lanjutan: **Picasso Yui resmi masuk roster** (D9 = 7 persona, §7.4) · Penpot
> **wajib ter-embed di platform** — bukan app terpisah; scope v0 **ramping tapi flow utuh**
> (tangga embed §13.9).
> Putusan maskot: **Orin v4** (docs/Orin v4 – Pilih Maskot) menggantikan rig v2 — lebih
> sederhana: **satu rig mata untuk semua bentuk** (ekspresi konsisten & simetris),
> **identitas persona = bentuk** (bola/awan/tetes/kotak/segitiga), siap Rive dengan input
> `shape` 0–4 (satu file .riv untuk semua persona).
>
> **Changelog v0.4:** visi **Studio Proyek multi-agent** (§13): project = entitas first-class
> (kode+docs+tasklist+struktur agent masing-masing) · workflow deklaratif 7 fase
> (planning→riset→desain→develop→testing→dokumentasi→deliverable) dengan mode
> sequential/paralel per fase · monitoring board · workbench multi-tab (terminal, browser,
> file, board) · MCP binding granular project×persona (Figma, pen.dev) · referensi baru:
> OpenBot (`D:\projects\openbot`) untuk pola UX rich desktop · keputusan D14–D17.
>
> **Changelog v0.3:** Pure TypeScript dikunci (D7) · ekspresi persona = animasi Rive (D8) ·
> roster 6 persona disetujui (D9) · growth gratis + skin berbayar kosmetik/event/achievement
> (D10) · self-host = lisensi berbayar wajib akun premium lintas platform (D11) · model =
> kunci provider langsung OpenAI-compatible (D12) · **demo internal 1 minggu (D13)** dengan
> rencana eksekusi di [`DEMO-WEEK-1.md`](./DEMO-WEEK-1.md).
>
> **Changelog v0.2:** ekosistem tertutup (tanpa integrasi messaging pihak ketiga) ·
> persona-per-keahlian jadi pilar produk (§7 baru) · model bisnis SaaS credits (§8 baru) ·
> analisis ulang Python vs Pure TS dengan constraint baru (§9) · roadmap di-prioritas ulang:
> MCP, memory learning-loop, delegation naik ke Fase 1 (§10) · integrasi messaging dihapus.

---

## Daftar Isi

1. [Ringkasan Eksekutif & Vision](#1-ringkasan-eksekutif--vision)
2. [Keputusan yang Sudah Diambil](#2-keputusan-yang-sudah-diambil)
3. [Meta-Prinsip dari Hermes yang Diwarisi](#3-meta-prinsip-dari-hermes-yang-diwarisi)
4. [Diseksi Konsep Hermes → Adopsi untuk Yuika](#4-diseksi-konsep-hermes--adopsi-untuk-yuika)
5. [Konsep dari Ekosistem Lain untuk Di-Assemble](#5-konsep-dari-ekosistem-lain-untuk-di-assemble)
6. [Arsitektur Yuika](#6-arsitektur-yuika)
7. [Sistem Persona Yui (pilar produk)](#7-sistem-persona-yui-pilar-produk)
8. [SaaS Credits: Metering & Billing](#8-saas-credits-metering--billing)
9. [Keputusan Bahasa: Python vs Pure TypeScript](#9-keputusan-bahasa-python-vs-pure-typescript)
10. [Roadmap Bertahap (di-prioritas ulang)](#10-roadmap-bertahap-di-prioritas-ulas)
11. [Risiko & Mitigasi](#11-risiko--mitigasi)
12. [Pertanyaan Terbuka Berikutnya](#12-pertanyaan-terbuka-berikutnya)
13. [Studio Proyek: Multi-Project Agent OS (pilar v0.4–v0.5)](#13-studio-proyek-multi-project-agent-os-pilar-v04v05)

---

## 1. Ringkasan Eksekutif & Vision

### 1.1 Pernyataan vision

**Yuika** adalah platform AI agent yang berjalan **hanya** di permukaan milikmu sendiri —
web (termasuk self-hosted), mobile, dan desktop — dengan satu inti agent yang sama di cloud.
Yui bukan chatbot generik: dia adalah **keluarga persona spesialis** — Hiro Yui, Einstein Yui,
Sherlock Yui — masing-masing dengan ilustrasi, kepribadian, skill set, dan memori keahlian
sendiri, yang tumbuh lewat learning loop, bekerja terjadwal, dan **saling mendelegasikan**
pekerjaan. Pengalaman "teman kerja yang hidup", bukan "alat".

**Tagline kandidat:** *"Yuika. Everywhere — but only yours."*

### 1.2 Diferensiasi inti

| Dimensi | Hermes | Yuika |
|---|---|---|
| Model deployment | Local-first: CLI/TUI di mesin user + gateway VPS | **Server-first**: runtime agent di cloud-mu; klien web/mobile/desktop bicara ke satu API; opsi self-host web |
| Ekosistem | Terbuka: 28 platform messaging, API publik | **Tertutup & terkurasi**: hanya aplikasi Yuika (web/mobile/desktop). Notifikasi via push milik sendiri |
| Multi-user | 1 orang multi-profile | **Multi-user + workspace** sejak desain awal (auth, billing, isolasi tenant) |
| Bisnis | Open source gratis (BYOM) | **SaaS credits**: compute (LLM, sandbox, storage) dibayar dengan kredit |
| Identitas agent | Agent generik + personality ringan | **Persona per keahlian sebagai pilar**: ilustrasi unik, prompt layer, skill bundle, toolset, memori domain, dan *growth* per persona |
| Marketplace | Plugin catalog maintainer-kurasi | **Marketplace** (fase lanjut): persona, skill, MCP connector |

### 1.3 Goals non-fungsional (tidak berubah dari v0.1)

- **Satu kontrak, semua klien** — wire protocol dideklarasikan sekali; klien web/mobile/desktop
  di-generate dari kontrak yang sama.
- **Narrow waist** — core runtime kecil; kapabilitas masuk lewat tepi (skill → MCP → plugin).
- **Prompt caching is sacred** — history append-only; satu-satunya mutasi sah = compression
  (dengan checkpoint). Di SaaS, cache hit rate = metrik margin.
- **BYOM-ready tapi credits-first** — provider abstraction sejak hari pertama; default user
  membeli kredit, bukan mengurus API key.
- **Execution di sandbox** — semua kode/terminal/MCP user berjalan terisolasi; device relay
  (desktop user) sebagai opsi untuk data sensitif.

---

## 2. Keputusan yang Sudah Diambil

| # | Keputusan | Konsekuensi arsitektural |
|---|---|---|
| D1 | **Tim** (bukan solo) | Roadmap bisa paralel (core / web / mobile-desktop / infra); standar review & contract discipline lebih penting |
| D2 | Bahasa core: **dianalisis ulang di §9** (rekomendasi berubah jadi Pure TS dengan syarat) | Menentukan monorepo shape & codegen pipeline |
| D3 | Bisnis: **SaaS credits** | Metering, ledger, admission control, dashboard burn-rate wajib sejak Fase 1 (§8) |
| D4 | **Ekosistem tertutup** — tanpa integrasi messaging/API pihak ketiga | Hilang: 28 adapter platform, pola token-lock lintas platform, API publik OpenAI-compatible (opsi lanjut saja). Notifikasi = push notification milik sendiri (FCM/APNs/web push). **Sederhanasi besar** |
| D5 | **Persona per keahlian** + ilustrasi unik per persona | Persona = entitas first-class: manifest, prompt layer, skill/toolset binding, memori domain, asset pipeline (§7) |
| D6 | Prioritas fitur: **MCP, memory learning-loop, delegation** | Ketiganya naik ke Fase 1; persona v1 (infrastruktur data) juga Fase 1 karena terkait erat |
| D7 | **Pure TypeScript dikunci** (tim 3 orang, TS-dominan semua) | Monorepo TS: npm+turbo, kontrak zod, Node+Fastify, Next.js/Expo/Tauri — detail §9.4 |
| D8 | Ekspresi persona = **animasi**; teknologi rekomendasi **Rive** (state machine interaktif, runtime web/RN/desktop) | Spec asset & pemetaan state di §7.6; fallback Spine/Lottie dilihat bersama artist |
| D9 | Roster persona (§7.4) — **7 persona per v0.5** (semula 6): Conductor + 6 spesialis — **+Picasso Yui** (putusan user v0.5, §12.16) | Conductor + spesialis; ilustrasi = workstream paralel non-blocking |
| D10 | Varian ilustrasi **gratis by usage**; monetisasi kosmetik via **skin berbayar + event musiman + achievement** (konsep baru) | Garis keras: tidak ada pay-to-win — skin murni kosmetik, keahlian persona tidak pernah dijual (§7.6) |
| D11 | Self-host = **lisensi berbayar + wajib akun premium**; premium = entitlement akun lintas platform (sekali premium → web+mobile+desktop) | Butuh license/entitlement service + validasi saat start + grace offline (§8.3) |
| D12 | Model = **kunci provider langsung, OpenAI-compatible saja** untuk sekarang | Tetap di belakang interface `ProviderAdapter`; adapter lain (Anthropic native, dll.) menunggu Fase 1 |
| D13 | **Demo internal: 1 minggu** | Vertical slice terkompresi dari Fase 0; rencana harian 3 dev: `DEMO-WEEK-1.md` |
| D14 | **Project = entitas first-class** di atas workspace: kode + docs + tasklist + struktur agent + histori + binding MCP sendiri (§13) | Layer data & kontrak baru (bukan folder biasa); isolasi path per project; semua sesi/delegation/run melekat pada project |
| D15 | **Workflow = DAG deklaratif per fase** (bukan free-form graph): template 7 fase bawaan; mode `sequential`/`parallel` per fase; human gate antar fase default | Engine di atas job queue (P0-DEL-1 diperluas); builder visual node-graph menyusul Fase 3; kontrak event `workflow.*` aditif |
| D16 | **Terminal & browser = permukaan (surface) dari tool yang sudah ada**, bukan sistem paralel: terminal = PTY di sandbox (`run_command` generalisasi), browser = server-side proxy dari `web_fetch`/browser tool | Workbench multi-tab web/desktop; pola OpenBot (browser persisten + agent control) jadi referensi; keamanan = review wajib |
| D17 | **MCP binding granular: project × persona × tool** — koneksi sekali (OAuth, vault), turunannya di-scope per persona di project tertentu | Pain point utama user: MCP semacam Figma “menempel” sebagai skill persona yang punya tanggung jawab; audit log per binding |
| D18 | **Penpot = mesin desain studio yang TER-EMBED di platform** (open source; menggantikan pen.dev yang tidak open source): user tidak pernah keluar Yuika — canvas desain hidup di dalam tab Design; persona Designer memproduksi/mengubah file via API, dan fase `develop` membaca file → generate kode | Kebutuhan user v0.5: embedded, bukan app terpisah; **scope v0 ramping tapi flow utuh** (lihat tangga embed §13.9); mekanisme embed pasti (iframe scoped / komponen frontend / plugin) = hasil eksplorasi P2-DSN-1; ekspektasi hasil = komponen + design tokens, bukan pixel-perfect |
| D19 | **TaskTree = hierarki pemantauan delegasi** (task → subtask → step → job agent) yang **diproyeksikan dari event**, bukan state kedua | TaskList (board) = flat view dari tree; refresh/reconnect = replay; status paralel/sequential terlihat dari struktur node |
| D20 | **Dungeon = arena latihan persona**: misi (research/praktik/template) → skill dengan lifecycle `draft→tested→ready`; assign ke project digating skill readiness | Bukan fine-tuning bobot model — skill = file deklaratif + memory domain; rigor eval = kunci kualitas (blind test + curator) |
| D21 | **Model per persona**: persona.yaml `model` + `fallback` — tiap loop (parent & delegation anak) resolve model persona masing-masing | Quirk provider dinetralkan terpusat (`normalizeToolSchema` — pelajaran GLM 1210); metering per persona (P1-CRED-4) |
| D22 | **Persona Project Manager (Liebert Yui, roster ke-8)**: pemisah peran PLANNING vs EKSEKUSI — Planner: brainstorm multi-persona terstruktur (`consult`) → dokumen perencanaan → task list detail (acceptance, depends_on, assignee); Conductor: delegasi eksekusi sequential/paralel. Tiap fase flow punya owner + metrik keluaran terukur (RACI ringan); iterasi besar = run berantai (delta + regresi), bukan restart | Untuk project skala besar dengan puluhan-ratusan task & iterasi berulang; butuh engine P2-FLOW; brainstorm = prompt terstruktur bukan chat bebas (output deterministik, ter-audit) |

---

## 3. Meta-Prinsip dari Hermes yang Diwarisi

Pola berpikir yang membuat Hermes tumbuh besar tanpa roboh — berlaku umum, wajib diwarisi:

### 3.1 The Narrow Waist + Footprint Ladder

Setiap tool core dikirim di setiap API call → biaya menambah core sangat tinggi. Urutan tempat
kapabilitas baru mendarat:

```
extend existing → skill (markdown) → service-gated tool → MCP connector → plugin → core tool
```

Tulis ladder ini di contribution guide sejak commit pertama. Pertanyaan wajib tiap PR:
*"bisa jadi skill? MCP? kalau ya, jangan masuk core."*

### 3.2 Prompt Caching is Sacred

Mutasi history / swap toolset mid-conversation = cache miss berulang = margin SaaS tergerus.
Desain: session history **append-only**; toolset & prompt config **dibekukan saat sesi dibuka**;
perubahan (install skill, ganti persona) berlaku **next session** (opt-in `--now`); pengecualian
satu-satunya = compression (dengan checkpoint terarsip).

### 3.3 Contract-First RPC

Hermes menyatakan seluruh wire protocol sebagai model ter-validasi (Pydantic, `extra="forbid"`)
lalu meng-generate TypeScript untuk TUI/Desktop/Web — ganti model → regenerate → compiler
menunjukkan semua yang rusak. Yuika menggeneralisasi: **satu kontrak → semua klien** (§6.3).

### 3.4 Facade + Siblings (anti god-file)

Batas ratchet: fungsi ≤ 300 baris, CC ≤ 20, file ≤ 2000 baris, unit yang overload hanya boleh
turun. Kritis untuk tim + AI-coding-agent workflow (agent cenderung menambah ke file yang ada).

### 3.5 Tenant Scope Eksplisit di Semua Jalur

Versi SaaS dari profile-scope Hermes: setiap request/job/callback/timer membawa
`tenant_id + workspace_id` eksplisit; larangan membaca state global "launch context".
Background job wajib menyimpan scope-nya (bukan mewarisinya dari thread parent).

### 3.6 Behavior Contract Testing

Test perilaku lewat jalur nyata (discovery path, temp workspace), bukan change-detector.
Untuk marketplace nanti: compat contract aditif — field baru = optional, tidak pernah rename.

---

## 4. Diseksi Konsep Hermes → Adopsi untuk Yuika

Status per subsistem: ✅ adopsi penuh · 🔧 adaptasi · ❌ tidak diadopsi (dengan alasan).

### 4.1 Agent Core & Turn Loop — ✅🔧

**Dari Hermes:** turn loop dipecah per fase (assembly → api_call → tool_round → recovery →
finalizer); 3 API mode konvergen ke satu format pesan internal; interrupt; iteration budget;
repetition guard; fallback model chain; overflow handling.

**Adopsi:** pola fase + format internal tunggal + interrupt + budget + fallback — ambil utuh.
**Adaptasi besar:** turn harus jadi **job yang survive restart** (state di DB + event sourcing,
bukan objek in-memory) dan **resumable dari device mana pun** (event replay `events.since=<id>` —
pola `tui_gateway` Hermes sudah membuktikannya).

### 4.2 Tool Registry + Toolsets — ✅🔧

**Dari Hermes:** registry dengan auto-discovery; toolset = grup bernama; `check_fn` menjawab
ketersediaan (TTL-cached, scoped); schema description dilarang menyebut tool toolset lain.

**Adopsi:** registry + toolset + check_fn (di SaaS: check = plan tier, koneksi MCP user,
ketersediaan sandbox). Toolset di-resolve **per-sesi saat dibuat** lalu dibekukan (cache
discipline). Notifikasi `tools/list_changed` (gaya MCP) hanya untuk UI, resolusi tetap next-session.

### 4.3 MCP — ✅✅ (prioritas #1-mu)

**Dari Hermes:** client multi-transport (stdio / Streamable HTTP / SSE), task per server di
background loop, state machine lifecycle (connect → serve → reconnect → park → recycle),
health check, trust record per-profile, OSV malware preflight, OAuth (device flow + manager),
**sampling** (server minta LLM call) & **elicitation** (server minta input user), notifikasi
tool-list berubah; Hermes juga bisa *menjadi* MCP server; 60+ manifest katalog.

**Adopsi untuk Yuika — MCP adalah sistem ekstensi utama:**
- Client multi-transport + lifecycle state machine + health: adopsi penuh.
- **UX lebih baik dari Hermes**: karena klien-mu web/mobile, OAuth & trust flow jadi klik-satu-
  tombol di browser (Hermes harus lewat YAML/terminal).
- **Per-tenant sandbox**: server MCP user berjalan di container terisolasi dengan egress policy
  (kebutuhan multi-user memaksa ini — Hermes bisa stdio bare karena personal).
- **Sampling & elicitation diteruskan ke UI-mu**: MCP server minta input → jadi *server request*
  ke klien (push notification bila perlu) — sinergi dengan pola `server_requests` Hermes.
- **Yuika sebagai MCP server** (fase lanjut, opsional): workspace bisa expose agent-nya
  sebagai MCP server untuk desktop tools — tetap sesuai "tertutup" karena opt-in per workspace.
- Katalog kurasi internal (bukan publik bebas) ±20–30 server populer di awal.

### 4.4 Skills + Learning Loop — ✅✅ (prioritas #2-mu)

**Dari Hermes:** SKILL.md (frontmatter + instruksi + `scripts/`/`references/`/`templates/`),
standar terbuka agentskills.io; **progressive disclosure** (`skills_list` nama+deskripsi saja →
`skill_view` isi penuh — 1000 skill hanya cost satu listing); hub multi-source; usage tracking
(use/view/patch counts, state, pinned); **curator** (archive skill basi, konsolidasi LLM,
backup, rollback; tidak pernah delete); **learning loop** (nudge pasca-task → agent membuat
skill dari pengalaman; skill self-improve; graph visual di desktop).

**Adopsi:**
- Format SKILL.md apa adanya → kompatibel dengan ekosistem skill yang sudah ada.
- Progressive disclosure + `skills_list`/`skill_view` — pola inti.
- **Learning loop naik ke Fase 1**: usage tracking + nudge + skill-create-from-experience.
- 🔧 Kaitkan ke persona (§7): skill yang dipelajari Hiro Yui masuk domain persona itu;
  growth timeline per persona.
- Curator (auto-archive) menyusul di Fase 2.
- Marketplace skill = fase lanjut.

### 4.5 Plugin System — ⚠️ tunda, ambil desainnya

Hook lifecycle (`pre/post_tool`, `pre/post_llm`, `on_session_*`), kinds per-ABC, isolasi host
process, catalog SHA-pinned, compat contract aditif — **desainnya diwarisi sebagai arsitektur
internal** (semua boundary MCP/skill/persona sudah mengikuti bentuk hook), tapi SDK plugin
publik **tidak dibuka di awal** (kompleksitas compat besar; kebutuhanmu tertutup). Buka lagi
saat marketplace (fase 3).

### 4.6 Delegation / Subagents — ✅✅ (prioritas #3-mu)

**Dari Hermes:** child AIAgent context bersih + task sendiri; single/batch paralel (concurrency
cap); background + completion queue; orchestrator/leaf roles; **steering** (arahkan child yang
jalan); worktree isolation; parent hanya melihat summary (context economy); progress event ke UI.

**Adopsi:**
- ✅ Semua konsep di atas. **Adaptasi kunci:** child = **job di queue** (bukan thread) → survive
  restart, jalan di worker pool, terlihat dari semua device; state child di DB
  (queued/running/waiting_input/done/failed); progress via event bus.
- ✅ **Sinergi persona (§7):** `delegate_task(persona="yui-scholar", goal=…)` — child berjalan
  sebagai persona spesialis dengan skill/toolset/memori domain-nya. Ini jadi cara kerja utama:
  "Yui conductor" memecah tugas → mendelegasikan ke spesialis → pengguna melihat tiap persona
  bekerja (dengan ilustrasinya masing-masing).
- Steering & interrupt dari mobile = diferensiasi UX.

### 4.7 Memory & Learning — ✅🔧

**Dari Hermes:** `MemoryProvider` ABC (initialize → prompt_block/prefetch/sync_turn →
tool dispatch → shutdown + `on_pre_compress` checkpoint); MemoryManager; built-in =
`MEMORY.md` + `USER.md` transparan bisa diedit user; nudge persist; session search FTS5 +
LLM summarization → tool `session_search` (agent menelusuri masa lalunya).

**Adopsi:**
- ✅ MemoryProvider ABC (plugin backend menyusul; built-in dulu), USER.md/MEMORY.md transparan
  → halaman "What Yui knows about you", session search tool.
- 🔧 **Tiers eksplisit** untuk dukung persona: *working* (session) / *episodic* (riwayat,
  lintas-persona searchable) / *semantic* (fakta user — global) / *procedural* (skill —
  per-domain persona). User memory global dibagi lintas persona; skill per domain (§7.5).
- 🔧 Aux-model routing untuk tugas memori murah (summarize, extract).

### 4.8 Context Engine & Compression — ✅

ABC pluggable + default summarizer (checkpoint + arsip + watermark), micro-compaction
(elide blok tua), pre-LLM prune. Adopsi penuh; aux model murah untuk compression.

### 4.9 Multi-Surface Gateway (28 platform messaging) — ❌ tidak diadopsi

Keputusan D4. Yang tetap diwarisi dari subsystem ini: **pola adapter + delivery ledger +
token-lock (satu turn aktif per sesi)** — diterapkan pada sink konektor internal-mu
sendiri (web socket, push notification, desktop relay), bukan platform pihak ketiga.

### 4.10 Cron, Goals, Kanban — ✅ (fase 2+)

Cron natural-language + blueprint template (daily briefing, weekly review, price monitor);
kanban dengan human review gate; heartbeat. Di Yuika: "Mission Control" — semua cron,
delegation, review gate satu layar, mobile-friendly, push notification untuk approval.
(Konsep tetap penting walau bukan prioritas awal — ini yang membuat Yui "hidup".)

### 4.11 Safety: Approval, Sandbox, Vault — ✅

Approval lintas device (mobile push → tap approve — pola `server_requests` Hermes);
sandbox semua eksekusi user; vault per-workspace; redaction secrets dari context/log
sejak commit pertama; path policy; tool output truncation.

### 4.12 Yang diambil apa adanya dari bagian lain

- **Onboarding wizard + doctor** — menentukan activation rate SaaS.
- **Usage/pricing tracking** (pola `usage_tracker`, `billing_usage` Hermes) → dasar metering §8.
- **Eval/trajectory** (pola batch_runner) → nanti untuk regression test perilaku persona.
- **Terminal/browser backends pluggable** (local/docker/ssh/modal/daytona di Hermes) → versi
  Yuika: backend sandbox (container default; device relay; penyedia cloud sandbox menyusul).

---

## 5. Konsep dari Ekosistem Lain untuk Di-Assemble

| Sumber | Konsep | Pakai di Yuika |
|---|---|---|
| **Claude Code / pi** | Project instruction file, plan mode, hooks | `YUI.md` per workspace; plan-approve-execute untuk task besar; hook = arsitektur internal |
| **LangGraph** | Graph orchestration, checkpoint, human-in-loop | Engine workflow deterministik untuk pipeline berulang; checkpoint = resume job panjang (fase 4) |
| **CrewAI / AutoGen** | Agent teams dengan role | **Sudah tercakup lewat persona+delegation** — persona = role yang produktisasi dengan ilustrasi & memori |
| **A2A** | Interop agent-ke-agent | Fase lanjut, antar-workspace internal saja (D4: tanpa pihak ketiga eksternal di awal) |
| **Dify / n8n** | Visual workflow builder | Fase 4: builder node graph di web |
| **mem0 / Zep** | Memory-as-a-service | Kandidat MemoryProvider plugin (fase 3) |
| **Langfuse / OTel** | Tracing LLM | Built-in dari Fase 1: setiap turn = trace (prompt, tool, cost, latency) — juga data metering §8 |
| **OpenRouter** | Router multi-model + pricing | Model router internal: kebijakan biaya/latensi/kualitas per task type & persona |
| **LiveKit / Pipecat** | Realtime voice | Fase 3: voice per persona (persona + suara unik = pengalaman kuat) |
| **Firecracker / gVisor / Fly Machines** | MicroVM sandbox | Backend sandbox Fase 2 (mulai container biasa) |
| **Game live-ops pattern** | Character progression, expression states, unlockable skins | **Untuk persona growth** (§7.6): XP dari penggunaan, varian ilustrasi terbuka — diferensiasi UX |

---

## 6. Arsitektur Yuika

### 6.1 Topologi tingkat tinggi (diperbarui: tanpa messaging pihak ketiga)

```
                          ┌────────────────────────────────────────────┐
                          │               YOUR-YUI CLOUD               │
                          │                                            │
  ┌──────────┐ HTTPS/WS   │  ┌──────────────┐     ┌────────────────┐   │
  │ Web App  │◄──────────►│  │ API Gateway  │────►│ Auth / Billing │   │
  │ (+self-  │            │  │ REST + WS/   │     │ (credits §8)   │   │
  │  hosted) │            │  │ SSE          │     └────────────────┘   │
  └──────────┘            │  └──────┬───────┘     ┌────────────────┐   │
  ┌──────────┐            │         │             │ Control Plane  │   │
  │ Mobile   │◄──────────►│         ▼             │ sessions,      │   │
  │ (Expo)   │            │  ┌──────────────┐     │ personas, MCP, │   │
  └──────────┘            │  │ Event Bus    │◄───►│ skills, cron   │   │
  ┌──────────┐            │  │ (Redis       │     └───────┬────────┘   │
  │ Desktop  │◄──────────►│  │  Streams)    │             │            │
  │ (Tauri + │            │  └──────┬───────┘     ┌───────▼────────┐   │
  │  relay)  │            │         │             │ Job Queue       │   │
  └────┬─────┘            │  ┌──────▼─────────┐   │ turns, cron,    │   │
       │ device relay     │  │ Agent Runtime   │◄─│ delegation,     │   │
       │ (eksekusi lokal  │  │ Worker Pool     │   │ MCP workers     │   │
       │  atas nama Yui)  │  └──┬──────────┬──┘  └────────────────┘   │
       └──────────────────┼─────┘          │      ┌──────────────────┐│
                          │                │      │ Sandbox Pool      ││
  ┌──────────┐            │  ┌─────────────┐│      │ code/terminal/    ││
  │ Push Notif│◄──────────┼──┤ State Layer ││      │ browser/MCP-user  ││
  │ (milik    │            │  │ Postgres+vec││      └──────────────────┘│
  │  sendiri) │            │  │ Redis, S3   ││  ┌──────────────────────┐│
  └──────────┘            │  └─────────────┘│  │ Model Router          ││
                          │                 │  │ hosted keys + BYOM    ││
                          │                 │  │ + failover + aux route││
                          │                 │  └──────────────────────┘│
                          └─────────────────┴──────────────────────────┘
```

Perubahan vs v0.1: tidak ada konektor messaging; **notification service milik sendiri**
(FCM/APNs/web push) menjadi satu-satunya kanal keluar; desktop bisa jadi **relay eksekutor**.

### 6.2 Struktur core runtime

```
yui-core/
├── agent/
│   ├── loop.py|ts            # turn loop: request → llm → tools → … → final
│   ├── turn_*.py|ts          # fase per-turn (assembly, api_call, tool_round, recovery, finalizer)
│   ├── prompt/               # layer stack: [core] + [persona] + [memory] + [skills index] + [budget]
│   ├── providers/            # adapter (openai-compat, anthropic, gemini, local) + router + failover
│   ├── cache.ts              # prompt-cache discipline (immutable prefix per session)
│   └── events.ts             # event model: sourced, persistable, replayable
├── personas/                 # ★ §7: manifest loader, prompt layer, binding, growth
├── tools/
│   ├── registry.ts           # register()/discover/handle_call
│   ├── toolsets.ts           # grup + resolusi per-sesi (frozen)
│   └── ±15 core tools: read_file, write_file, patch, search, terminal(→sandbox),
│       browser, web_search, web_fetch, skills_list, skill_view, memory, todo,
│       delegate_task, ask_user, request_approval
├── skills/                   # SKILL.md loader, progressive disclosure, usage, curator
├── mcp/                      # client multi-transport + sandbox runner + (opsional) server mode
├── context/                  # ContextEngine ABC + summarizer + micro-compaction
├── memory/                   # MemoryProvider ABC + builtin (MD + vector) + session search
├── delegation/               # job-based subagent orchestration + steering
├── safety/                   # approval, redaction, path policy, output limits
├── metering/                 # ★ §8: usage events, ledger, admission control
└── contracts/                # ★ SEMUA wire: methods, events, server_requests
                                 → generate TS client (web), RN client, Tauri client, OpenAPI
```

Invariant ter-encode sejak awal: history append-only (pengecualian: compression ber-checkpoint);
toolset+persona frozen per sesi; semua akses state bawa scope tenant/workspace; handler tool
return JSON terstruktur + envelope multimodal untuk gambar.

### 6.3 Contract-first API (kunci multi-platform)

Dideklarasikan sekali di `contracts/` (zod bila TS / Pydantic bila Python) → generate semua
klien. Tidak ada klien yang menulis tipe tangan sendiri. Tiga keluarga:

1. **Control plane (REST)** — `POST /v1/sessions {persona}`, `GET /v1/personas`,
   `POST /v1/mcp/connections`, `GET /v1/jobs`, `GET /v1/credits/balance`…
2. **Data plane (WebSocket/SSE)** — `session.attach {since: event_id}` (resume + replay);
   event stream: `message.delta`, `tool.call/result`, `turn.done`, `delegation.progress`,
   `persona.state`; **server→client requests**: `approval.ask`, `clarify.ask`, `secret.ask`,
   `mcp.elicit` — agent bertanya ke user dari device mana pun (push bila perlu).
3. **Internal sink** — desktop relay worker job protocol (ambil job eksekusi lokal, laporkan
   hasil) — kontrak yang sama, transport aman ter-auth.

### 6.4 Klien per permukaan

| Permukaan | Teknologi | Fokus |
|---|---|---|
| Web | Next.js + generated client | Chat (persona picker, expression states), Mission Control, skills/MCP manager, billing, observability; **juga dipaket self-host** |
| Mobile | Expo (React Native) | Chat, approval push, delegation monitor, persona picker — "kontrol Yui dari saku" |
| Desktop | Tauri | Klien penuh + **device relay worker** (jalankan kode/terminal/browser lokal untuk data sensitif) |
| Push | FCM/APNs/web push milik sendiri | Notifikasi & approval satu-satunya kanal keluar |

### 6.5 Eksekusi & sandboxing (3 tier)

1. **Container sandbox** (default): temp FS, network policy, timeout, resource cap; pool hangat
   untuk cold start < 1–2 s; scale-to-zero.
2. **Device relay**: desktop user sebagai eksekutor untuk tool yang disetujui; approval ketat.
3. **Self-host web edition**: seluruh stack di docker-compose milik user; tanpa credits
   (lisensi/flat — lihat §12); sink opsional ke cloud.

---

## 7. Sistem Persona Yui (pilar produk)

> Keputusan D5. Ini bagian yang membuat Yuika bukan "agent platform lain" —
> persona adalah **unit produk**: dibeli pertumbuhannya, dinikmati ilustrasinya,
> dan menjadi antarmuka bagi seluruh mesin (skill, MCP, delegation, memory).

### 7.1 Definisi

**Persona** = spesialis Yui dengan: (1) domain keahlian, (2) lapisan kepribadian (prompt),
(3) bundle skill kurasi + skill yang dipelajarinya, (4) toolset & routing model, (5) ruang
memori prosedural sendiri, (6) **aset ilustrasi** (potret + ekspresi per state), dan
(7) parameter delegation (persona apa yang bisa dia panggil / dipanggil).

### 7.2 Format persona package

```
personas/yui-coder/
├── persona.yaml        # manifest
├── PERSONA.md          # lapisan prompt: kepribadian, tone, cara kerja, workflow pref
├── skills.yaml         # skill bawaan (bundled) + rekomendasi (install-on-first-use)
├── toolsets.yaml       # toolset aktif + policy approval default
├── model.yaml          # routing hints: model utama (kualitas), aux (murah)
├── memory.yaml         # kebijakan memori: domain, learn on/off, retention
├── delegation.yaml     # boleh spawn persona apa; boleh dipanggil oleh siapa
└── assets/
    ├── portrait.png
    └── expressions/    # thinking, working, awaiting_input, done, error, idle, celebrating
```

```yaml
# persona.yaml (contoh)
id: yui-coder
name: "Hiro Yui"
version: 1.0.0
expertise: software-development
tags: [coding, debugging, refactoring, testing]
description: "Spesialis pengembangan perangkat lunak — TDD, debugging sistematis, review."
launch_tier: starter          # plan minimal untuk memakai persona ini (§8)
assets:
  portrait: assets/portrait.png
  expressions: [thinking, working, awaiting_input, done, error, idle, celebrating]
model:
  primary: { quality: high }   # router men-resolve ke model konkret per plan/workspace
  aux: { quality: low }        # summarization, skill extraction, dsb.
memory:
  domain: software-development # ruang procedural (skill) milik persona ini
  learn: true
delegation:
  can_spawn: [yui-coder, yui-scholar, yui-analyst]
  spawnable_by: [user, yui]    # 'yui' = conductor boleh memanggilnya
```

### 7.3 Persona di prompt stack (cache-safe)

Urutan layer system prompt saat sesi dibuat (lalu **dibekukan**):

```
[core Yui system] → [persona layer: PERSONA.md] → [memory block: user-global + domain]
→ [skills index: hanya skill domain persona + skill global aktif] → [budget/policy]
```

Pergantian persona = sesi baru (bukan mutasi mid-sesi) → prompt cache tetap utuh.
Satu sesi = satu persona utama; persona lain hadir sebagai **delegation target**.

### 7.4 Roster peluncuran (usulan, final menunggu ilustrasi & riset user)

| Persona | Domain | Toolset inti | Skill seed |
|---|---|---|---|
| **Yui (Conductor)** | generalis/orkestrator | delegation, todo, memory, web | task decomposition, planning |
| **Hiro Yui** | software dev | file, terminal→sandbox, browser, delegation | TDD, systematic-debugging, code-review |
| **Einstein Yui** | riset | web, browser, file | research methodology, citation, fact-check |
| **Sherlock Yui** | data | code-exec, file | data cleaning, viz, statistics |
| **Poe Yui** | tulis/konten | file, web | writing styles, editing, SEO |
| **Neo Yui** | otomasi/devops | terminal, cron, delegation | cron blueprints, monitoring |
| **Picasso Yui** (v0.5) | desain produk/UI | Penpot connector (embed), file, delegation | design-system basics, design→code handoff, Penpot operation |

> Mulai 4–6 persona; Conductor + 3 spesialis adalah minimum untuk demo cerita delegation.
> v0.5: **Picasso Yui** ditambahkan (putusan user — D9 jadi 7) sebagai persona inti studio
> desain→kode (§13.9); skill seed-nya dilatih lewat dungeon (P1-DUN, P1-PER-7).
>
> **Status (dev-10):** roster D9 LENGKAP — 7 persona ter-load & teruji
> (persona-roster.test). Analyst (data; skill seed `data-analysis-basics`) dan
> Operator (otomasi; binding MCP) aktif; cron/monitoring berulang = v1.

### 7.5 Arsitektur memori per persona

```
                    ┌────────────── Global (semua persona berbagi) ─────────────┐
                    │  USER.md (siapa kamu, preferensi) · workspace facts · KB  │
                    └───────────────────────────────────────────────────────────┘
   ┌─ Episodic: sesi per-persona, searchable lintas persona (session_search) ─┐
   └─ Procedural: skill per-domain persona (yui-coder punya repo skill coding) ┘
```

Aturan: fakta user global (semua persona tahu kamu suka ringkasan pagi); keahlian domain
terisolasi (Einstein Yui tidak otomatis mahir coding) tapi **Conductor bisa memanggil siapa
pun**; skill bisa ditandai `shared` agar muncul di persona lain.

### 7.6 Growth, ekspresi & skins (diferensiasi UX)

**Expression states — animasi (D8).** Rekomendasi teknologi: **Rive** — runtime interaktif
dengan *state machine* bawaan (transisi antar state dideklarasikan di file `.riv` dan
dikendalikan lewat input), ukuran file kecil, dan runtime resmi untuk web, React Native, dan
desktop — persis kebutuhan persona lintas platform. Alternatif yang tetap terbuka (putuskan
bersama artist, §12): **Spine** (rig karakter 2D kuat, konsep *skin* bawaan yang cocok dengan
D10, tapi pipeline & lisensi lebih berat); **Lottie** cukup untuk motion UI non-karakter,
bukan state machine interaktif karakter.

Pemetaan state agent → animasi: `thinking` (LLM jalan) · `working` (tool jalan) ·
`awaiting_input` (approval/clarify) · `done` · `error` · `idle` · `celebrating` (task kompleks
selesai / skill baru dipelajari). Semua state ini sudah ada sebagai event di event bus —
tinggal dipetakan ke input state machine per persona.

> **Orin v4 (putusan v0.5):** art direction maskot disederhanakan — **satu rig mata dipakai
> semua bentuk** (ekspresi konsisten & simetris), **identitas persona = bentuk geometris**:
> Conductor=bola, Scholar=awan, Scribe=tetes, Coder=kotak, Designer=segitiga (+Analyst/
> Operator nanti memakai ulang bentuk dengan warna berbeda). Migrasi Rive makin murah:
> SATU file `.riv` dengan input `shape` 0–4 + `mood` 0–5 (dulu: aset per persona).

**Growth gratis (D10).** Usage & skill yang dipelajari → "level" per persona → varian ilustrasi
terbuka **gratis** untuk semua user — gamifikasi jujur berbasis penggunaan nyata; semua varian
fungsional dapat dicapai siapa pun.

**Monetisasi kosmetik (D10, konsep baru).** Terpisah dari growth: **skin berbayar** murni
kosmetik (kostum/palet — tidak mengubah perilaku atau keahlian), **event musiman**, dan
**achievement** (pola live-ops game). Prinsip garis keras: **tidak ada pay-to-win** — premium
(§8.3) membuka fitur & entitlement lintas platform, credits membuka compute; skin tidak
pernah menjual kecerdasan.

Marketplace fase lanjut: persona buatan user (fork + remix skill + asset sendiri).

### 7.7 Kaitan dengan prioritas #6-mu

- **Delegation**: persona = bentuk produk dari "roles" Hermes — `delegate_task(persona=…)`
  dengan progres berilustrasi per persona.
- **Memory learning-loop**: skill hasil belajar masuk domain persona; growth terukur.
- **MCP**: tiap persona bisa punya koneksi MCP kurasi (Hiro Yui ↔ GitHub MCP; Poe Yui ↔
  Notion MCP) — OAuth di web, sekali klik.

---

## 8. SaaS Credits: Metering & Billing

> Keputusan D3. Credits = unit komputasi universal. Prinsip: **setiap aksi berbiaya
> menghasilkan usage event → ledger append-only → admission control berbasis saldo.**

### 8.1 Apa yang di-meter

> **Status v0 (P1-CRED-1, dev-10):** ledger `usage_events` LIVE — tiap panggilan
> model sukses (loop utama + delegasi anak) tercatat: token in/out + latensi +
> persona + model + project. Angka HANYA dari laporan usage provider (tanpa
> estimasi — provider tak melapor = tak tercatat). Rollup per persona/model di
> Settings → Metering (`GET /api/usage`, filter project/session/persona/window).
> Hold/settle saldo & rate limit = CRED-2/3; sandbox-detik derivabel dari
> DungeonRun.started/ended (runs.json).

| Item | Satuan | Catatan |
|---|---|---|
| LLM tokens | credit per 1k token, **rate per model** (margin di atas harga provider) | Input/output/cache terpisah; aux model lebih murah — insentif routing pintar |
| Sandbox compute | credit per detik (tier CPU/RAM) | Termasuk MCP server user yang di-host Yuika |
| Storage | credit per GB-bulan | Knowledge base, artifacts, arsip sesi |
| Tool berbayar hosted | credit per panggilan | Web search, image gen, dsb. (bila di-router lewat gateway-mu) |
| Delegation | diambil dari saldo workspace yang sama | Anak mewarisi pool workspace — cap concurrency per plan |

### 8.2 Alur metering & admission

```
User/subagent minta turn ──► Admission Control ──► Job masuk queue ──► Worker
                              │  cek saldo (Redis cache)                  │
                              │  pre-auth HOLD estimasi biaya             │ emit usage events
                              │  (gas-station pattern)                    │ (llm, sandbox, tool)
                              ▼                                           ▼
                        tolol jika saldo < hold                     Metering consumer
                                                                        │ settle: hold → actual
                                                                        ▼
                                                              Ledger (append-only, per workspace)
                                                                        │
                                                            ┌────────────┴───────────┐
                                                            ▼                        ▼
                                                    Balance cache (Redis)      Attribution:
                                                    → admission berikutnya     per persona, per job,
                                                                                          per sesi
```

- **Hold → settle** mencegah over-run (job panjang di-stop di tengah bila saldo habis, dengan
  pesan yang ramah — bukan kegagalan diam-diam).
- **Attribution** per persona/job/sesi → dashboard burn-rate, insight "persona apa yang paling
  mahal", dasar pricing experiment.
- Quota & rate limit per plan (concurrency delegation, cron per hari, ukuran sandbox).

### 8.3 Plan (usulan awal)

| Plan | Isi | Harga |
|---|---|---|
| Trial | X credits sekali | gratis |
| Starter | Y credits/bln + 1 workspace + persona tier dasar | $-rendah |
| Pro | Z credits/bln + semua persona + delegation batch + relai desktop | $-menengah |
| Team | per-seat + pool credits bersama (fase 3) | $-tinggi |
| Top-up | paket credits non-expiring (atau expiring 12 bln — keputusan §12) | variatif |

**Premium entitlement (D11).** "Sekali premium, dipakai di semua platform": premium adalah
**entitlement level akun**, bukan lisensi per-perangkat — satu status langganan membuka fitur
di web, mobile, dan desktop sekaligus. **Self-host edition = lisensi berbayar yang mensyaratkan
akun premium**: instance self-host memvalidasi lisensi ke license-server Yuika saat start
(dengan grace period offline — durasi jadi keputusan §12), lalu berjalan dengan kunci model
milik user; credits tidak berlaku di self-host (konsumsi LLM = kunci user sendiri).

BYOM (bawa API key sendiri) = fase lanjut: fitur tetap berbayar murah, LLM tidak di-meter.
Catatan: jangan blokir arsitektur untuk BYOM — provider abstraction tetap ada sejak awal.

### 8.4 Data yang sudah harus mengalir sejak Fase 1

usage events dari worker (pola `usage_tracker`/`billing_usage` Hermes), per-turn cost accounting,
saldo di UI, alert saldo rendah via push. **Tanpa ini, SaaS credits hanya bisa diretrofit dengan
mahal.**

---

## 9. Keputusan Bahasa: Python vs Pure TypeScript

### 9.1 Mengapa v0.1 merekomendasikan Python

1. **Transfer pola 1:1 dari Hermes** (core Hermes = Python: turn phases, registry, contracts,
   curator, delegation bisa dibaca & ditiru hampir langsung).
2. Ekosistem AI Python terkaya: eval frameworks, data/trajectory tooling, SDK provider
   Python-first historically.
3. MCP SDK Python matang (Hermes memakainya di produksi).

### 9.2 Mengapa keputusanmu (D1–D6) menggeser kalkulasi

- **D4 ekosistem tertutup** menghapus satu-satunya bagian Hermes yang benar-benar "murah
  ditiru" jika Python (28 adapter messaging) — tidak relevan lagi.
- Arsitekturmu **server-first multi-tenant SaaS** — bentuknya berbeda dari Hermes
  (personal CLI). Yang kamu transfer adalah *pola* (contracts, registry, progressive
  disclosure, delegation shapes, cache discipline) — semuanya language-neutral. Kode Hermes
  memang tidak bisa dipakai apa adanya di bentuk arsitektur barumu.
- Kamu **tidak butuh** tooling riset/training Python di horizon dekat (eval bisa pakai promptfoo
  / custom harness TS; embeddings via API).
- Klien web/mobile/desktop **pasti TS**. Dengan tim (bukan solo), satu bahasa = velocity
  nyata: tipe berbagi natif, satu toolchain, review lintas stack.
- MCP TypeScript SDK adalah SDK referensi **pertama** (dibangun untuk Claude Desktop) —
  setara atau lebih matang dari Python untuk kebutuhan client/server.
- Vercel AI SDK (TS) memberi provider abstraction + streaming + tool-calling primitives
  kelas satu — head start besar untuk turn loop & router.

### 9.3 Matriks trade-off jujur

| Aspek | Python core + codegen TS | Pure TypeScript |
|---|---|---|
| Bahasa di repo | 2 (mitigasi: codegen kontrak → TS) | **1** (monorepo, tipe natif lintas core↔klien) |
| Ekosistem LLM/agent | Terkaya (eval, data, training) | Cukup+ (AI SDK, MCP TS, promptfoo); data/eval ilmiah tipis |
| Pola Hermes | Dibaca & ditiru ~1:1 | Pola ditiru, kode diterjemahkan (memang harus, bentuk arsitektur beda) |
| Streaming/real-time | asyncio oke | **Lebih natural** (streams, SSE/WS, AI SDK) |
| CPU-bound in-process | GIL — tapi hampir semua kerja = I/O (LLM/tool) atau di sandbox | Event loop — sama, mitigasi sama (worker threads / offload sandbox) |
| Sandbox eksekusi kode user | Container — bahasa core tak relevan (kode user bisa Python di container) | Sama persis |
| Deploy/CI | Lebih berat (2 runtime) | **Lebih ringan** (satu runtime; Bun/Node; edge-friendly) |
| Hiring AI-eng | Pool Python besar | Pool TS besar (dan butuh TS untuk klien anyway) |
| Risiko khusus | Drift kontrak dua bahasa bila codegen di-bypass | Bila nanti butuh pipeline data/training berat → tambahkan Python *sidecar* khusus itu saja (bukan core) |

### 9.4 Keputusan final (D7): Pure TypeScript ✅

Tim 3 orang dengan TS dominan di semua anggota → monorepo TypeScript **dikunci**:

| Layer | Pilihan |
|---|---|
| Monorepo | npm workspaces + Turborepo |
| Kontrak | **zod** (single source of truth) → infer types semua klien; OpenAPI via zod-to-openapi |
| Runtime | Node LTS + Fastify (Bun dievaluasi belakangan, bukan hari-1) |
| Real-time | SSE dulu (demo & Fase 0) → WebSocket saat interaksi dua arah penuh |
| DB | SQLite (demo) → Postgres + Drizzle + pgvector (Fase 1) |
| Queue | in-process (demo) → BullMQ/Redis (Fase 1) |
| Web | Next.js (App Router) |
| Mobile | Expo (React Native) — Fase 2 |
| Desktop | Tauri — Fase 2 |
| Animasi persona | Rive (§7.6) |
| Provider | OpenAI-compatible (D12) di belakang interface `ProviderAdapter` |

Dua syarat jaga-kunci: (1) kontrak tetap satu-satunya sumber tipe — larangan tipe tangan di
klien mana pun; (2) jika kelak butuh pipeline riset/training berat, tambahkan Python *sidecar*
khusus pipeline itu, bukan pindah core.

> Konteks analisis (mengapa TS menang untuk constraint tim ini) tetap terdokumentasi di
> §9.1–§9.3 sebagai catatan keputusan.

---

## 10. Roadmap Bertahap (di-prioritas ulang)

### Fase 0 — Kernel (± 4–6 minggu, 1–2 orang)

> **Demo internal 1 minggu (D13)** = vertical slice terkompresi dari Fase 0 — rencana eksekusi
> harian untuk 3 dev: [`DEMO-WEEK-1.md`](./DEMO-WEEK-1.md). Setelah demo: lanjutkan Fase 0
> penuh (sandbox container, resume robust, split api↔core jadi service terpisah, auth)
> sebelum masuk Fase 1.
- [x] Monorepo TS + `contracts/` (zod) + CI — ✅ v0: npm workspaces + @yui/contracts (zod, single source) + CI GitHub Actions (typecheck+test+lint, turbo cache). *Codegen SDK/OpenAPI menyusul bersama P0-INF-1 split api.*
- [x] Agent core v1: turn loop streaming, 1 provider, interrupt, event sourcing + replay — ✅ v0: loop.ts (iterasi + budget + repetition guard + fallback model + abort graceful), provider openai-compat/anthropic/gemini, SessionStore SQLite append-only + SSE replay; compression v0 (P0-CORE-4) tinggal aux-model summarize
- [x] Registry + ±8 tool inti — ✅ v0: file RW/search/patch + run_command (scope project) + skills_list/skill_view + doc_read + todo_* + memory_append + session_search + skill_propose + consult + delegate_task + MCP tools dinamis; *sandbox container menyusul P0-SEC-1*
- [x] Skills loader (agentskills.io format) + skill seed + usage tracking dasar — ✅ v0: loader SKILL.md frontmatter + status draft/tested/ready + binding 3 lapis (bundled∪attached∪global)\detached + eval dungeon; 6 skill seed; *10 skill seed & tracking per-skill menyusul*
- [x] Session store append-only + `session.attach` resume — ✅ v0: attach via SSE `?since=` + snapshot hydrate satu-render (fix timelapse 2026-11); approval pending & delegation job survive restart (boot-heal)
- [x] Web chat v1: attach sesi, stream, approval inline, persona slot — ✅ v0+: chat streaming + reasoning kolaps-able + kartu approval/delegasi (klik → sesi anak; steer/cancel mid-turn) + persona picker orbit + tab Chat/Tim/Task/File/Trace/Konfigurasi + toast global; *persona art Rive menyusul P1-PER-1..3*

**Demo keluar:** chat di web, Yui membaca skill, eksekusi kode di sandbox, minta approval,
resume setelah refresh.

### Fase 1 — Tiga prioritas + persona v1 + credits v1 + project entity (± 8–10 minggu)
- [ ] **P1-PRJ (v0.4): project entity** — CRUD + isolasi workspace per project + roster agent
      per project + tasklist + binding MCP per persona (detail §13.2; task di TASKS.md) — ✅ v0 parsial 2026-11: CRUD + isolasi path + roster + tasklist/TaskTree + binding MCP granular + papan kanban + Log Task drawer; *sisa: arsip/eksport project*
- [ ] **P1-DUN (v0.5): dungeon v0** — misi latihan persona → skill lifecycle
      draft→tested→ready → assign gating (§13.8) — ✅ v0: arena latihan 3 mode (materials/research/hybrid), fase gating roster, eval buta P1-DUN-3, draf diterima → dipasang ke persona
- [ ] **P1-MDL (v0.5): model per persona** — `model`+`fallback` di persona.yaml,
      router + smoke test per model (§13.10) — ✅ v0: router + override Settings + fallback/cooldown + smoke test 2-langkah di panel Settings
- [ ] **MCP**: client multi-transport + katalog kurasi ±20 + OAuth web + MCP worker tersandbox
- [ ] **Memory learning-loop**: USER.md/MEMORY.md + nudge persist + skill-create-from-experience
      + per-domain persona memory (dasar §7.5) + `session_search` — ✅ v0: USER.md/MEMORY.md editor + nudge learn per domain + skill_propose dari pengalaman + memori domain persona di-inject ke prompt (juga ke anak delegasi) + session_search tool
- [ ] **Delegation**: job-based background subagent, batch paralel, progress event, steering,
      `delegate_task(persona=…)` — persona sebagai preset child — ✅ v0 parsial: job persist (P0-DEL-1) + **paralel dalam satu round (Promise.all, 2026-11)** + delta live feed + **steer/cancel/cascade (P0-DEL-2, 2026-11)**; *sisa: steering per node TaskTree (P1-DEL-3) + queue/retry background*
- [ ] **Persona v1**: manifest + PERSONA.md prompt layer + toolset/model binding + expression
      state mapping (asset pipeline siap; ilustrasi bisa menyusul masuk)
- [ ] Multi-provider + failover + aux routing (compression/title pakai model murah) — ✅ v0 parsial: failover primary→fallback + cooldown 5 mnt (P0-CORE-2) + aux routing kompresi & learn-nudge via `YUI_AUX_MODEL` (P0-CORE-4, 2026-11); *sisa: multi-provider simultan (≥2 base URL) + aux routing untuk title sesi*
- [ ] **Credits v1**: usage events + ledger + admission (hold→settle) + saldo UI + plan sederhana — ✅ v0: ledger jujur per panggilan (juga anak delegasi) + admission warn/block + saldo/budget UI + price book + smoke test; *sisa: Stripe & tagihan nyata (P1-CRED-5/6, butuh resource eksternal)*
- [ ] Compression (ContextEngine default) + prompt-cache discipline tests

**Demo keluar:** "Maestro Yui memecah tugas riset → mendelegasikan ke Einstein Yui (dengan
koneksi MCP Notion) → skill baru tercatat di domain persona → semua terlihat dari web dengan
expression states; burn-rate credit terukur per turn."

### Fase 2 — Multi-platform UX penuh + Studio v0 (± 10–12 minggu)
- [ ] **P2-FLOW (v0.4): workflow engine** — DAG fase deklaratif (template 7 fase),
           sequential/paralel per fase, human gate, monitoring board live (§13.3)
- [ ] **P2-FLOW (v0.5): TaskTree board** — pohon pemantauan delegasi + steering per node (§13.7)
- [ ] **P2-PM (v0.6): persona Project Manager & planning flow skala besar** — Liebert Yui:
      brainstorm `consult` multi-persona → dokumen perencanaan → task list detail (acceptance/
      depends_on/assignee, validator coverage) → RACI + metrik keluaran per fase → dashboard
      progres terukur → iterasi run berantai (§13.3.1, D22)
- [ ] **P2-DSN (v0.5): pipeline desain→kode via Penpot** — persona desain produksi file,
           tab Design, generate komponen di fase develop (§13.9)
- [ ] **P2-STU (v0.4): workbench multi-tab** — tab shell, terminal (PTY sandbox),
      file explorer, browser embed read-only, board, docs; Figma MCP (§13.5)
- [ ] Mobile (Expo): chat, push approval, mission control, persona picker
- [ ] Desktop (Tauri) + device relay worker
- [ ] Persona UX penuh: expression per state, growth timeline, varian ilustrasi unlock
- [ ] Curator v1 (archive skill basi per persona, konsolidasi LLM opt-in)
- [ ] Cron v1 + blueprint templates + Mission Control + push notification
- [ ] Kanban / human review gates · Knowledge base (upload→index→pin) · Vault secrets
- [ ] Billing v2: top-up, langganan, invoice, attribution dashboard per persona

### Fase 3 — Ekosistem (± 3–4 bulan)
- [ ] Marketplace: persona (fork/remix), skill, MCP connector — review otomatis + moderasi
- [ ] Teams: multi-user workspace, pool credits, role & permission
- [ ] Voice per persona (STT/TTS streaming)
- [ ] Self-host web edition (docker-compose) — keputusan lisensi §12 · **Gerbang
      go-public** (task PUB-1..5 di TASKS.md): repo hari ini proprietary
      ("All rights reserved" + UNLICENSED) — sebelum push publik wajib THIRD-PARTY-NOTICES,
      keputusan lisensi final (proprietary/BSL 1.1/PolyForm/open-core), bersih artefak
      internal, CLA, cek trademark Orin (detail docs/LICENSE-AUDIT.md)

### Fase 4 — Skala & diferensiasi lanjut
- [ ] Visual workflow builder (node graph) di atas engine
- [ ] Eval harness perilaku persona (regression suite — pola batch_runner Hermes)
- [ ] Sandbox microVM (Firecracker/gVisor) untuk plan enterprise
- [ ] Enterprise: SSO, audit export, BYO-KMS, SLA
- [ ] (Opsional) Yuika sebagai MCP server per-workspace; A2A antar-workspace internal

---

## 11. Risiko & Mitigasi (diperbarui)

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Scope creep — persona + 3 prioritas + multi-platform sekaligus | Jalan tanpa rilis | Urutan ketat: Fase 0 dulu (kernel terbukti), persona v1 = config infra (bukan art), ilustrasi paralel non-blocking |
| Credits retrofitted → kebocoran margin | Bisnis | Metering + admission di Fase 1, bukan kemudian (§8.4) |
| Persona = hanya kosmetik (ilustrasi bagus, perilaku sama) | Diferensiasi gugur | PERSONA.md + toolset + skill domain + routing harus terasa beda dalam pengujian blind; eval per persona (Fase 4, tapi acceptance criteria dari Fase 1) |
| Prompt-cache disiplin bocor oleh fitur persona/skill | Biaya meledak | Contract test: "tidak ada tulisan ke history selain append; toolset frozen per sesi" — CI gate |
| Melanggar narrow-waist saat mengejar fitur kompetitor | Core bengkak | Footprint ladder di review checklist; ratchet ukuran unit |
| Sandbox escape / abuse compute | Keamanan & biaya | Container sejak hari 1; quota per plan; egress policy; audit |
| Ekosistem tertutup = FOMO integrasi (user minta WhatsApp dll.) | Churn | Posisikan sebagai *privacy-first feature*; push notification kelas satu; tetap buka opsi nanti bila data user menuntut (keputusan bisnis bisa berubah) |
| Tim kecil memelihara 3 klien + core | Burnout | Satu kontrak → semua klien (codegen); klien dirilis berurutan; Hindari fitur klien yang tak ada di kontrak |
| Dependensi satu provider LLM | Harga/stabilitas | Router + failover sejak Fase 1 |
| Workflow engine scope creep (jadi workflow-builder penuh terlalu dini) | Jalan tanpa rilis studio | D15: DAG deklaratif 7 fase template dulu; builder visual Fase 3; setiap fase punya acceptance test + human gate; engine tidak bisa menulis state bebas — hanya lewat event |
| Embedded browser = permukaan serangan (SSRF, XSS, session leak) | Keamanan | D16: server-side proxy default-deny, domain allowlist per project, sandbox render terpisah, security review gerbang (P2-STU-4) |
| Eksekusi paralel agent = biaya & race meledak | Biaya & correctness | Cap concurrency per project (plan); metering per-step (§8); event sourcing = sumber kebenaran tunggal; replay untuk debugging race |
| Piringan berat studio (terminal/browser/monitor) menggeser kernel | Kualitas inti | Urutan: P1-PRJ (data) → P2-FLOW (engine+monitoring) → P2-STU (tab kaya); kernel tidak boleh tahu UI |
| Dungeon menghasilkan skill basah/berbahaya | Skill buruk masuk project produksi | Eval acceptance wajib (blind test — pola P1-PER-5) + curator review (P2-AGT-3) + misi hanya di sandbox terisolasi; tanpa lulus eval skill tetap `draft` |
| Multi-model = fragmentasi quirk provider & biaya meledak | Turn gagal / biaya tak terkendali | Normalisasi schema terpusat (pelajaran GLM 1210) + smoke test per model di router + fallback per persona + metering/budget per persona (P1-CRED) |
| Penpot: ops self-host & API berubah | Integrasi desain patah | **Self-host wajib (CSP) — terjawab P2-DSN-1**; adapter tipis + pin versi stable (repo = 2.19.0-dev); stack penuh (pg/redis/exporter/wasm) disediakan profil docker “lite” untuk dev; OpenAPI spec bawaan → client digenerate |
| Design→kode: ekspektasi melenceng dari realitas | Kecewa terhadap fitur unggulan | Kontrak ekspektasi v0 = komponen + tokens (D18); acceptance di human gate per fase; contoh “golden path” dirilis bersama fitur |

---

## 12. Pertanyaan Terbuka Berikutnya

*(Terjawab di v0.2/v0.3: tim & bahasa (D7), animasi ekspresi (D8), roster (D9), model skin
(D10), lisensi self-host (D11), sourcing model (D12), timeline demo (D13).)*

1. **Art pipeline Rive:** siapa membuat file `.riv` — in-house belajar Rive, atau artist
   eksternal? Kapan art direction doc (palet, gaya, dimensi, daftar state per persona) siap?
   Ini penentu jadwal ilustrasi Fase 2 (di demo minggu depan pakai placeholder — §DEMO-WEEK-1).
2. **Rive vs Spine:** rekomendasi Rive (D8) final setelah konsultasi artist — Spine menang jika
   team artist sudah punya pipeline Spine dan butuh rig kompleks.
3. **Bentuk pricing premium:** langganan bulanan/tahunan? Apakah premium **termasuk** credits
   bulanan (bundling) atau premium murni fitur/entitlement + credits dibeli terpisah?
   (Rekomendasi awal: premium = fitur + sejumlah credits kecil; top-up terpisah.)
4. **Grace period offline self-host** (D11): berapa lama instance boleh jalan tanpa sukses
   validasi lisensi? (Usulan: 72 jam, lalu turun ke read-only.)
5. **Demo minggu ini:** key provider mana yang dipakai (OpenAI langsung / gateway
   OpenAI-compatible internal)? Model apa (butuh kuat di tool-calling)? Budget & fallback
   model kalau kuota habis?
6. **Setelah demo:** lanjut Fase 0 penuh (sandbox, split api↔core, auth) dulu, atau langsung
   lompat Fase 1 (MCP penuh + memory loop + credits)? (Rekomendasi: Fase 0 penuh dulu —
   utang teknis demo harus dibayar sebelum fitur baru.)
7. **Persona default user baru:** Conductor sebagai pintu masuk default (dipakai di demo)?
8. **Desain event & achievement (D10):** kapan dirinci? (Rekomendasi: bersama growth timeline
   di Fase 2 — jangan sekarang, demo tidak butuh.)
9. **Expiring credits?** (belum terjawab dari v0.2 — 12 bulan vs non-expiring).
10. **Nama:** "Yuika" final? Cek domain/trademark sebelum branding jalan jauh.
11. **Penpot (v0.5, menggantikan pen.dev — tidak open source):** eksplorasi repo
    `D:\projects\penpot` → **selesai**: laporan `docs/refs/penpot.md` (P2-DSN-1).
    Temuan utama: embed wajib self-host (CSP `frame-ancestors`); v0 = agent via RPC API
    (`update-file` headless) + iframe share-link viewer; v1 = MCP server resmi (plugin di
    dalam sesi embedded); render headless via exporter WASM.
12. **Isolasi kode project (v0.4):** folder `workspace/projects/<id>/` vs git worktree vs repo penuh per project? (Usulan: folder dulu, worktree saat fitur git masuk.)
13. **Human gate antar fase workflow (v0.4):** default selalu ada (approve sebelum fase berikut), atau per-fase opt-out? (Usulan: default ON; fase otomatis hanya untuk run unattended berjenjang kepercayaan.)
14. **Browser embed scope (v0.4):** screenshot+DOM read-only dulu, atau interaktif penuh (klik/scroll via CDP) sejak awal? (Usulan: read-only v0 — interaktif menyusul bersama sandbox render.)
15. **Penpot cloud vs self-host untuk v0 (v0.5):** **TERJAWAB (eksplorasi): self-host
    wajib** — CSP default `frame-ancestors 'self'` tidak bisa dilepas di cloud; deployment
    self-host meng-overwrite `PENPOT_CSP_POLICY` utuh (frame-ancestors origin platform).
    Mekanisme embed: v0 iframe share-link viewer + agent via RPC API; v1 MCP resmi;
    v2 white-label SSO (tangga §13.9; detail `docs/refs/penpot.md`).
16. **Persona desain (v0.5):** tambah persona baru “Designer” (roster D9 jadi 7) atau varian Scribe? (Usulan: Designer sebagai persona inti studio — pembeda produk; final saat P2-DSN-5.)
    → **TERJAWAB (putusan user): Designer ditambahkan** sebagai persona inti — roster D9 = 7
    (§7.4); task P1-PER-7 + P2-DSN-5.
17. **Threshold eval dungeon (v0.5):** siapa penentu `tested→ready`? (Usulan: blind test otomatis + spot-check manusia untuk skill kritis; threshold per kategori skill.)

---

## 13. Studio Proyek: Multi-Project Agent OS (pilar v0.4–v0.5)

> Keputusan D14–D17. Visi: Yuika bukan sekadar "chat dengan persona", melainkan
> **studio tempat banyak project hidup** — tiap project membawa kode, dokumentasi, tasklist,
> dan **struktur agent-nya sendiri**; struktur itu berjalan sebagai workflow berfase
> (sequential/paralel) yang bisa dimonitor; dan seluruhnya dibuka lewat **workbench
> multi-tab** (chat, terminal, browser, file, board). Referensi hidup konsep ini:
> **OpenBot** (`D:\projects\openbot` — desktop agent workspace dengan browser embed,
> queue, threads, subagents) dan **Penpot** (`D:\projects\penpot` — design & prototyping
> platform open source; pengganti pen.dev yang tidak open source; eksplorasi repo
> menyusul — §12.11).

### 13.1 Konsep inti

| Konsep | Definisi | Fondasi yang sudah ada |
|---|---|---|
| **Project** | Kontainer first-class: repo kode + docs + tasklist + struktur agent + histori sesi/run + binding MCP | Workspace scope (PLAN §3.5); session store; path policy file-tools |
| **Struktur agent** | Roster persona yang *di-assign* ke project, dengan peran & fase kerja masing-masing ("agent A,B,C,D untuk tugas tertentu") | Persona package (§7); delegation (`delegate_task(persona=…)`) |
| **Workflow** | DAG deklaratif per fase: planning → perencanaan → riset → desain → develop → testing → dokumentasi → deliverable; tiap fase `sequential`/`parallel`; langkah = (persona, task) | Job queue delegation (P0-DEL-1); approval engine (human gate); event bus |
| **Monitoring** | Board live: agent mana sedang jalan, di fase apa, paralel/sequential, progres & hasil | Event sourcing + `delegation.progress` + SSE replay — tinggal diperluas `workflow.*` |
| **Workbench multi-tab** | Tab chat / terminal / browser / file / board / monitoring dalam satu project (web & desktop; mobile fokus monitoring+approval) | Tool sandbox `run_command`, `web_fetch`, file tools — diangkat jadi *surface* (D16) |
| **MCP sebagai skill persona** | Koneksi MCP (mis. Figma, Penpot) di-bind ke persona tertentu di project tertentu — "skill yang menempel pada agent yang bertanggung jawab" (D17) | MCP client + katalog + OAuth (P1-MCP); persona toolset binding |
| **TaskTree** (v0.5) | Pohon pemantauan task → subtask → step → job agent; TaskList = flat view dari tree (D19) | Event sourcing + delegation.* — board = proyeksi, replay gratis |
| **Dungeon** (v0.5) | Arena latihan persona: misi → skill baru (draft→tested→ready); persona siap di-assign setelah skill-nya lulus (D20) | Memory loop + skill-create (P1-MEM-3) + growth (P1-PER-4) |
| **Model per persona** (v0.5) | Tiap persona jalan di model berbeda sesuai keunggulan scope tugas (D21) | Provider config per loop + adapter multi-provider (P1-INF-2) |
| **Pipeline desain→kode** (v0.5) | Persona desain memproduksi file Penpot di fase `design`; fase `develop` membaca → generate komponen kode (D18) | MCP/API binding + file tools + workflow fase |

### 13.2 Model data (aditif terhadap skema §6)

```
project
├── id, name, description, status (active/paused/archived)
├── root            # path terisolasi: workspace/projects/<id>/{code,docs,reports}
├── tasklist[]      # task: id, title, status (todo/doing/review/done), assignee (persona)
├── agent_roster[]  # persona yang di-assign + peran (mis. "lead", "research", "design")
├── workflows[]     # workflow_def (di bawah); template 7 fase dipakai sebagai default
├── mcp_bindings[]  # { server, persona, tools[], granted_by, ts }  ← D17
└── sessions[]/runs[]  # histori (relasi ke tabel yang sudah ada)

workflow_def        # file `workflow.yaml` per project (deklaratif, di-version-control)
├── phases[]
│     ├── id, name  # planning | research | design | develop | test | docs | deliverable
│     ├── mode      # sequential | parallel
│     ├── steps[]   # { persona, task/goal, depends_on[] (opsional), max_concurrent }
│     └── gate      # human-approval sebelum fase berikut (default ON — §12.13)

run                 # satu eksekusi workflow
├── id, project_id, workflow_id, status (queued/running/awaiting_gate/done/failed)
├── phase_states[]  # { phase, status, started_at, finished_at }
└── agent_jobs[]    # delegation job yang sudah ada + referensi (run, phase, step)
```

Aturan: `workflow.yaml` deklaratif & tervalidasi zod di `@yui/contracts`; engine tidak
pernah menulis state bebas — semua transisi lewat event (append-only). Resume run =
replay event + lanjut dari fase terakhir yang belum selesai.

### 13.3 Eksekusi & monitoring workflow

```
workflow.run ──► Engine (DAG → job graph)
                    │  fase sequential: job satu-per-satu (output fase = konteks fase berikut)
                    │  fase parallel  : N job delegation paralel (cap per project)
                    │  gate          : approval.requested "fase X selesai — lanjut?"
                    ▼
              Job Queue (P0-DEL-1 diperluas: run_id, phase_id di job)
                    │  tiap job = delegation persona (loop anak yang sudah ada)
                    ▼
              events: workflow.started / phase.entered / phase.done /
                      step.started / step.done / workflow.done  ← kontrak aditif
                    │
                    ▼
        Monitoring board (SSE): kolom fase, kartu agent jalan (sequential rapi
        satu kolom / paralel berdampingan), progress ring persona, hasil per langkah
```

- **Agent yang sama tetap bisa diajak chat langsung** — tab chat per project membuka sesi
  dengan persona roster; Conductor project = pemegang kendali workflow.
- **Steering mid-run** (pola OpenBot): pause/stop satu step, reassign task ke persona lain,
  atau suntik instruksi tambahan — semua lewat kontrak, tercatat di event.
- **Deliverable** = fase akhir mengumpulkan artefak (`reports/`, docs) + ringkasan run.

#### 13.3.1 Planning flow skala besar (v0.6, D22) — pra-eksekusi workflow

```
brief user (skala besar, iterasi berulang)
      │
      ▼
 Yui PLANNER ── consult ──► scholar + analyst + scribe (paralel,
      │                      pertanyaan terstruktur, bukan chat bebas)
      ▼
 dokumen perencanaan project (docs/PLAN.md): scope, risiko, pendekatan,
      keputusan brainstorm disintesis (tiap pendapat terkutip)
      ▼
 task list detail (TaskTree penuh): deskripsi + acceptance criteria +
      depends_on + assignee persona + estimate — divalidasi (coverage
      acceptance per fase, DAG tanpa cycle) → human gate "rencana disetujui?"
      ▼
 Yui CONDUCTOR: delegasi eksekusi (sequential/paralel sesuai depends_on)
      ▼
 fase design → eksekusi → testing → deploy (owner + metrik keluaran per fase,
      §13.3 board) → retrospektif → PLANNER susun run BERIKUTNYA (delta + regresi)
```

- **Planner ≠ Conductor**: Planner dipertanggungjawabkan pada KUALITAS RENCANA (coverage,
  clarity, estimasi); Conductor pada EKSEKUSI (delegasi tepat, steering, selesai tepat).
- **Terukur**: metrik keluaran per fase (planning: % task punya acceptance; eksekusi: task
  done; testing: laporan QA; deploy: checklist rilis) + burndown & health di board.
- **Iterasi**: hasil acceptance → run berantai (`workflow.run_id` ke-N hanya task delta +
  regresi blocker) — proyek besar TIDAK restart dari nol tiap iterasi.

### 13.4 MCP sebagai kapabilitas persona (jawaban pain point)

Alur yang dituju (contoh Figma):

1. Project menghubungkan server MCP **sekali** di level project (OAuth web — P1-MCP-2,
   token di vault). Contoh: `figma`.
2. Binding men-scope turunannya: `figma → yui-designer (persona), tools: [get_file,
   export_frame]` — hanya persona itu yang melihat `mcp__figma__*` di toolset-nya,
   hanya di project ini (D17).
3. Persona memakainya sebagai **skill kerja**: desainer membaca frame Figma di fase `design`,
   mengerjakan, menulis hasil ke docs project.
4. Semua panggilan tercatat di audit log per binding (siapa, kapan, tool apa, hasil).

Katalog + custom server menyusul dari P1-MCP; yang baru hanya model binding granular.

### 13.5 Workbench multi-tab (surface)

| Tab | Isi | Implementasi v0 |
|---|---|---|
| **Chat** | Sesi persona project (yang sekarang) | Sudah ada |
| **Terminal** | CLI di root project — agent & user share sesi terminal yang sama | `xterm.js` ↔ PTY di sandbox (generalisasi `run_command`; approval untuk perintah berisiko) |
| **Browser** | Halaman yang sedang diriset/didesain — agent bisa buka & inspeksi, user melihat | Server-side proxy + render read-only (screenshot/DOM) — D16; interaktif penuh menyusul (§12.14) |
| **File** | Tree kode/docs project + viewer + diff hasil kerja agent | Di atas file tools yang sudah ada |
| **Tim** | Diagram hierarki delegasi live di **kanvas tak terbatas** (ala Excalidraw/draw.io: hold-drag = pan, Ctrl+scroll = zoom, grid dot) — graf nyata dari event delegation lintas sesi | ✅ v0 (dev-10): `TeamTree` + REST `/projects/:id/delegations`; persona sama di dua cabang = dua sesi nyata, label “dari &lt;pemberi&gt;”; durasi per tugas live 5 dtk |
| **Board** | Tasklist project (kolom todo/doing/review/done) + run workflow aktif | P1-PRJ tasklist + P2-FLOW monitoring |
| **Runner** (v0.5) | Proyek berbasis web (mis. React) yang dikerjakan persona: daftar **port yang berjalan** (deteksi dari `run_command` dev-server) + **preview output live** ala iframe; jembatan ke Penpot — desain Picasso Yui dilihat berdampingan dengan hasil Coder untuk dibandingkan | Port registry di runtime + reverse proxy dev-server project; iframe preview (konsep Tailscale Serve menyusul — user belum mencoba); pasangan tab Design §13.9 |
| **Docs** | Markdown deliverable, laporan run | Viewer/editor sederhana |
| **Design** (v0.5) | Canvas Penpot **ter-embed** — hasil kerja persona Designer, live; artefak ter-link ke TaskTree | Tangga embed §13.9: v0 ramping (view + navigasi) → v2 white-label SSO |

Desktop (Tauri, P2-DTL) membungkus semua tab ini native + relay eksekusi lokal; mobile
fokus monitoring board, chat, dan approval push. Pola referensi: OpenBot (browser
persisten + agent control, queue FIFO, thread tabs, dynamic island status).

### 13.6 Kenapa ini mungkin (feasibility)

- **Monitoring = gratis dari event sourcing**: board hanyalah proyeksi UI dari event stream
  yang sudah append-only + replayable — tidak ada sinkronisasi state kedua.
- **Paralel = perluasan yang sudah direncanakan**: delegation in-process hari ini → job
  queue (P0-DEL-1) → DAG executor tinggal menambah `run/phase/step` metadata.
- **Persona per project = config, bukan kode**: sistem persona package sudah deklaratif;
  roster project hanya lapisan assignment di atasnya.
- **Terminal/browser = surface dari tool**: eksekusi sandbox & fetch sudah ada — mengangkat
  jadi tab adalah pekerjaan transport (PTY stream, proxy), bukan mesin baru.
- **Bukti keberadaan**: OpenBot menjalankan kombinasi yang sama (browser embed + CLI agent
  + multi-agent + desktop) sebagai produk nyata — risikonya execution, bukan kemustahilan.

Yang paling berat (jujur): keamanan browser embed, correctness DAG engine (resume/gate),
dan biaya eksekusi paralel — ketiganya sudah masuk tabel risiko §11.

### 13.7 TaskTree & TaskList — pemantauan delegasi (v0.5, D19)

Satu sumber kebenaran = event stream (append-only). **TaskTree** = hierarki dekomposisi
kerja; **TaskList** = flat view (board kolom) dari tree yang sama.

```
Project Board (TaskList — flat)
└── TaskTree (per task aktif — pohon)
    └── task "Riset Phaser untuk game platformer"        [doing]
        ├── subtask "Dokumentasi Physics"  ─ agent Scholar  [running]  ← paralel
        │     └── step: baca docs → ringkas → tulis SKILL draft
        ├── subtask "Contoh project"        ─ agent Coder    [queued]   ← paralel
        └── subtask "Template skor"         ─ agent Scribe   [done → artefak]
```

- **TaskNode**: `{ id, parent, title, status (todo/doing/review/done),
  assignee (persona), refs (delegation job / workflow step), artefak }`.
- Semua transisi lewat event (`task.node.updated`, `delegation.*`) → board di-refresh
  / reconnect = **replay**, tanpa state kedua yang bisa drift.
- Sequential vs paralel **terlihat dari struktur**: satu node aktif dalam satu cabang =
  sequential; node bersaudara ber-status `running` bersamaan = paralel (cap per project).
- Node = juga **titik steering**: klik node → buka sesi agent itu → pause/reassign (P2-FLOW-6).

### 13.8 Dungeon — arena latihan persona (v0.5, D20)

> Jawaban atas “apakah mungkin persona dilatih sampai siap di-assign ke project?” —
> **ya**, karena “skill” di Yuika bukan bobot model, melainkan **file deklaratif
> (SKILL.md) + memory domain persona**. Melatih = menjalankan sesi terpandu yang
> berakhir di skill baru — tanpa infra fine-tuning sama sekali.

```
pilih persona → jalankan MISI (mission.yaml: goal, sumber belajar, acceptance,
                        skill target — mis. “riset dokumentasi Phaser”)
                 │  sesi sandbox terisolasi (bukan project produksi)
                 │  agent: baca sumber → praktik → tulis SKILL draft + bukti
                 ▼
             SKILL lifecycle:  draft ──▶ tested ──▶ ready
                               (hasil sesi)  (lulus eval    (boleh di-assign
                                              acceptance)    ke project)
                 ▼
     Skill inventory per persona (UI: “apa yang persona ini bisa”)
                 ▼
```

> **Status implementasi (dev-10):** DUN-1 + DUN-2 jalan v0 — ruangan dungeon =
> project `kind:"dungeon"` (sesi otomatis sandbox ke folder misi), misi
> `workspace/dungeons/<slug>/mission.yaml` (zod, seed "riset Phaser"), runner
> async + persist; lifecycle skill `draft→tested→ready` di frontmatter
> (`metadata.yui.status`) — accept = tested, blind-eval (DUN-3) → ready.
> **DUN-3 + DUN-5 jalan v0 (dev-10):** eval buta = sesi hakim fresh (kriteria
> acceptance + bukti folder + skill_view; verdict baris terakhir), lulus →
> ready, hasil di `.eval.json`; roster menampilkan readiness per fase (chip ✓/✕
> dengan hint latih di Dungeon).
> **DUN-4 (dev-10, revisi arah user):** Dungeon = **halaman terpisah** (⚔ di
> sidebar) — user MEMILIH persona & MENENTUKAN apa yang dilatih: mode riset
> mandiri (URL opsional) atau bahan ajar file (upload → `materials/`);
> acceptance editable jadi kriteria eval buta. Metafora: mengajar manusia —
> beri materi → persona belajar → internalisasi jadi skill miliknya.
     ASSIGN GATING: roster project menampilkan skill readiness —
     persona tanpa skill yang dibutuhkan fase ditandai “belum siap”
```

- **Eval acceptance** = misi verifikasi buta (blind) yang hanya bisa lulus jika skill
  benar + spot-check manusia untuk skill kritis; threshold = gerbang `tested → ready`
  (pola blind test P1-PER-5).
- Misi berulang → persona makin kaya skill (bersambung ke growth/level P1-PER-4).
- Batas jujur: kualitas skill = fungsi rigor eval — skill basah dicegat di eval +
  curator (P2-AGT-3), bukan dilimmpahkan ke project produksi.

### 13.9 Pipeline desain → kode via Penpot (v0.5, D18)

Penpot = design & prototyping platform **open source** (web; self-host docker/cloud;
API publik + plugin system; file = data terstruktur: shapes, components, design tokens)
> cocok diproduksi & dibaca agent. (pen.dev dicoret: tidak open source.)

```
fase `design`  : persona desain (binding Penpot — D17) membuat/mengubah file Penpot
                 via API/connector dari dalam turn (frame, komponen, tokens)
      ─────────▶ tab Design di platform: hasil terlihat langsung (embed viewer /
                 render export) — user memantau tanpa keluar app
fase `develop` : agent membaca file Penpot (API) → generate komponen kode + tokens
                 → diff di tab File → acceptance di human gate fase
```

- Ekspektasi v0 jujur: **komponen + design tokens**, bukan pixel-perfect app penuh.

**Embed di dalam platform (kebutuhan user v0.5, D18) — bukan app/platform terpisah.**
User tidak pernah keluar Yuika; canvas desain hidup di tab Design. Tangga embed —
**mulai ramping, jaga flow utuh**:

| Layer | Isi (fitur sengaja lean) | Flow yang WAJIB utuh sejak v0 |
|---|---|---|
| **v0 (ramping)** | Canvas Penpot ter-embed scoped ke file project (mekanisme sesuai eksplorasi DSN-1): lihat, navigasi halaman/frame, zoom — tanpa editor penuh; artefak ter-link ke node TaskTree | Agent membuat frame (fase `design`) → user melihat hasilnya live di tab → fase `develop` membaca file → komponen kode → diff — **semua tanpa keluar platform** |
| **v1** | Sunting ringan di dalam tab (komentar, pindah objek) · multi-file project · palet subset | Iterasi manusia di tengah fase desain masuk ke alur agent |
| **v2** | Embed dalam: frontend Penpot self-host di belakang SSO platform (white-label, tanpa login kedua, tema menyatu) | Pengalaman “desain adalah bagian dari Yuika”, bukan jendela pinjaman |

- Eksplorasi repo `D:\projects\penpot` (clone berjalan) → laporan kemampuan API vs
  kebutuhan (task P2-DSN-1); jangan asumsi detail API sebelum dibaca.
- Mulai dari token API (cloud/self-host ringan); self-host penuh menyusul bareng
  self-host edition (D11). Figma tetap opsional sebagai MCP lain (P2-STU-5).
- **Hasil eksplorasi (P2-DSN-1 selesai — `docs/refs/penpot.md`):** mekanisme embed v0 =
  **self-host docker + CSP override** (wajib; cloud tidak bisa di-iframe) · agent kerja
  **headless via RPC API** (`update-file` dengan vektor `changes`; OpenAPI spec bawaan)
  · user memantau via **iframe share-link viewer** (scoped per halaman, update live) ·
  render/thumbnail tanpa browser via **exporter WASM** · v1 = **MCP server resmi**
  (arsitektur plugin-di-dalam-UI — justru cocok karena iframe kita selalu “aktif”;
  tool inti `executeCode` + `exportShape`) · design tokens first-class (input enak
  untuk generate kode). Verifikasi runtime tersisa di checklist laporan.

### 13.10 Multi-model per persona (v0.5, D21)

Tiap persona boleh jalan di model berbeda karena model unggul di scope tugas berbeda:

```
persona.yaml:  Conductor → glm/glm-5.1        (reasoning kuat)
               Coder      → <model kode unggul>
               Scribe     → <model murah & cepat>
               + model_fallback PER PERSONA (bukan hanya global YUI_MODEL_FALLBACK)
```

- Runtime: provider config **per loop** — parent dan tiap delegation anak resolve model
  persona masing-masing (anak bisa beda model dari parent dalam satu run).
- Quirk provider dinetralkan **terpusat** di registry (`normalizeToolSchema` — pelajaran
  kasus GLM 400/1210) + adapter; router menjalankan smoke test kecil per model
  (tool-call 2 langkah) sebelum dipakai — gagal → fallback otomatis.
- Metering & attribution per persona tetap akurat (P1-CRED-4) walau model campuran.

---

*Lampiran menyusul (bisa dikerjakan paralel oleh tim): (a) spesifikasi kontrak API v0 lengkap
(zod), (b) format persona.yaml + validator + acceptance test per persona, (c) skema DB awal,
(d) daftar 15 tool core + schema, (e) 10 skill seed, (f) spec asset pipeline Rive (dimensi,
state machine, daftar input/state, konvensi penamaan), (g) desain ledger metering (SQL
migration pertama), (h) konsep skin/event/achievement (D10).*
