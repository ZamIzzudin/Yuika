# YOUR-YUI — Blueprint Platform Agent Multi-Platform

> Dokumen perencanaan **v0.3** — diperbarui setelah putaran keputusan kedua (lihat §2).
> Disusun dari pembelajaran mendalam `hermes-agent` (Nous Research) + brainstorming
> konsep dari ekosistem tools lain. Status: draft aktif — eksekusi demo dimulai.
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
4. [Diseksi Konsep Hermes → Adopsi untuk Your-Yui](#4-diseksi-konsep-hermes--adopsi-untuk-your-yui)
5. [Konsep dari Ekosistem Lain untuk Di-Assemble](#5-konsep-dari-ekosistem-lain-untuk-di-assemble)
6. [Arsitektur Your-Yui](#6-arsitektur-your-yui)
7. [Sistem Persona Yui (pilar produk)](#7-sistem-persona-yui-pilar-produk)
8. [SaaS Credits: Metering & Billing](#8-saas-credits-metering--billing)
9. [Keputusan Bahasa: Python vs Pure TypeScript](#9-keputusan-bahasa-python-vs-pure-typescript)
10. [Roadmap Bertahap (di-prioritas ulang)](#10-roadmap-bertahap-di-prioritas-ulas)
11. [Risiko & Mitigasi](#11-risiko--mitigasi)
12. [Pertanyaan Terbuka Berikutnya](#12-pertanyaan-terbuka-berikutnya)

---

## 1. Ringkasan Eksekutif & Vision

### 1.1 Pernyataan vision

**Your-Yui** adalah platform AI agent yang berjalan **hanya** di permukaan milikmu sendiri —
web (termasuk self-hosted), mobile, dan desktop — dengan satu inti agent yang sama di cloud.
Yui bukan chatbot generik: dia adalah **keluarga persona spesialis** — Yui Coder, Yui Scholar,
Yui Analyst — masing-masing dengan ilustrasi, kepribadian, skill set, dan memori keahlian
sendiri, yang tumbuh lewat learning loop, bekerja terjadwal, dan **saling mendelegasikan**
pekerjaan. Pengalaman "teman kerja yang hidup", bukan "alat".

**Tagline kandidat:** *"Your Yui. Everywhere — but only yours."*

### 1.2 Diferensiasi inti

| Dimensi | Hermes | Your-Yui |
|---|---|---|
| Model deployment | Local-first: CLI/TUI di mesin user + gateway VPS | **Server-first**: runtime agent di cloud-mu; klien web/mobile/desktop bicara ke satu API; opsi self-host web |
| Ekosistem | Terbuka: 28 platform messaging, API publik | **Tertutup & terkurasi**: hanya aplikasi Your-Yui (web/mobile/desktop). Notifikasi via push milik sendiri |
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
| D9 | Roster 6 persona (§7.4) **disetujui untuk sekarang** | Conductor + 5 spesialis; ilustrasi = workstream paralel non-blocking |
| D10 | Varian ilustrasi **gratis by usage**; monetisasi kosmetik via **skin berbayar + event musiman + achievement** (konsep baru) | Garis keras: tidak ada pay-to-win — skin murni kosmetik, keahlian persona tidak pernah dijual (§7.6) |
| D11 | Self-host = **lisensi berbayar + wajib akun premium**; premium = entitlement akun lintas platform (sekali premium → web+mobile+desktop) | Butuh license/entitlement service + validasi saat start + grace offline (§8.3) |
| D12 | Model = **kunci provider langsung, OpenAI-compatible saja** untuk sekarang | Tetap di belakang interface `ProviderAdapter`; adapter lain (Anthropic native, dll.) menunggu Fase 1 |
| D13 | **Demo internal: 1 minggu** | Vertical slice terkompresi dari Fase 0; rencana harian 3 dev: `DEMO-WEEK-1.md` |

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
menunjukkan semua yang rusak. Your-Yui menggeneralisasi: **satu kontrak → semua klien** (§6.3).

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

## 4. Diseksi Konsep Hermes → Adopsi untuk Your-Yui

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

**Adopsi untuk Your-Yui — MCP adalah sistem ekstensi utama:**
- Client multi-transport + lifecycle state machine + health: adopsi penuh.
- **UX lebih baik dari Hermes**: karena klien-mu web/mobile, OAuth & trust flow jadi klik-satu-
  tombol di browser (Hermes harus lewat YAML/terminal).
- **Per-tenant sandbox**: server MCP user berjalan di container terisolasi dengan egress policy
  (kebutuhan multi-user memaksa ini — Hermes bisa stdio bare karena personal).
- **Sampling & elicitation diteruskan ke UI-mu**: MCP server minta input → jadi *server request*
  ke klien (push notification bila perlu) — sinergi dengan pola `server_requests` Hermes.
- **Your-Yui sebagai MCP server** (fase lanjut, opsional): workspace bisa expose agent-nya
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
- 🔧 Kaitkan ke persona (§7): skill yang dipelajari Yui Coder masuk domain persona itu;
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
kanban dengan human review gate; heartbeat. Di Your-Yui: "Mission Control" — semua cron,
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
  Your-Yui: backend sandbox (container default; device relay; penyedia cloud sandbox menyusul).

---

## 5. Konsep dari Ekosistem Lain untuk Di-Assemble

| Sumber | Konsep | Pakai di Your-Yui |
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

## 6. Arsitektur Your-Yui

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

> Keputusan D5. Ini bagian yang membuat Your-Yui bukan "agent platform lain" —
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
name: "Yui Coder"
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
| **Yui Coder** | software dev | file, terminal→sandbox, browser, delegation | TDD, systematic-debugging, code-review |
| **Yui Scholar** | riset | web, browser, file | research methodology, citation, fact-check |
| **Yui Analyst** | data | code-exec, file | data cleaning, viz, statistics |
| **Yui Scribe** | tulis/konten | file, web | writing styles, editing, SEO |
| **Yui Operator** | otomasi/devops | terminal, cron, delegation | cron blueprints, monitoring |

> Mulai 4–6 persona; Conductor + 3 spesialis adalah minimum untuk demo cerita delegation.

### 7.5 Arsitektur memori per persona

```
                    ┌────────────── Global (semua persona berbagi) ─────────────┐
                    │  USER.md (siapa kamu, preferensi) · workspace facts · KB  │
                    └───────────────────────────────────────────────────────────┘
   ┌─ Episodic: sesi per-persona, searchable lintas persona (session_search) ─┐
   └─ Procedural: skill per-domain persona (yui-coder punya repo skill coding) ┘
```

Aturan: fakta user global (semua persona tahu kamu suka ringkasan pagi); keahlian domain
terisolasi (Yui Scholar tidak otomatis mahir coding) tapi **Conductor bisa memanggil siapa
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
- **MCP**: tiap persona bisa punya koneksi MCP kurasi (Yui Coder ↔ GitHub MCP; Yui Scribe ↔
  Notion MCP) — OAuth di web, sekali klik.

---

## 8. SaaS Credits: Metering & Billing

> Keputusan D3. Credits = unit komputasi universal. Prinsip: **setiap aksi berbiaya
> menghasilkan usage event → ledger append-only → admission control berbasis saldo.**

### 8.1 Apa yang di-meter

| Item | Satuan | Catatan |
|---|---|---|
| LLM tokens | credit per 1k token, **rate per model** (margin di atas harga provider) | Input/output/cache terpisah; aux model lebih murah — insentif routing pintar |
| Sandbox compute | credit per detik (tier CPU/RAM) | Termasuk MCP server user yang di-host Your-Yui |
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
akun premium**: instance self-host memvalidasi lisensi ke license-server Your-Yui saat start
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
- [ ] Monorepo TS + `contracts/` (zod) + codegen (SDK web; OpenAPI) + CI
- [ ] Agent core v1: turn loop streaming, 1 provider, interrupt, event sourcing + replay
- [ ] Registry + ±8 tool inti (file RW/patch/search, terminal→sandbox sederhana, web_fetch,
      skills_list/skill_view, ask_user, request_approval)
- [ ] Skills loader (agentskills.io format) + 10 skill seed + usage tracking dasar
- [ ] Session store append-only + `session.attach` resume
- [ ] Web chat v1: attach sesi, stream, approval inline, persona slot statis (placeholder art)

**Demo keluar:** chat di web, Yui membaca skill, eksekusi kode di sandbox, minta approval,
resume setelah refresh.

### Fase 1 — Tiga prioritas + persona v1 + credits v1 (± 8–10 minggu)
- [ ] **MCP**: client multi-transport + katalog kurasi ±20 + OAuth web + MCP worker tersandbox
- [ ] **Memory learning-loop**: USER.md/MEMORY.md + nudge persist + skill-create-from-experience
      + per-domain persona memory (dasar §7.5) + `session_search`
- [ ] **Delegation**: job-based background subagent, batch paralel, progress event, steering,
      `delegate_task(persona=…)` — persona sebagai preset child
- [ ] **Persona v1**: manifest + PERSONA.md prompt layer + toolset/model binding + expression
      state mapping (asset pipeline siap; ilustrasi bisa menyusul masuk)
- [ ] Multi-provider + failover + aux routing (compression/title pakai model murah)
- [ ] **Credits v1**: usage events + ledger + admission (hold→settle) + saldo UI + plan sederhana
- [ ] Compression (ContextEngine default) + prompt-cache discipline tests

**Demo keluar:** "Yui Conductor memecah tugas riset → mendelegasikan ke Yui Scholar (dengan
koneksi MCP Notion) → skill baru tercatat di domain persona → semua terlihat dari web dengan
expression states; burn-rate credit terukur per turn."

### Fase 2 — Multi-platform UX penuh (± 10–12 minggu)
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
- [ ] Self-host web edition (docker-compose) — keputusan lisensi §12

### Fase 4 — Skala & diferensiasi lanjut
- [ ] Visual workflow builder (node graph) di atas engine
- [ ] Eval harness perilaku persona (regression suite — pola batch_runner Hermes)
- [ ] Sandbox microVM (Firecracker/gVisor) untuk plan enterprise
- [ ] Enterprise: SSO, audit export, BYO-KMS, SLA
- [ ] (Opsional) Your-Yui sebagai MCP server per-workspace; A2A antar-workspace internal

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
10. **Nama:** "Your-Yui" final? Cek domain/trademark sebelum branding jalan jauh.

---

*Lampiran menyusul (bisa dikerjakan paralel oleh tim): (a) spesifikasi kontrak API v0 lengkap
(zod), (b) format persona.yaml + validator + acceptance test per persona, (c) skema DB awal,
(d) daftar 15 tool core + schema, (e) 10 skill seed, (f) spec asset pipeline Rive (dimensi,
state machine, daftar input/state, konvensi penamaan), (g) desain ledger metering (SQL
migration pertama), (h) konsep skin/event/achievement (D10).*
