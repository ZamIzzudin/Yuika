# DEMO WEEK 1 — Rencana Eksekusi Demo Internal (1 Minggu, 3 Dev)

> Turunan langsung dari `PLAN.md` v0.3 (D13). Tujuan dokumen ini: **eksekusi harian yang
> konkret** supaya demo internal minggu depan terjadi — tanpa scope creep, dengan fallback
> di setiap titik risiko. Dibaca bersama seluruh tim sebelum Hari 1.

---

## 1. Tujuan & Prinsip Demo

**Tujuan:** membuktikan kepada tim sendiri (dan stakeholder) bahwa *kernel* produk bekerja
end-to-end dan visi produk terlihat nyata: persona berilustrasi-animasi yang memakai skill,
tools, dan MCP, lalu saling mendelegasikan pekerjaan — semua dari **satu monorepo TS dengan
kontrak zod di tengahnya**.

**Prinsip minggu ini:**
1. **Vertical slice, bukan horizontal layers.** Setiap hari harus menghasilkan sesuatu yang
   bisa dilihat di browser. Tidak ada hari "hanya infra".
2. **OUT list adalah hukum.** Fokus = selesai, bukan lengkap. Semua yang di §3 OUT dilarang
   dikerjakan walau "tinggal sedikit".
3. **Shortcut boleh, asal ditandai.** Setiap shortcut diberi komentar `// DEMO-SHORTCUT:` —
   daftarnya dibayar di Fase 0 penuh setelah demo (lihat §11).
4. **Kontrak tidak boleh di-shortcut.** Event dan method yang dipakai demo harus lewat
   `@yui/contracts` — inilah yang membedakan demo dari prototype buangan.

## 2. Skenario Demo (script ±8 menit)

Cerita yang ditampilkan — ini juga acceptance test-nya:

| # | Aksi | Yang harus terlihat |
|---|---|---|
| 1 | Buka web → persona picker | 4 kartu persona (Conductor, Coder, Scholar, Scribe) dengan potret + nama + deskripsi domain |
| 2 | Pilih **Yui Conductor** | Sesi baru; potret Conductor idle (animasi bernafas) |
| 3 | Ketik: *"Riset 3 framework JS paling populer sekarang, bandingkan singkat, tulis laporan markdown ke `reports/`"* | Ekspresi berubah: **thinking** (LLM) → **working** (tool); Conductor mendekomposisi tugas (skill `task-decomposition`) |
| 4 | Conductor memanggil `delegate_task` → **Yui Scholar** | Kartu persona Scholar muncul dengan potret + animasi thinking/working sendiri; progress event mengalir |
| 5 | Scholar memakai `skills_list` → `skill_view` (skill `web-research`) → `web_fetch` + tool MCP `fetch` | Tool activity feed menampilkan tiap call; hasil riset terkumpul |
| 6 | Conductor mendelegasikan penulisan → **Yui Scribe** (skill `report-writing`) → `write_file` ke `reports/` | **Approval card** muncul inline (Scribe menulis file); klik Approve → lanjut; potret Scribe **awaiting_input** saat menunggu |
| 7 | Laporan selesai, isi file ditampilkan | Ekspresi **celebrating** di Conductor; ringkasan delegation masuk transcript |
| 8 | Refresh browser → sesi lanjut | Sesi **resume** (replay event); tanya *"ringkas apa yang barusan kita kerjakan"* → dijawab dari konteks |
| 9 | (Bonus, bila stabil) `run_command` `node -v` | Approval → output terminal tampil |

## 3. Scope

### 3.1 IN (dikerjakan)

- Monorepo `npm` + `turbo`: `packages/contracts`, `packages/core`, `packages/personas`,
  `packages/skills`, `apps/web`
- Kontrak v0 (zod): REST minimal + event catalog + approval (lihat §5)
- Core: turn loop streaming (OpenAI-compatible, D12), tool registry + dispatch multi-round,
  prompt stack `[core][persona][skills index]`, delegation-lite in-process, approval pause/resume
- Tools (9): `read_file`, `write_file`, `list_files`, `web_fetch`, `run_command` (allowlist,
  selalu approval), `skills_list`, `skill_view`, `delegate_task`, `request_approval`
- MCP: client stdio via `@modelcontextprotocol/sdk`, 2 server (`server-fetch`,
  `server-filesystem` scoped `reports/`), tool ter-register dengan prefix `mcp__<server>__<tool>`
- 4 persona package (Conductor, Coder, Scholar, Scribe) — teks + config final, art placeholder
- 5 skill seed (§7)
- Web: chat streaming SSE, persona picker, tool activity feed, approval card, delegation card
  dengan potret persona anak, ekspresi animasi (Rive placeholder), resume/replay
- Session store: SQLite append-only (`better-sqlite3`), replay `?since=`
- Ekspresi: mapping event → state → Rive input (placeholder asset; fallback CSS — §9)

### 3.2 OUT (dilarang dikerjakan minggu ini)

Auth & user · billing/metering/credits · mobile · desktop/Tauri · sandbox container
(`run_command` = child_process allowlist, TANDAI shortcut) · memory learning-loop sungguhan
(hanya stub USER.md catatan statis) · curator · cron · kanban · compression (jaga prompt demo
pendek) · marketplace · multi-provider router (satu provider saja) · WebSocket (SSE cukup) ·
licensing/premium · skin/achievement system · i18n.

## 4. Struktur Repo & Stack

```
your-yui/
├── package.json                  # npm workspace root + turbo
├── turbo.json
├── .env.example                  # YUI_OPENAI_BASE_URL, YUI_OPENAI_API_KEY, YUI_MODEL, YUI_MCP_CONFIG
├── packages/
│   ├── contracts/                # zod: REST + events + approval + persona types (SINGLE SOURCE OF TRUTH)
│   ├── core/                     # loop.ts, turn_*.ts, registry.ts, tools/, personas/, skills/, delegation/, provider/
│   ├── personas/                 # data: yui-conductor, yui-coder, yui-scholar, yui-scribe
│   └── skills/                   # data: 5 skill seed
└── apps/
    └── web/                      # Next.js App Router (host core in-process utk demo — lihat DEMO-SHORTCUT)
```

- **Node LTS + TypeScript strict**. Web: **Next.js** + `@rive-app/react-canvas`.
- **DB:** `better-sqlite3` (file `demo.db` — dihapus tiap reset demo).
- **Provider:** `openai` npm SDK pointed ke `YUI_OPENAI_BASE_URL` (D12: kunci langsung,
  OpenAI-compatible). Semua akses lewat interface `ProviderAdapter` agar tak ada vendor lock
  di kode loop.
- **Testing:** vitest — kontrak (roundtrip zod), registry dispatch, loop vs fake provider.
  Target minggu ini: green di CI, bukan coverage angka.

**Shortcut arsitektur demo (disengaja):** core berjalan in-process di Next.js route handler
(bukan service terpisah). Ini DIBAYAR di Fase 0 penuh (split `apps/api` + worker) setelah
demo. Yang TIDAK boleh ikut di-shortcut: kontrak (semua event lewat `@yui/contracts`) dan
append-only session store.

## 5. Kontrak v0 (spesifikasi konkret, implementasi Hari 1–2)

```ts
// packages/contracts — zod, semua tipe di-infer dari sini

// REST (dilayani route handler Next.js)
POST /api/sessions            { personaId }            → { sessionId, persona }
GET  /api/personas                                     → PersonaInfo[]   // id, name, expertise, description, portrait
GET  /api/sessions/:id/events?since=<eventId>          → YuiEvent[]      // replay
POST /api/sessions/:id/message { text }                → { accepted: true }
POST /api/approvals/:id        { approved: boolean }   → { ok: true }

// SSE stream
GET  /api/sessions/:id/stream                          → text/event-stream (YuiEvent)

// Event catalog (YuiEvent = discriminated union)
turn.started        { turnId }
message.delta       { turnId, delta }
message.done        { turnId }
tool.call           { turnId, callId, name, args }
tool.result         { turnId, callId, result, isError }
delegation.started  { turnId, childSessionId, personaId, goal }
delegation.progress { childSessionId, state }            // thinking|working|awaiting_input|done|error
delegation.done     { turnId, childSessionId, summary }
persona.state       { sessionId, personaId, state }      // idle|thinking|working|awaiting_input|done|error|celebrating
approval.requested  { requestId, tool, args, reason }
approval.resolved   { requestId, approved }
session.error       { message, recoverable }
```

Aturan implementasi: setiap event dapat `id` (monotonic per sesi, dari SQLite) — inilah kunci
replay/resume. UI **tidak punya tipe tangan**: semua dari `@yui/contracts`.

## 6. Persona Package Demo (4)

```
packages/personas/yui-scholar/
├── persona.yaml      # id, name, expertise, description, portrait (placeholder), states[7]
├── PERSONA.md        # kepribadian + cara kerja riset (metodologi, sitasi, hati-hati klaim)
├── skills.yaml       # bundled: [web-research]
├── toolsets.yaml     # aktif: web_fetch, mcp__*, read_file, write_file
├── model.yaml        # primary/aux quality hint (router sederhana: primary saja utk demo)
└── delegation.yaml   # spawnable_by: [user, yui-conductor]
```

- **Conductor**: default; PERSONA.md menekankan dekomposisi → delegasi, bukan mengerjakan
  sendiri; skill `task-decomposition` memberi format eksplisit kapan harus memanggil persona
  mana. *Persona ini yang paling butuh prompt iteration — jatahkan waktu Hari 5.*
- **Coder**: ikut dikirim di picker (deskripsi jelas) walau belum disentuh skenario —
  kejujuran roster, bukan demo material.
- **Scribe**: skill `report-writing` (struktur laporan, tone, format file).
- Semua persona memakai **placeholder art yang sama** dengan tint warna beda per persona
  (pipeline Rive final = Fase 2; minggu ini yang dipersoalkan adalah *state mapping*-nya).

## 7. Skill Seed (5)

| Skill | Persona | Isi singkat |
|---|---|---|
| `task-decomposition` | Conductor | Format memecah permintaan → sub-tugas → persona tujuan → kapan delegasi vs kerjakan sendiri |
| `web-research` | Scholar | Loop: query → fetch → ekstrak poin → cross-check 2 sumber → sitasi URL |
| `report-writing` | Scribe | Struktur laporan markdown (exec summary, perbandingan tabel, rekomendasi), penamaan file |
| `code-review-basics` | Coder | Checklist review (bukan materi demo inti — bukti roster nyata) |
| `yui-conventions` | global | Lokasi file workspace, tone menjawab, format ringkasan |

Format = `SKILL.md` (frontmatter `name`, `description` ≤ 60 char, `version`, `author`,
`platforms`, `metadata.yui.*`) — **kompatibel agentskills.io** (warisan Hermes; ekosistem
skill dunia bisa dipakai apa adanya kelak).

## 8. Pembagian Kerja & Rencana Harian (3 dev × 7 hari)

> Sinkron 15 menit tiap pagi: kemarin → hari ini → blocker. Setiap sore: apa yang bisa
> dilihat di browser. Merge ke `main` tiap sore (trunk-based, PR kecil).

### Hari 1 (Senin) — Fondasi & walking skeleton
- **Bersama (2 jam pertama):** scaffold monorepo (turbo, tsconfig strict, vitest, lint,
  `.env.example`), review kontrak v0 di whiteboard →bekukan penamaan event.
- **Dev A (core):** `packages/core`: tipe pesan internal, `ProviderAdapter` + adapter
  OpenAI-compat streaming; loop v1 **tanpa tools** (stream → final). Vitest dengan fake
  provider.
- **Dev B (web+kontrak):** `packages/contracts` penuh (§5) + `apps/web` chat shell + SSE route
  yang menjalankan core in-process; streaming teks tampil.
- **Dev C (persona+skill):** loader `persona.yaml` + `PERSONA.md` (zod-validated) + 4 persona
  seed; loader `SKILL.md` + 5 skill seed; `GET /api/personas`.
- ✅ **Exit:** chat web streaming balasan LLM; persona picker menampilkan 4 persona (kartu statis).

### Hari 2 (Selasa) — Registry & tools
- **Dev A:** registry (`register`/`discover`/`dispatch`, schema JSON dari zod) + tools
  `read_file`, `write_file`, `list_files`, `web_fetch`; loop multi-round tool calls
  (stream tool-call delta → eksekusi → append result → iterasi).
- **Dev B:** UI tool activity feed (dari `tool.call`/`tool.result`); mulai session store SQLite
  append-only + `GET events?since` replay; `POST /message` idempotent sederhana.
- **Dev C:** tools `skills_list`/`skill_view` (progressive disclosure: index hanya nama+deskripsi);
  pasang prompt stack di core bareng Dev A: `[core][PERSONA.md][skills index]` — **frozen per
  sesi** (disiplin cache sejak demo).
- ✅ **Exit:** agent baca/tulis file & fetch URL; memilih & membaca skill sesuai tugas.

### Hari 3 (Rabu) — Approval + ekspresi + persona UX
- **Dev A:** approval engine: wrapper tool berisiko (`write_file` di luar `reports/`,
  `run_command` apa pun) → pause turn → `approval.requested` → menunggu `POST /api/approvals`;
  `run_command` = `child_process.execFile` + allowlist (`node`, `ls`, `echo`) + timeout —
  `// DEMO-SHORTCUT: bukan sandbox`.
- **Dev B:** approval card inline (Approve/Deny); persona picker benar-benar membuat sesi baru
  per persona; pasang `@rive-app/react-canvas` + komponen `<PersonaPortrait>` dengan mapping
  `persona.state` → input Rive.
- **Dev C:** placeholder asset Rive (file komunitas gratis dengan state machine, atau blob
  sederhana dibuat cepat di Rive editor); mapping 7 state; fallback CSS pulse bila Rive macet
  (**batas waktu: 3 jam, lalu fallback**).
- ✅ **Exit:** ekspresi reaktif di 7 state; approval inline bekerja end-to-end.

### Hari 4 (Kamis) — Delegation & MCP
- **Dev A:** `delegate_task(persona, goal, context)`: child loop in-process dengan persona anak
  (toolset anak sesuai `toolsets.yaml`), events `delegation.*` di-stream ke sesi parent,
  ringkasan anak kembali sebagai tool result parent. Cap: 2 anak paralel.
- **Dev B:** UI delegation: kartu persona anak (potret + progress + ringkasan), nested feed;
  refresh/resume stabil (replay).
- **Dev C:** MCP client (`@modelcontextprotocol/sdk`, stdio): `server-fetch` +
  `server-filesystem` scoped `reports/`; register ke registry prefix `mcp__`; config dari
  `.env` (daftar server) — `// DEMO-SHORTCUT: tanpa sandbox/health/reconnect` (itu Fase 1).
- ✅ **Exit:** skenario penuh §2 jalan kasar end-to-end (jelek pun tidak apa-apa).

### Hari 5 (Jumat) — Integrasi, prompt tuning, polish
- **Bersama pagi:** dry run skenario penuh; daftar bug diprioritaskan (P0 = blok skenario).
- **Dev A:** P0 core (race condition SSE, error recovery turn sederhana: retry 1×).
- **Dev B:** polish UI (typography, dark, layout kartu persona) + loading/empty/error states.
- **Dev C:** **prompt iteration Conductor** (paling menentukan: dia harus konsisten
  mendekomposisi & mendelegasikan — siapkan 3 varian prompt, uji blind 5 prompt user berbeda);
  stub USER.md (append catatan statis "preferensi user" sekali di awal sesi — label learning-loop
  preview, jangan klaim lebih).
- ✅ **Exit:** skenario lulus 2× berturut-turut tanpa intervensi manual.

### Hari 6 (Sabtu) — Dry run & rekam
- Dry run penuh 2× (layar + audio direkam sebagai **backup video**).
- Freeze scope pukul 12.00 — setelah itu hanya bug P0/P1.
- Tulis checklist demo (§2) jadi satu halaman `docs/demo-runbook.md` (klik-by-klik).
- ✅ **Exit:** video backup tersimpan aman; runbook siap.

### Hari 7 (Minggu) — Rehearsal & buffer
- Rehearsal final dengan perangkat & jaringan demo sebenarnya.
- Siapkan: key provider cadangan, model fallback (`YUI_MODEL_FALLBACK`), DB demo fresh
  (`reports/` bersih), laptop cadangan dengan video.
- **Buffer 100%** — jangan jadwalkan fitur apa pun.
- ✅ **Exit:** DEMO.

## 9. Risiko Minggu Ini & Fallback

| Risiko | Prob. | Fallback |
|---|---|---|
| LLM buruk di tool-calling / Conductor tak mau mendelegasikan | Tinggi | Pilih model kuat tool-calling (uji Hari 1, kunci Hari 2); 3 varian prompt Hari 5; worst case: skenario fallback "Scholar langsung tanpa Conductor" (tetap menunjukkan persona+skill+MCP) |
| Rive placeholder makan waktu | Sedang | Timebox 3 jam Hari 3 → fallback CSS blob + emoji per state (mapping event tetap sama — ganti asset saja nanti) |
| SSE + child delegation race/error | Sedang | Delegasi paralel → sekuensial (cap 1) tanpa mengubah kontrak |
| MCP server flaky di Windows | Sedang | Uji Hari 4 pagi; fallback: hanya `server-filesystem`, `web_fetch` native menangani riset |
| `run_command` bermasalah | Rendah | Item bonus — buang tanpa menggang skenario inti |
| Scope creep | **Pasti** | §3.2 OUT list dihafal; reviewer menolak PR di luar scope dengan referensi dokumen ini |

## 10. Acceptance Checklist Demo (definisi selesai)

- [ ] Chat web streaming token dari provider OpenAI-compatible (D12)
- [ ] Persona picker → sesi baru per persona; 4 persona tampil
- [ ] Ekspresi animasi bereaksi ke ≥5 state nyata (thinking/working/awaiting_input/done/celebrating)
- [ ] Agent memilih skill lewat `skills_list` → `skill_view` dan mengikuti isinya
- [ ] ≥1 tool MCP dipanggil sukses (fetch atau filesystem)
- [ ] Conductor mendekomposisi & mendelegasikan ke ≥2 persona; progress + ringkasan tampil
- [ ] Approval muncul inline; Approve melanjutkan, Deny dihormati agent
- [ ] Refresh → sesi resume via replay; pertanyaan lanjutan dijawab dari konteks
- [ ] Semua event UI berasal dari `@yui/contracts` (audit: grep tipe tangan di `apps/web` = 0)
- [ ] Video backup demo tersimpan

## 11. Setelah Demo: Bayar Utang (masuk kembali ke Fase 0 penuh)

Daftar `DEMO-SHORTCUT` yang wajib dilunasi (grep kode saat mulai Fase 0):

1. Split `apps/web` → `apps/api` (service terpisah) + worker pool (core keluar dari proses Next.js)
2. `run_command` → sandbox container (Docker) + policy path + resource cap
3. MCP → lifecycle penuh (health, reconnect, park) + per-tenant isolation (desain Hermes §4.3)
4. Auth & workspace & tenant scope di semua jalur (D11 entitlement mulai dirancang)
5. Delegation in-process → job queue persist (survive restart)
6. Session store SQLite → skema Postgres + migration path; metering events mulai mengalir (§8.4 PLAN)
7. Multi-provider router + failover (interface `ProviderAdapter` sudah menunggu)
8. Compression engine v0 (demo hanya menjaga prompt pendek)

---

*Prinsip penutup dari Hermes yang paling relevan minggu ini: **selesaikan slice, bekukan
kontrak, tandai shortcut** — sisanya Fase 0 membayarnya dengan tenang.*
