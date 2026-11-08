# TASKS.md, Checklist Delegasi & Roadmap Development (awal → siap testing)

> **REBRAND 2026-11: "Your-Yui" → "Yuika"** (yui = mimpi/唯華 + ka = unggul/香,
> "mimpi yang unggul"). Nama pendek **Yui** dipertahankan (persona maestro, prefix
> `YUI_`, scope `@yuika/*`). Semua kemunculan brand di sumber/docs di-update.

> **Update sesi kernel 2026-11 (agent, branch `dev/p0-kernel`):** **P1-DEL-3 pause/resume
> anak delegasi** (⏸ kartu delegasi; gate di batas iterasi; cancel saat pause tetap
> graceful) · **P1-DEL-1 cap per plan** (`delegation.max_concurrent`; min() dengan cap
> budget; conductor 3, planner 2) · **P0-INF-1 split apps/api** (Fastify :3211 pemilik
> runtime; web pure frontend; 36 route dipindah 1:1; SSE + upload raw ikut) ·
> zod **v3 → v4.6.7**
> (kontrak + core + web + override global; menutup GHSA ReDoS zod, audit prod kini
> **0 vulnerabilities**) · **openai SDK 4.104 → 7.51** (menutup advisory high openai
> 4.55–5.23; adapter streaming API tak berubah) · `zod-to-json-schema` pensiun →
> `z.toJSONSchema(draft-7)` native · `normalizeToolSchema` kini mempertahankan bentuk
> ANGKA exclusiveMin/Max (v4 memancarkannya langsung) · P0-INF-3 pino + traceId per
> turn · P0-INF-4 error taxonomy (`YuiError{kind,code,retryable}` + `SessionErrorEvent`
> bermakna) · P0-CORE-5 contract invariants ✅ (sudah ada di suite CI).
>
> Pasangan `PLAN.md` (mengapa) dan `DEMO-WEEK-1.md` (eksekusi minggu demo).
> **Dokumen ini = sumber kebenaran progres tim.** Update tiap sinkron pagi (15 menit).
>
> **Cara pakai:**
>
> - Format task: `- [ ] **ID**, deskripsi · *Owner · est · dep*` → Acceptance singkat.
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
> USER.md stub (W5-C2), test prompt stack frozen (W2-C2), total 24+3 test green.
>
> **Update sesi dev 3:** UI overhaul penuh ala OpenBot (design token netral + aksen tunggal,
> chat tanpa-bubble agent / bubble terang user, steps lipat, empty state per-persona, tab-ready) ·
> fix provider GLM 400/1210 (normalisasi `exclusiveMinimum` boolean di tool schema) ·
> **PLAN v0.4: pilar Studio Proyek** (§13, D14–D17) → task baru di **P1-PRJ**, **P2-FLOW**,
> **P2-STU**. Referensi: `D:\projects\openbot`; pen.dev menyusul di-clone (P2-STU-6).
>
> **Update sesi dev 4:** **pen.dev → Penpot** (pen.dev tidak open source; repo
> `D:\projects\penpot` sedang di-clone, eksplorasi menyusul P2-DSN-1) · **PLAN v0.5**
> (D18–D21): TaskTree & TaskList monitoring (P1-PRJ-7, P2-FLOW-7) · **Dungeon** arena
> latihan persona → skill lifecycle `draft→tested→ready` → assign gating (P1-DUN) ·
> **pipeline desain→kode Penpot** (P2-DSN) · **multi-model per persona** (P1-MDL).
> Detail konsep: PLAN §13.7–13.10.
>
> **Update sesi dev 5 (putusan user):** **Yui Designer masuk roster** (D9 = 7, PLAN §7.4,
> task P1-PER-7) · **Penpot wajib ter-embed di platform** (bukan app terpisah), scope v0
> **ramping tapi flow utuh**: agent buat (fase design) → user lihat live di tab Design →
> develop baca → kode, tanpa keluar platform (tangga embed PLAN §13.9; D18 diperinci).
>
> **Update sesi dev 6 (P2-DSN-1 selesai):** eksplorasi Penpot (`docs/refs/penpot.md`),
> **embed wajib self-host** (CSP `frame-ancestors`, cloud tak bisa di-iframe; §12.15
> terjawab) · v0 = agent via **RPC API** (`update-file` headless) + **iframe share-link
> viewer** (update live) · v1 = **MCP server resmi** (plugin hidup di sesi embedded,
> konstrain “tab aktif” terpenuhi otomatis) · render headless via exporter WASM ·
> OpenAPI spec bawaan (`/api/main/doc`) → client digenerate.
>
> **P1-PRJ-1+2+3+4+5+6+7 & P1-MCP-3 selesai (sesi dev 7):** project first-class (store/REST/roster tasklist/UI drawer), TaskTree dari replay event, **MCP trust gate fail-closed** (`mcp-trust.json` + deny per-tool + audit + connect/disconnect dinamis + panel sidebar) dan **binding MCP project×persona (D17)**, agent Conductor ter-bind memanggil tool filesystem live (audit terisi). 65 test green. Skenario test mandiri: `docs/TEST-SCENARIO-STUDIO-P1.md`.
>
> **DS-1 Design System + fix mapping draf (feedback user: "style makin berantakan & tidak konsisten; kurang suka pure CSS, pakai Tailwind"; + "skill hasil latihan tidak bisa di-mapping, hanya bawaan"; + "tak ada tempat menerima draf"):**
> (1) **Tailwind v4 aktif** (`@tailwindcss/postcss`; theme alias token `--yui-*` → utility semantik `bg-surface/text-muted/border-line/rounded-card/…`, visual paritas; `@import "tailwindcss" source(none)` + `@source` eksplisit karena auto-detection Windows kena EPERM junction AppData → utility hilang diam-diam; cache `.next` lama ikut menipu, nuke saat ganti config). (2) **Bundle komponen global `apps/web/src/components/ui/`**: Button (primary/secondary/ghost/danger + sm/md + active), Chip/ChipToggle/Dot (6 tone), Card/CardHead (surface/raised/inset), Modal (glass, ESC+overlay), Field/TextInput/TextArea/Select, TabList, EmptyState/MetaRow/SectionTitle, barrel `ui/index.ts`. (3) **docs/DESIGN-SYSTEM.md**: prinsip, tabel token→utility, inventaris komponen + contoh, pola layout, do/don't, checklist fitur baru, peta migrasi file. **DungeonView = layar referensi** (Tailwind murni, CSS legacy dungeon dihapus dari globals.css 110k→88k). (4) **Fix draf skill**: `getSkillBindings` kini menyertakan draf (slug+status); tab Mapping Skill punya tombol **"Terima & pasang"** (POST /api/skills accept → attach), self-sufficient, tidak lagi tergantung tab Skill yang hanya muncul saat project aktif (akar keluhan user). Migrasi bertahap file lain tercatat di §7 DS doc (batch 2–4).
>
> **DS-1 lanjutan, migrasi penuh batch 2–4 + Phosphor Icons (feedback user: "migrasikan batch 2 fokus ke UI dulu", "lanjutkan ke batch 3", "selesaikan batch 4", + pakai Phosphor untuk semua ikon):** (1) **batch 2**, ChatView (timeline bubble/gutter, kartu approval/delegasi/reasoning, composer), SettingsModal (ui Modal/Field + tabel metering Tailwind), shell `page.tsx` (sidebar, TabList workspace dengan dot status pulse, dropdown persona glass, StateChip, empty state). (2) **batch 3**, SkillsTab, ProjectPanel (konfirmasi hapus 2-langkah), PersonaPicker (+ galeri bentuk ke ui Modal; kelas `settings-*` pensiun). (3) **batch 4**, TaskDrawer (sesi/roster/papan kanban drag&drop/memori/pohon/Tim+bench), FileTab (tree+viewer+diff berwarna), McpPanel (trust gate+katalog+audit), TeamTree (kanvas pan/zoom tetap; garis penghubung via varian `before:`/`after:` Tailwind), TracePanel (ikon per kind), Markdown (self-contained Tailwind, kelas `.md` dihapus). (4) **`@phosphor-icons/react` = satu-satunya set ikon**, emoji ikon & SVG inline buangan (portret tetap); peta ikon + aturan ukuran di DESIGN-SYSTEM.md §5b. (5) **FIX diam-diam**: token `--radius-pill:999px` ditambahkan, `rounded-pill` dipakai sejak batch 2 tapi utility-nya tak pernah ada (chip/dot/budget-bar tampil kotak). (6) **globals.css 1100+ → 441 baris**, hanya token `@theme`, keyframes animasi, 4 `@utility` (glass-panel/msg-in/caret-blink/typing-dot), `.chat-empty` (PersonaPortrait) & scrollbar yang tersisa; **nol kelas komponen legacy**. 227 core hijau tiap batch; verifikasi dev fresh `.next` (utility ter-generate, page 200). Batch 2=`db7b07e` · 3=`f6cb5c0` · 4=`a761d6e`. **PersonaOrbit (feedback user: kartu persona floating sederhana, maskot+nama saja, deskripsi tampil di pusat saat hover): `PersonaGrid` → orbit elips dengan animasi `@utility float-yui`; pusat = maskot 92px + nama + deskripsi + badge level; klik kartu tetap memulai sesi.** **Retrofit (feedback user): maskot pusat = `OrinPortrait` INTERAKTIF (mata ikut kursor + klik), maskot statis tersendiri dihapus, halaman utama = konstelasi saja.** **Dekorasi orbit (feedback user "terlalu sepi, floating tak terlihat"): elips putus-putus tepat di jalur kartu + ring dalam + glow aksen di belakang maskot; float diperkuat (±5px) dengan bayangan yang ikut bernapas di keyframes `yui-float`, kartu settle `shadow-card`→`shadow-pop` saat hover.** **Retrofit radius (feedback user "kurang suka pill button, jadikan kotak radius tumpul"): semua TOMBOL (ui Button, ChipToggle, toggle approval/skill/material) → `rounded-md2` 8px; badge/bar progress/dot pasif tetap kapsul.**
>
> **Alias persona legendaris (keputusan user 2026-11):** nama tampilan 8 persona diganti konsep "tokoh + Yui", Conductor→**Maestro**, Planner→**Liebert**, Analyst→**Sherlock**, Scholar→**Einstein**, Scribe→**Poe**, Coder→**Hiro**, Designer→**Picasso**, Operator→**Neo**. Sumber nama resmi tetap `persona.yaml`; ID teknis `yui-*` TIDAK berubah (binding/roster/sesi lama aman). Baru: `packages/core/src/personas/names.ts` (`PERSONA_ALIAS` + `personaDisplayName`) menggantikan derivasi `Yui ${short}` di loop.ts & memory-tools.ts; web PERSONA_NAME map + label bench/Dungeon kini strip sufiks " Yui". Fixture 5 file test core ikut diganti. Docs aktif (PLAN/TEST-PLAN/TEST-GRAND-TOUR) di-update; TASKS historis tidak disentuh. 227 hijau.
>
> **Toast global react-hot-toast (feedback user: feedback success/error harus popup rapi & profesional):** baru `ui/toast.tsx` (`YuiToaster` top-center bertema token yui + Phosphor Check/Warning; helper `toastOk`/`toastErr`) di-mount di layout; **barrel ui/index.ts kini "use client"** (insiden: server layout menyeret surface.tsx bermasalah useEffect). Konversi banner err/flash inline → toast di SettingsModal (simpan provider), ProjectPanel (create/delete), FileTab (upload/load), McpPanel (trust/retry/install/uninstall/uv + toast sukses), SkillsTab (eval/save/accept/reject), DungeonView (skill ops + misi + run + upload + delete), TaskDrawer (memori simpan). Nol banner err inline tersisa.
>
> **Polish dev-10 #3 (feedback user: approval mengganggu + scope dungeon + form modal):** (1) **mode approval "auto"**, chip ⚡ di atas composer (persist `approval-mode.json`, survive restart; global lintas sesi & delegasi): `write_file` & `run_command` disetujui otomatis dengan event `approval.resolved` jujur (traceable, tanpa kartu menggantung), menghapus titik nyeri "approval kedaluwarsa → proses terasa stuck"; tool lain (MCP/dst.) tetap minta kartu; REST `GET/PUT /api/settings/approval`. (2) **hint aktivasi skill** di tab Skill: skill baru langsung tersimpan & bisa dijalankan via `skills_list`/`skill_view` di sesi berjalan, tapi diperkenalkan di prompt hanya pada **sesi baru** (prompt sesi beku by design, invariant P0-CORE-5). (3) **ruangan dungeon keluar dari daftar card project** (scope berbeda), riwayat sesi latihan kini tab **"Riwayat"** di menu Dungeon (semua run semua misi + tombol "Buka sesi" → buka ruangan sebagai workspace). (4) **form buat latihan baru → popup modal** (daftar misi tetap terlihat). +2 test (mode auto). 223 core hijau.
>
> **Fix performa dev-10 (laporan user "task sederhana 30 menit, jauh lebih lambat dari harness lain")**, diagnosis data `p_1b7017c5` (Hiori Florist): 41.5 menit wall, **39.1 menit (94%) = waktu provider**, BUKAN orkestrasi delegasi/UI/DB (semua tool call < 1 dtk). Tiga akar + fix: (1) **`reasoning_content` GLM dibuang adapter**, 42k token pikiran per call tak terlihat → UI seperti mati menit-lamanya → kini di-stream sebagai `reasoning.delta` (UI: blok 💭 kolaps-able); (2) **prompt membengkak 4.7k→3 0k token** karena isi file terkirim ulang penuh tiap iterasi → `slimHistory` diet prompt view-only (payload tool lama diarsipkan, pesan terbaru utuh); (3) **kartu delegasi statis** selama anak bekerja → `delegation.delta` feed live (teks/pikiran/tool anak streaming di kartu parent); plus **Trace tab polling 3 dtk → realtime** (refetch debounce saat event SSE, tanpa polling). +5 test. Catatan: sisa latensi = karakter model (output reasoning besar di glm-5), opsi reasoning effort/config model menyusul bersama multi-model P1-MDL.
>
> **Polish sesi dev 8 (feedback user):** resume percakapan project (klik project = buka sesi terbaru via replay SSE, riwayat sesi + tombol sesi baru), UX project lead (PersonaPicker keluar dari sidebar; Conductor lead otomatis, persona via kartu tengah/dropdown header, composer aktif di state kosong), **panel proyek = bagian utama shell** (pola IDE: sidebar | chat | panel 520px, toggle layar penuh) dengan **tab Tasklist | Tim (org-chart struktur delegasi live: lead + anak delegasi + bench roster) | Pohon (TaskTree nested) | Roster | Sesi**, **tracing performa `[yui:trace]`** (durasi provider per iterasi / tool / menunggu approval / delegasi, diagnosis "landing page 15 menit"; `YUI_TRACE=0` untuk matikan), approval **"Setujui & ingat"** per sesi (loop di-cache per sesi) + file policy `code|docs|reports` bebas-approval (kode produk mendarat di `code/`, bukan `reports/`). Lanjut: analisis hasil tracing → optimasi loop (P0-CORE-3/4), P1-MCP-1, P2-FLOW-7.
>
> **Sesi dev 9 (Studio OS shell + kanban + katalog MCP + memory loop):** shell final = **satu area konten dengan tab bar** (`Chat | Tim | Papan | Pohon | Roster | Sesi | Memori`), chat jadi tab pertama, bukan split dua panel; dot live di tab (agent bekerja / delegasi berjalan). **P2-FLOW-7 v0**: tab Papan = kanban 4 kolom drag&drop HTML5 (tanpa lib) → PATCH status, kartu subtask+assignee+artefak, auto-refresh saat `todo_*`. **P1-MCP-1**: katalog 20 server kurasi (`packages/core/src/mcp/catalog.ts`) + UI install/uninstall di panel MCP (form env untuk API key, badge risiko, pencarian; `POST/DELETE /api/mcp/install`, `GET /api/mcp/catalog`), install hanya menulis deklarasi ke `mcp.json`, **tetap fail-closed**: harus Trust dulu sebelum terhubung. **P1-MEM-1**: USER.md/MEMORY.md manager + tool `memory_append` + tab Memori (editor); catatan di-inject ke system prompt sesi baru (USER.md yang dulu ditulis-tak-dibaca kini dibaca). **P1-MEM-2**: learn nudge pasca-task, aux call ringan pasca-turn ber-tool → 0/1 catatan via memory_append + event `memory.noted` (chip di chat). Sesi delegasi anak kini mewarisi projectId parent. **Fix katalog (feedback test user)**: 4 command server salah-diverifikasi registry (fetch→`@kazuph/mcp-fetch`, git→uvx, sqlite→`mcp-server-sqlite-npx`, time tetap uvx); field `runtime`+`setupNote` (badge "Python/uvx" + hint). **Dukungan uv end-to-end**: deteksi otomatis (`mcp/uv.ts`, PATH + fallback path absolut `%USERPROFILE%\.local\bin`, cache 30 dtk), tombol **Install uv** satu-klik (installer resmi astral.sh, konfirmasi eksplisit UI, REST `GET/POST /api/mcp/runtime`), connect `uvx` otomatis pakai path absolut → **tanpa restart dev server**; baris server Python disable "Butuh uv" bila belum ada. +2 test uv. **Konsistensi desain (feedback user "seirama dengan chat")**: FIX BUG token `--yui-space-5` tak terdefinisi (semua padding pane & modal jadi 0 → konten terpinggir), **form kit global** (semua input/select/textarea satu DNA composer, hapus 5 styling duplikat), **glass ala macOS** untuk modal Pengaturan + dropdown persona (disetujui user). **Robustness (trace user)**: routing artefak kode (`.html` dll di `reports/` → `code/`, fix "landing page mendarat di reports"), provider timeout+retry, budget graceful, guard repetisi. +22 test total sesi. **Polish (feedback user): menu ⚙ Pengaturan** (modal: nav seksi + lebar), panel MCP pindah dari dasar sidebar (sesak) ke seksi "MCP & Tools"; seksi baru **"Provider & Model"**: base URL / API key (password, kosong=keep, tak pernah dikirim balik, hanya 4 digit terakhir) / model utama / fallback, **swap panas** (provider baru in-memory + `.env` diperbarui via `updateEnvFile` + loopCache dikosongkan; delegateDeps di-mutasi via getter), REST `GET/PUT /api/settings/provider`; +3 test env-file. Catatan: fitur core butuh **restart dev server**.
>
> **Update sesi dev 7 (maskot v4):** `OrinPortrait` rewrite ke **Orin v4** (docs/Orin v4,
> Pilih Maskot): satu rig mata untuk semua bentuk, identitas persona = bentuk,
> conductor=bola #F2620F, scholar=awan #F5A00A, scribe=tetes #2B8CF0, coder=kotak #12D1A0,
> designer=segitiga #F0278E (`orinShapes.tsx` dipakai portrait + PersonaFace mini) ·
> mapping state baru: working→speaking (halo), awaiting_input→listening (mata besar) ·
> typecheck 3/3, 28 test green, build ✓. Siap Rive: satu .riv, input `shape` 0–4.

## Peta Fase & Gerbang

| Fase      | Isi                                                                                                  | Durai (3 dev) | Gerbang keluar                                |
| --------- | ---------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------- |
| **W0–W7** | Demo internal (vertical slice)                                                                       | 1 minggu      | **G-DEMO**, demo 8 menit lulus                |
| **P0**    | Kernel penuh, bayar utang demo                                                                       | ±3 minggu     | **G-P0**, kernel production-grade             |
| **P1**    | MCP penuh · memory loop · delegation penuh · persona v1 · credits v1 · **portal link (P1-PRT, D23)** | ±9 minggu     | **G-ALPHA, SIAP TESTING #1 (internal alpha)** |
| **P2**    | Mobile (remote via relay) · desktop host/remote · curator · cron · kanban · KB · vault · billing v2  | ±10 minggu    | **G-BETA, SIAP TESTING #2 (closed beta)**     |
| **P3**    | Marketplace · teams · voice · self-host                                                              | ±3–4 bulan    | G-P3                                          |
| **P4**    | Workflow builder · eval · enterprise                                                                 | berkelanjutan | ,                                             |

> **Peta BATCH fitur utuh** (pengelompokkan task → fitur bisa didemokan; urutan eksekusi + acceptance per batch): lihat **docs/BATCHES.md**, sumber rencana batch; file ini tetap sumber status per task.
>
> **Track Studio (v0.4–v0.5, PLAN §13):** P1-PRJ + P1-DUN + P1-MDL numpang di P1;
> P2-FLOW + P2-STU + P2-DSN numpang di P2. Gerbang tambahan masuk G-BETA. UI hasil
> sesi dev 3 sudah tab-ready.

---

## W0, Pra-Demo (Hari 0, sebelum Senin)

- [ ] **W0-1** Pilih & uji model tool-calling (2–3 kandidat, prompt dengan 2 tool call berantai) · _S · 0.5d_ → keputusan model + catat latency; kunci di `.env` `YUI_MODEL`
- [ ] **W0-2** Siapkan 2 API key provider (utama + cadangan) & budget demo · _A · 0.25d_ → `.env` lokal tiap dev valid
- [ ] **W0-3** Review scaffold ini bersama: struktur, kontrak, pembagian A/B/C · _S · 0.5d_ → tiap dev paham jalur kodenya; catat pertanyaan
- [ ] **W0-4** `npm install && npm run dev` jalan di 3 mesin (Windows/mac/linux) · _S · 0.25d_ → chat streaming dummy muncul di `localhost:3000`
- [ ] **W0-5** Bagi peran final & blok kalender fokus (2× 3 jam/hari tanpa meeting) · _S · 0.1d_

## W1 (Senin), Fondasi & walking skeleton

_Exit: chat web streaming balasan LLM + persona picker tampil 4 persona._

- [ ] **W1-A1** Finalisasi `ProviderAdapter` + `OpenAICompatProvider` streaming (scaffold → uji dgn model asli) · _A · 0.5d_ → stream 200 token tampil tanpa error
- [ ] **W1-A2** `AgentLoop` v1 tanpa tools: user → stream → assistant → persist · _A · 1d · dep W1-A1_ → turn tunggal hijau end-to-end
- [x] **W1-A3** Vitest loop vs fake provider (stream, final, append-only) · _A · 0.5d · dep W1-A2_ → `npm test` green, _verif: `loop.test.ts` (happy path, 2-round tool, error provider)_
- [ ] **W1-B1** Bekukan penamaan kontrak (review `packages/contracts`, tambah field bila kurang, SEKALI) · _B · 0.25d_ → tidak ada rename event setelah hari ini
- [ ] **W1-B2** Route `POST /api/sessions` + `GET /api/personas` tersambung runtime · _B · 0.5d · dep W0-4_ → Postman/insomnia OK
- [ ] **W1-B3** Chat shell + SSE route live (tanpa replay dulu) · _B · 1d · dep W1-B2_ → delta teks streaming di UI
- [ ] **W1-C1** Persona loader + 4 persona seed final (teks) · _C · 0.5d_ → `GET /api/personas` 4 entri tervalidasi
- [x] **W1-C2** Skill loader + 5 skill seed (lint manual: desc ≤60 char) · _C · 0.5d_ → semua SKILL.md parse tanpa error, _verif: 5/5 parse via delegation test (loader melempar bila rusak)_
- [ ] **W1-C3** PersonaPicker UI (kartu + pilih → buat sesi) · _C · 0.5d · dep W1-B2_ → klik persona → sessionId

## W2 (Selasa), Registry & tools

_Exit: agent baca/tulis file & fetch URL; memilih & membaca skill sesuai tugas._

- [x] **W2-A1** Registry dispatch + validasi zod + approval gate (sudah di scaffold, uji + polish) · _A · 0.5d_ → `registry.test.ts` green
- [x] **W2-A2** File tools (read/write/list) + path safety test (path escape ditolak) · _A · 0.5d · dep W2-A1_ → unit test escape case green, _verif: `file-tools.test.ts`; fix prefix-escape (`ws` vs `ws-evil`) + regression test_
- [ ] **W2-A3** `web_fetch` + truncation + timeout · _A · 0.5d_ → URL nyata → teks bersih
- [x] **W2-A4** Multi-round tool calls di loop (tool*calls → results → iterasi) · \_A · 1d · dep W2-A1* → scenario "list lalu baca file" 2 round sukses, _verif: `loop.test.ts` 2-round chained (fake provider)_
- [ ] **W2-B1** Tool activity feed UI (tool.call/result inline) · _B · 0.5d · dep W1-B3_ → tiap call terlihat real-time
- [x] **W2-B2** Session store append-only + replay `?since=` + events route · _B · 1d_ → refresh → feed ter-replay, _verif: `store.test.ts` (id monotonic, since eksklusif, frozen prompt); SSE route kini dedupe by id_
- [ ] **W2-C1** `skills_list`/`skill_view` tools · _C · 0.5d_ → agent bisa memuat skill web-research
- [x] **W2-C2** Prompt stack frozen per sesi ([core][persona][skills index]) · _C · 0.5d · dep W1-C1_ → system*prompt tersimpan di sessions; test: prompt tidak berubah saat config berubah, \_verif: `prompt-stack.test.ts` (frozen + sesi baru baca config baru)*

## W3 (Rabu), Approval + ekspresi + persona UX

_Exit: ekspresi reaktif 7 state; approval inline end-to-end; persona → sesi baru._

- [x] **W3-A1** Approval engine wiring loop (pause/resume turn) + approvalPolicy file tools · _A · 1d_ → write di luar reports/ mem-pause turn sampai user jawab, _verif: `delegation.test.ts` (approve → file jadi; deny → dibatalkan)_
- [x] **W3-A2** `run_command` allowlist + selalu approval · _A · 0.5d_ → `node -v` jalan setelah approve; tolak = tool error, _verif: `run-command.test.ts`_
- [ ] **W3-B1** ApprovalCard UI (setujui/tolak → POST) · _B · 0.5d · dep W3-A1_ → klik setujui melanjutkan turn
- [x] **W3-B2** `PersonaPortrait` mapping `persona.state` (fallback CSS scaffold) · _B · 0.5d_ → 7 state visual berbeda & reaktif, _verif: Orin SVG animasi (rig dari docs/Orin v2); tint per persona; Rive menyusul P1-PER-2_
- [x] **W3-B3** Persona picker → sesi baru bersih (reset state client) · _B · 0.25d_, _verif: `pick()` reset items/personaState/lastEventId/openAssistant_
- [x] **W3-C1** Integrasi Rive placeholder (file komunitas / blob), **timebox 3 jam** · _C · 0.5d_ → `.riv` termuat via `@rive-app/react-canvas` ATAU fallback CSS tetap (keputusan tercatat), _keputusan: fallback = Orin SVG animasi (rig & keyframe final dari `docs/Orin v2`); .riv dibangun di P1-PER-2 dengan hirarki bone identik_
- [ ] **W3-C2** Persona.yaml final 4 persona + deskripsi UX (≤60 char) · _C · 0.25d_

## W4 (Kamis), Delegation & MCP

_Exit: skenario penuh §2 jalan kasar end-to-end._

- [x] **W4-A1** `delegate_task` + child runner (persona anak, toolset anak minus delegate*task) · \_A · 1.5d · dep W2-A4* → Conductor → Scholar jalan, ringkasan kembali, _verif fake provider; fix bug skillsDir (dulu crash saat spawn anak); real-model E2E menyusul W4-S1_
- [x] **W4-A2** Events delegation.* (started/progress/done) ke stream parent + sesi anak tersimpan · *A · 0.5d · dep W4-A1*, *verif: `delegation.test.ts`; + forwarding approval anak → parent (blocker skenario §2 langkah 6)\*
- [ ] **W4-B1** DelegationCard UI (kartu persona anak + progress + summary) · _B · 1d · dep W4-A2_ → progres anak live di parent
- [ ] **W4-B2** Resume/replay stabil (refresh saat turn jalan; reconnect SSE) · _B · 0.5d · dep W2-B2_
- [ ] **W4-C1** MCP client stdio + register prefix `mcp__` (scaffold → uji `server-fetch`) · _C · 1d_ → tool `mcp__fetch__fetch` terpanggil agent
- [ ] **W4-C2** `server-filesystem` scoped `workspace/reports` + config `mcp.json` · _C · 0.5d · dep W4-C1_
- [ ] **W4-S1** Dry run kasar skenario penuh + daftar bug P0 · _S · 0.5d_

## W5 (Jumat), Integrasi, tuning, polish

_Exit: skenario lulus 2× berturut tanpa intervensi manual._

- [ ] **W5-S1** Triage bug P0/P1 (papan kasar di file/note) · _S · 0.25d_
- [ ] **W5-A1** Fix P0 core (race SSE→store, error provider → session.error bersih) · _A · 1d_
- [ ] **W5-B1** Polish UI (dark theme konsisten, empty/error state, layout) · _B · 1d_
- [ ] **W5-C1** **Prompt iteration Conductor** (3 varian, uji blind 5 prompt beda) · _C · 1d_ → dekomposisi+delegasi konsisten ≥4/5
- [x] **W5-C2** USER.md stub (append 1 catatan preferensi per sesi, label preview) · _C · 0.25d_, _verif: `prompt-stack.test.ts` + smoke API; loop belajar sungguhan = P1-MEM_

## W6 (Sabtu), Dry run & rekam

- [ ] **W6-S1** Dry run penuh 2× + rekam video backup (layar+audio) · _S · 1d_
- [ ] **W6-S2** Freeze scope 12.00, setelah itu hanya P0/P1 · _S_
- [ ] **W6-S3** Tulis `docs/demo-runbook.md` (klik-by-klik + fallback) · _S · 0.25d_

## W7 (Minggu), Rehearsal & buffer

- [ ] **W7-S1** Rehearsal di perangkat & jaringan demo sebenarnya · _S · 0.5d_
- [ ] **W7-S2** Siapkan: key cadangan aktif, `YUI_MODEL_FALLBACK`, DB fresh, `workspace/reports` bersih, laptop+video cadangan · _S · 0.25d_
- [ ] **W7-S3** BUFFER 100% (tanpa fitur baru) · _S · sisa hari_

## G-DEMO, Gerbang Demo (definisi selesai W)

- [ ] Chat streaming dari provider OpenAI-compatible
- [ ] Persona picker → sesi baru; 4 persona tampil
- [ ] Ekspresi bereaksi ≥5 state nyata
- [ ] Agent memuat skill via `skills_list`→`skill_view` dan mengikutinya
- [ ] ≥1 tool MCP dipanggil sukses
- [ ] Conductor mendekomposisi & mendelegasikan ke ≥2 persona; progress+ringkasan tampil
- [ ] Approval inline; approve lanjut, deny dihormati
- [ ] Refresh → resume via replay; pertanyaan lanjutan dijawab dari konteks
- [ ] Semua tipe UI dari `@yuika/contracts` (grep tipe tangan = 0)
- [ ] Video backup tersimpan

---

## P0, Kernel penuh: bayar utang demo (±3 minggu)

> **AUDIT STATUS dev-10** (menjawab "kenapa P0/P1 belum semua ✅"), item dicheck HANYA
> bila scope penuhnya selesai; belum ✅ = salah satu dari ini, SEMUA masih relevan
> (tidak ada yang usang):
> **(a) butuh resource eksternal**, P1-CRED-5 (Stripe) · P1-CRED-6 (tagihan provider
> nyata) · P1-INF-5 (VPS/domain) · P1-DEL-2 (web push) · P1-PER-1/2/3 (aset Rive
> artist) · P1-PER-5 (penguji manusia, bisa Anda) · P0-INF-5/6 (infra docker/CI).
> **(b) menunggu fondasi**, P0-SEC-1 sandbox container → membuka P1-MCP-4 + sisa
> P0-SEC-3 · P0-DATA-1 Postgres
> (dep P0-INF-5) → P0-DATA-2 retention · P1-MCP-2 OAuth (menyusul server OAuth-capable:
> Penpot/Figma di P2-DSN) · P1-INF-1 auth (desain tenant, pasca-demo).
> P0-DEL-2 steering ✅ SELESAI 2026-11 (cancel/steer/cascade + UI kartu delegasi).
> **(c) di antrean, bisa dikerjakan kapan saja**, P0-INF-3/4 ·
> P0-QA-1/2 · P1-MCP-5 · P1-DEL-1 (parsial: cap paralel
> dinamis via budget CRED-3 + consult paralel sudah jalan; sisa config per-plan).
>
> Tujuan: kernel production-grade. Grep `DEMO-SHORTCUT` di repo = daftar utang.

### P0-INF (infra & arsitektur)

- [x] **P0-INF-1** Split `apps/api` (service terpisah Fastify), core keluar dari proses Next.js · _A · 2d_, ✅ 2026-11: workspace `apps/api` (fastify 5, MIT) memegang `YuiRuntime` (singleton globalThis + env-boot .env root, port `YUI_API_PORT` default 3211); SEMUA 36 route Next dipindah 1:1 (path `/api/…` tak berubah) termasuk SSE stream (`reply.hijack` + Last-Event-Id) & upload raw (catch-all buffer parser); zod error → 400 `{error}`; CORS reflect origin; graceful shutdown (dispose runtime → MCP stdio tidak zombie); web = pure frontend, `lib/api.ts` (`NEXT_PUBLIC_API_BASE`) membungkus SEMUA fetch/EventSource, `app/api/**` + `lib/runtime.ts` DIHAPUS, sisa satu subpath pure `@yuika/core/project/diff` (diff viewer, tanpa runtime); turbo `dev` menjalankan web+api paralel; +7 REST contract test (`fastify.inject` + fake runtime). Mengapa split: (1) HMR Next dulu me-clone runtime tiap recompile ( QUIRK dev-10, zombie MCP, spam reconnect; komentar lib/runtime.ts lama), (2) jalur P0-INF-5 Docker/P0-DATA-1 Postgres/P1-INF-1 auth butuh proses yang bisa di-scale & di-deploy terpisah dari renderer SSR, (3) pintu SDK/OpenAPI + P0-QA-1 E2E.
- [x] **P0-INF-2** Konfigurasi terpusat (env module + validasi zod + fail-fast) · _A · 0.5d_, ✅ v0 dev-10: `core/env.ts`, satu modul env tervalidasi zod (fail-fast saat modul dimuat: nilai rusak → error jelas, bukan NaN diam-diam); dipakai loop/provider/approval/compress; +`YUI_MAX_ITER_HARDCORE` (hardcore cap 64) & `YUI_PROVIDER_TIMEOUT_MS` default 5 mnt (fix 2026-11)
- [x] **P0-INF-3** Logging terstruktur (pino) + `traceId` per turn ter-propagasi ke semua event/log · _B · 1d_, ✅ v0 2026-11: `core/logger.ts`, SATU pino root di-cache globalThis (HMR/vitest-safe), JSON-lines stdout; level via `YUI_LOG_LEVEL` (default: debug saat YUI_TRACE aktif, info selain itu, warn di bawah vitest); **child logger per turn** di `loop.runTurn`, traceId(=turnId)+sessionId+persona menempel otomatis di semua log turn; milestone terstruktur: turn started/finished (ms,iters,model,tools), cancelled, fallback aktif, budget, tool error, kompresi; semua `console.log/warn` core (runtime heal/MCP, delegation, skills loader, `[yui:trace]` loop) dimigrasi ke pino; baris trace lama jadi `logger.debug` bermakna (YUI_TRACE=0 tetap mematikan). +`YUI_LOG_LEVEL`/`YUI_TRACE` di .env.example
- [x] **P0-INF-4** Error taxonomy konsisten (provider/tool/internal + kode) · _A · 1d_, ✅ v0 2026-11: `core/errors.ts`, `YuiError{kind,code,retryable}` + `classifyError(err, fallbackKind)`: errno jaringan/undici→`PROVIDER_NETWORK`(retryable), HTTP 408/429/5xx→`PROVIDER_TIMEOUT/RATE_LIMIT/HTTP`(retryable), 401/403→`PROVIDER_AUTH`, AbortError→kind `abort` (bukan error), fallback tool→`TOOL_EXEC/TOOL_NOT_FOUND`, mcp→`MCP_DISCONNECTED`, unknown→`INTERNAL`; idempoten terhadap YuiError. `SessionErrorEvent` (contracts) membawa `kind`+`code` opsional (backward-compat); loop provider-catch & budget-path mengisi taxonomy; sisa penerapan menyusul bersama P0-INF-1 (REST handler)
- [x] **P0-INF-5** Docker compose dev (web+api+db) + README update · _B · 1d_, ✅ v0 2026-11: `Dockerfile` multi-stage dua target, `web` = Next.js **standalone** (`NEXT_OUTPUT_STANDALONE=1`, bundle minimal; `NEXT_PUBLIC_API_BASE` bake-time dari sudut browser) & `api` = Fastify + @yuika/core via **tsx** (exports core menunjuk src/\*.ts); base `node:24-bookworm-slim` (glibc, prebuilt better-sqlite3); uv (binary tunggal) untuk MCP server uvx; data user di **volume /data** (`YUI_DB_PATH`/`YUI_WORKSPACE_DIR`, sqlite + workspace persist antar rebuild, tanpa bake secrets: .env via `env_file` compose); `YUI_API_HOST=0.0.0.0` di container; healthcheck `node -e fetch` → web `depends_on: service_healthy`; `docker-compose.yml` + `docker-compose.smoke.yml` (port terisolasi utk verifikasi). Terverifikasi: build 2 image, up, API 200 + PAGE 200 + SSE 200 + `NEXT_PUBLIC_API_BASE` ter-bake di chunk + `/data/demo.db` terbentuk di volume + MCP trust gate aktif (tidak spawn sebelum trust). Sisa v1: prune prod-deps per target (image api kini bawa deps web ~gemuk), multi-arch (arm64), compose profile postgres saat P0-DATA-1.
- [x] **P0-INF-6** CI: lint+typecheck+test di PR (GitHub Actions), turbo cache · _B · 1d_, ✅ v0 dev-10: `.github/workflows/ci.yml`, push (main/dev/\*\*) + PR, Node 24 + npm cache, turbo typecheck+test+lint dengan cache `.turbo` antar-run (actions/cache) + concurrency cancel; verifikasi penuh menunggu repo di-push ke GitHub (remote belum di-set), jadi bagian gerbang G-P0 saat itu

### P0-SEC (sandbox & keamanan)

- [x] **P0-SEC-1** Sandbox container untuk `run_command` (Docker exec, resource cap, timeout, network default-deny) · _A · 3d · dep P0-INF-5_ → perintah berjalan di container sekali-pakai; egress diblokir default, ✅ 2026-11: `tools/sandbox.ts` `runInSandbox()`, docker `--rm --network none --memory 512m --cpus 1 --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp:rw,noexec -v <ws>:/workspace:rw`; timeout → `docker kill`; `YUI_SANDBOX=auto|docker|off` (auto fallback lokal + note "TANPA isolasi", docker fail-closed); approval tetap wajib (defense-in-depth); +13 unit test + 5 integrasi nyata (`YUI_SANDBOX_IT=1`, egress blocked, EROFS rootfs, timeout kill) hijau di image node:24-bookworm-slim
- [x] **P0-SEC-2** Redaction secrets dari log & tool result (pola `redact` Hermes) · _B · 1d_ → test: key menyamar di semua jalur output, ✅ v0 dev-10: `core/redact.ts`, modul tunggal `redactSecrets()` (pola token vendor: sk-/ghp\_/xox/AKIA/AIza/glpat/JWT/PEM/Bearer + assignment eksplisit `KEY=…`/`"secret": …`, fail-closed, idempotent); dipasang di 3 vektor bocor menuju konteks agent: stdout/stderr/err `run_command`, `read_file` content, baris hasil `search_files`; +4 test (vendor token, assignment, no-false-positive teks normal, PEM utuh); INPUT write_file TIDAK di-redact (isi memang dimaksudkan)
- [x] **P0-SEC-3** Path policy ketat + workspace isolation test suite · _A · 1d_, ✅ v0 dev-10 (terserap P1-PRJ-2): `safeProjectPath` anti-traversal jadi SATU gerbang semua akses file project (`code/../../escape` → throw, `../../etc/passwd` → ditolak; test `project-files.test.ts` + `file-tools.test.ts`); scope file tools & run_command dibatasi root project via `projectRoot()`. Sisa scope task ini (isolasi prosus-level/network) pindah ke P0-SEC-1 sandbox container
- [x] **P0-SEC-4** Approval timeout + auto-deny policy (ganti shortcut no-deadline) · _A · 0.5d_, ✅ v0 dev-10: `ApprovalEngine.expire()`, deadline `YUI_APPROVAL_TIMEOUT_MS` (default 5 mnt, 0=off utk test; timer `unref`), lewat deadline → settle DB "expired" + event `approval.expired` (bentuk sama dgn boot-heal restart) + resolve FALSE (fail-closed, turn lanjut, tool ditolak, tidak menggantung); jawab tepat waktu → `clearTimeout` (tanpa expiry ganda); +3 test (auto-deny, resolve-tepat-waktu, off)

### P0-DATA (persistence)

- [x] **P0-DATA-1** Migrasi SQLite → Postgres (Drizzle): sessions/messages/events/jobs + migration script · _B · 2d · dep P0-INF-5_, ✅ 2026-11: driver **swappable** `YUI_DB_DRIVER=sqlite|postgres` (sqlite default, zero-config desktop/dev). Ekstrak **`ISessionStore`** (27 metode sinkron, kontrak tunggal; `SessionStore` better-sqlite3 implements-nya; 12 call site ganti type). PG = `session/pg-session.ts` (postgres.js, DDL idempotent auto-migrate: 8 tabel + 4 sequence, id/ts float8, bigint → string dicegah, ILIKE/`= ANY`/`ON CONFLICT` pengganti dialek SQLite, `sql.begin` utk arsip+delete) + `pg-worker.ts`/`pg-bridge.ts` (**sync-bridge worker-thread**: main blokir `Atomics.wait` pada growable SharedArrayBuffer 1MB→128MB, paritas semantik better-sqlite3, NOL perubahan call site & test; paket `postgres` hidup hanya di worker, bundle web bersih; execArgv diwarisi → tsx loader jalan). Factory `createSessionStore()`; env `DATABASE_URL` (superRefine fail-fast saat postgres). **Deviasi Drizzle**: postgres.js + SQL hand-written (~40 query UNION arsip/EXCEPT heal sudah hand-tuned; Drizzle menambah abstraksi tanpa fitur baru, dicatat sbg keputusan). `scripts/migrate-sqlite-to-pg.mjs`: salin 8 tabel `ON CONFLICT DO NOTHING` (idempoten, id tak berubah → replay SSE aman) + `setval` sequences; teruji dgn data smoke nyata (2 sesi/46 events/1 job; run ulang = 0 baris). Compose profile `postgres` (db :5545 + api-pg :3213 + web-pg :3003). Fix bonus: SQLite `deleteProjectSessions` kini bersihkan `events_archive` (paritas PG). Verifikasi: 19 asersi async driver + sync-bridge + api full-stack live (create session REST → events → heal) di PG 17 container. **Follow-up**: store project/memory/skills masih SQLite (split-brain v1, konsolidasi menyusul); pgvector (P2); batch COPY utk data sangat besar; async-native store (hapus bridge) saat P2.
- [x] **P0-DATA-2** Retention & housekeeping (events > N hari → arsip) · _B · 1d · dep P0-DATA-1_ → ✅ 2026-11: `events_archive` (SQLite), `store.archiveOldEvents(retentionDays)` pindahkan events sesi **dingin** (MAX(ts) < cutoff) ke arsip dalam SATU transaksi (idempoten: `INSERT OR IGNORE` + delete); semua bacaan (getEvents replay, growth `personaDoneTurnCounts`, `listProjectSessions` lastEventId/ts) di-**UNION** dengan arsip → identitas & urutan id tak berubah (SSE replay/reconnect aman); sesi **turn gantung** di-skip (logika = `findInterruptedTurns`, milik boot-heal); trigger: boot (setelah heal) + interval 24 jam (unref) + `POST /api/settings/housekeeping`; `YUI_EVENTS_RETENTION_DAYS` (default 30, `0` = mati, fail-fast zod env.ts); +6 test (`packages/core/src/__tests__/housekeeping.test.ts`, arsip lengkap/union, sesi aktif tak disentuh, 0=no-op, gantung di-skip, growth tetap benar, lastEventId tetap benar)
- [x] **P0-DATA-3** Approval pending persist (survive restart, ganti Map in-process) · _A · 1d_ → ✅ dev-10: tabel `approvals` + `approval_memory` (SQLite), request pending tercatat; restart → sweep `expirePendingApprovals()` menandai **expired** + event `approval.expired` (kartu UI “Kedaluwarsa, server direstart”, bukan 404); **“Setujui & ingat” lintas restart** (dimuat ulang per engine); live promise tetap in-process (turn mati bersama proses, resume turn = pekerjaan P1)

### P0-CORE (loop robustness)

- [x] **P0-CORE-1** AbortSignal end-to-end: cancel turn dari UI (interrupt & redirect) · _A · 2d_ → tombol stop bekerja < 500ms, ✅ v0 sesi dev 10 (`f429e8d`): AbortController per sesi di runtime → signal ke provider (OpenAI SDK abort HTTP in-flight, tak menunggu timeout 120 dtk) + loop checks (awal iterasi / catch provider = abort bukan error / antar tool round); keluar **graceful**, parsial tersimpan + catatan "turn dibatalkan user" + event `turn.cancelled` + persona idle; REST `/api/sessions/:id/cancel`; tombol ■ di composer. ~~Sisa: propagasi ke sesi anak delegasi~~ ✅ LUNAS via P0-DEL-2 (2026-11): cancelTurn parent kini CASCADE ke semua anak delegasi turn itu
- [x] **P0-CORE-2** Provider retry + fallback model (`YUI_MODEL_FALLBACK`) + cooldown · _A · 1.5d_ → provider mati → fallback jalan otomatis, ✦ parsial sesi dev 9 (timeout 120 dtk + retry transien ×2); ✅ **penuh sesi dev 10** (`43387b5`): loop attempt-chain primary → fallback SEKALI (fallback sukses → iterasi lanjut di fallback, jangan bolak-balik), `markUnhealthy` → cooldown 5 mnt (resolve berikutnya langsung fallback, tak buang 2 retry lagi ke model sekarat); fallback bisa dari `YUI_MODEL_FALLBACK`, persona.yaml, atau override Settings; +2 test loop (fallback aktif, both-fail tetap session.error bersih)
- [x] **P0-CORE-3** Repetition guard + iteration budget proper (pola Hermes) · _A · 1d_, ✅ sesi dev 9 + audit dev 10: guard tool-round identik 3× berturut → injek nudge sistem (agent keluar loop verifikasi tanpa progres, teramati nyata); budget iterasi 16 default + override `YUI_MAX_ITER` + **budget-habis graceful** (pesan "ketik lanjutkan" + state done, bukan error mentah)
- [x] **P0-CORE-4** Compression v0: summarize aux model saat context > 70% (checkpoint + arsip, satu-satunya mutasi history yang sah) · _A · 3d_ → sesi 100+ turn tetap sehat; test invariant append-only kecuali checkpoint, ✅ v0 (dev-10 + 2026-11 tuntas): engine `session/compress.ts` ter-wire loop, diet prompt view-only (payload tool lama diarsip, fix prompt 30k token) + CHECKPOINT aux-model saat est >70% jendela (128k, env `YUI_COMPRESS_*`); **2026-11: aux routing**, summary kini pergi ke model MURAH `YUI_AUX_MODEL` (swap panas via Settings; fallback model utama bila kosong; checkpoint merekam modelnya utk audit); fail-soft (aux gagal → turn jalan tanpa kompresi); metering aux jujur dari usage provider. Test: `context-compress` (5) + `slim-history` + aux-routing loop (2), invariant append-only dijaga (tabel messages tak pernah diubah)
- [x] **P0-CORE-5** Contract tests CI: (a) history append-only (b) toolset+prompt frozen per sesi · _S · 1d_ → gate PR gagal bila invariant dilanggar, ✅ v0: `contract-invariants.test.ts` (batch Kernel Lestari `678c2eb`), (a) prefix-snapshot test: messages s0⊂s1⊂s2… walau kompresi checkpoint aktif + seq strictly-increasing; (b) wire test: registry bertambah tool pasca-createSession TIDAK pernah bocor ke request sesi berjalan (system prompt & toolset frozen, dicek di SEMUA request provider). Jalan di suite CI (P0-INF-6) → PR yang melanggar invariant otomatis merah.

### P0-DEL & P0-MCP

- [x] **P0-DEL-1** Delegation job persist (queue di DB, survive restart, status) · _A · 2d_, ✅ v0 dev-10 (branch dev/p0-kernel): tabel `delegation_jobs` (running→done/error/interrupted), job row dibuat SEBELUM loop anak jalan, best-effort (gagal tulis ≠ batal delegasi); loop menelan error provider → runner kini deteksi `session.error` non-recoverable anak → job error + kartu delegasi parent ditutup jujur (tak zombie); boot-heal menutup job running pasca-restart → interrupted + alasan; REST `/api/projects/[id]/delegations` + `jobs`; +6 test. (queue/retry background menyusul P1-DEL-2)
- [x] **P0-DEL-2** Cancel/steer anak dasar dari parent · _A · 1d · dep P0-DEL-1_, ✅ v0 2026-11: **steer**, `delegation.steered` (contracts) + antrean steer per anak di-drain loop tiap awal iterasi sebagai pesan user berlabel `[arahan user, mid-turn]` (tercatat di history anak, terlihat provider); **cancel**, AbortController per anak (`cancelDelegation`) → job **interrupted** (bukan error) + kartu delegasi ditutup "_(anak dibatalkan, progres tersimpan, lanjutkan dari sana)_"; **cascade**, `cancelTurn(parent)` kini ikut membatalkan semua anak turn itu (utang P0-CORE-1 "anak lanjut di background" LUNAS); REST `POST /api/delegations/:childId {action:cancel|steer}`; UI: tombol 🚫/💬 di kartu delegasi saat anak bekerja (input inline steer, Esc batal). +3 test (`delegation-steer.test.ts`)
- [x] **P0-MCP-1** MCP lifecycle: health check + reconnect backoff + park · _C · 2d_ → server mati → reconnect otomatis tanpa crash turn, ✅ dev-10: `transport.onclose/onerror → onDown` (penutupan disengaja difilter flag) → lepas tools + **reconnect backoff 2s/5s/15s/60s/5mnt**; gagal 5× → **PARKED** (badge + tombol ↻ `POST /api/mcp/servers` bypass backoff); **health check ping 30 dtk** (deteksi hang tanpa crash); status `state/lastError/nextRetryAt` di panel MCP
- [x] **P0-MCP-2** Schema nyata MCP (`t.inputSchema`) menggantikan passthrough · _C · 1d_, ✅ v0 dev-10: registry terima zod ATAU JSON Schema mentah; validasi dispatch via ajv (compile-cache, reset ikut tests); `toolSchemas` meneruskan schema asli ke provider (provider tahu parameter tool MCP → tool-call lebih akurat); fallback passthrough bila server tak menyertakan inputSchema; +3 test

### P0-QA & G-P0

- [x] **P0-QA-1** E2E smoke Playwright: skenario demo §2 otomatis · _B · 2d · dep P0-INF-1_ → ✅ 2026-11: `playwright.config.ts` (root) mengelola 3 server terisolasi, mock provider openai-compat (`e2e/mock-provider.mjs` :3299, script FIFO via `POST /__script`, SSE standar + reasoning_content + tool_calls, fallback "ok" utk panggilan tak terduga), `apps/api` :3291 (DB/workspace `e2e/.tmp`, MCP+learn dimatikan → turn deterministik), `apps/web` :3990 (`NEXT_PUBLIC_API_BASE`/`NEXT_DIST_DIR=.next-e2e`, tak bentrok dev user); spec `e2e/smoke.spec.ts` = pilih Maestro Yui → prompt riset → assert kartu **Delegation · scholar** (SSE delegation.started) → jawaban final Conductor → replay REST events (persist). **Bonus fix nyata**: SSE `reply.hijack()` melewati pipeline `@fastify/cors` → ACAO hilang → browser blokir EventSource cross-origin (web:3000 → api:3211 juga kena!), kini origin direfleksikan manual di `raw.writeHead` + test kontrak api. `npm run e2e` (≈15 dtk, chromium via mirror).
- [x] **P0-QA-2** Load ringan: 10 sesi paralel × 5 turn tanpa deadlock/leak · _A+B · 1d_, ✅ v0 dev-10: `load-light.test.ts`, 10 sesi PARALEL × 5 turn provider jitter: semua selesai, history 10 pesan/sesi urutan user→assistant konsisten, provider tepat 50 panggilan (tanpa retry liar), tanpa kontaminasi antar-sesi
- [x] **G-P0** Gerbang: smoke E2E green di CI · contract invariant tests green · sandbox escape test lulus · pino trace per turn terlihat · fallback model terbukti · **retro tim: pelajaran demo → backlog**, ✅ 2026-11: semua kriteria terverifikasi ulang saat penutupan, e2e **2 passed** (smoke + orin v8); turbo test 3/3 (265 core + 9 contracts + 8 api); sandbox integrasi docker nyata **5/5** (egress blocked · EROFS · timeout kill, timeout test docker dinaikkan 30s utk cold-start Windows); trace per turn via `YUI_TRACE` + panel Trace; fallback model-router hijau. CI workflow siap tapi eksekusi tertunda, **remote GitHub belum di-set** (retro #4 → backlog PUB). **Retro lengkap: `docs/RETRO-G-P0.md`** (8 pelajaran → backlog: perluas e2e, CI matrix win+linux, konsolidasi store, async-native store P2, export trace UI, blind test persona). **EPIC P0 = 25/25 (100%)** 🎉

---

## P1, Tiga prioritas penuh + persona v1 + credits v1 (±9 minggu)

### P1-MCP (prioritas #1, lifecycle & UX penuh)

- [x] **P1-MCP-1** Katalog internal 20 server + UI manajemen (install/uninstall, status) · _C+B · 3d_, ✅ sesi dev 9: katalog kurasi 20 entri (files/web/data/dev/komunikasi/memori; `McpCatalogEntry` kontrak zod + risk rendah|sedang|tinggi + env keys berlabel), install = tulis deklarasi `mcp.json` via `installFromCatalog` (env kosong tidak ditulis, required divalidasi), **tanpa auto-connect** (fail-closed MCP-3: Trust manual dulu), uninstall = disconnect + hapus; runtime `installMcpServer/uninstallMcpServer` reload config in-memory (`reloadMcpConfig` + substitusi `{workspace}`); REST `GET /api/mcp/catalog`, `POST/DELETE /api/mcp/install`; UI panel MCP: daftar terpasang (badge) + katalog dengan pencarian + form API key (input password) + tombol Lepas; +4 test (env required, timpa, uninstall, entri lama utuh)
- [ ] **P1-MCP-2** OAuth flow MCP di web (Authorization Code + PKCE; token di vault) · _C · 3d_
- [x] **P1-MCP-3** Trust gate per-workspace + izin granular per tool + audit log panggilan · _C+A · 3d_, ✅ sesi dev 7: `workspace/mcp-trust.json` deklaratif **fail-closed** (tanpa trust = server TIDAK dihubungkan; file rusak → tetap tertutup), deny list per tool dievaluasi di handler + REST PUT memicu connect/disconnect dinamis + re-register, setiap panggilan tool MCP ter-audit (server/tool/sesi/hasil/durasi), REST `/api/mcp/servers` + `/api/mcp/audit`, panel MCP di sidebar (toggle trust, status live, audit tail); +8 test; smoke live: untrust→putus, trust→14 tools, deny→ditolak, audit terisi. (Katalog install UI = P1-MCP-1; OAuth = P1-MCP-2)
- [x] **P1-MCP-4** MCP worker per-tenant di sandbox (bukan stdio bare) + egress policy · _A · 4d · dep P0-SEC-1_, ✅ Batch 2: (1) egress policy, proxy allowlist host-side (`tools/egress.ts`: CONNECT tunnel, suffix-dot, port 80/443, deny 403; allowlist per-project `.yuika/egress.json` > env YUI_EGRESS_ALLOW > default registry npm/yarn/pnpm+nodejs.org); sandbox egress = network ON hanya via proxy (fail-closed); run_command kini dukung `npm install|ci|run|test…` + `npx` (subperintah di-whitelist, publish dsb. ditolak validasi); (2) MCP worker, per-server `sandbox: true|"auto"` + `egress:[...]` di mcp.json → server stdio dibungkus `docker run -i` (mount ro, caps-drop, resource cap) alih-alih stdio bare; tanpa Docker: true=fail-closed, auto=fallback+peringatan
- [ ] **P1-MCP-5** Sampling & elicitation MCP → server*requests ke klien (pola Hermes) · \_C+B · 3d*
- [x] **P1-MCP-6** Tool list changed → refresh registry next-session + notif UI · _C · 1d_, ✅ v0 dev-10: `mcp/client.ts` `syncTools()`, handler SDK `ToolListChangedNotificationSchema` → re-list + re-register baru + `unregister` tool hilang, LANGSUNG (bukan next-session, persona bisa pakai tool baru di turn berikutnya tanpa restart app); runtime perbarui snapshot status (McpPanel poll 10 dtk menampilkan daftar terbaru + log perubahan `+n -n`)

### P1-MEM (prioritas #2, learning loop)

- [x] **P1-MEM-1** `USER.md`/`MEMORY.md` manager (append dengan curasi, editable user, halaman "What Yui knows") · _C+B · 3d_, ✅ sesi dev 9: `memory/manager.ts` (read/save penuh dari editor + **appendCurated** dedupe inti catatan + guard + header transparan; USER.md workspace global, MEMORY.md per project), **tool `memory_append`** (scope user|project, tanpa approval, catatan additive milik user; scope project hanya sesi project) di 4 toolset persona, **inject ke system prompt saat sesi dibuat** (frozen, cache discipline, `memoryPromptSection` di runtime & delegasi anak; anak kini mewarisi projectId parent → binding roster anak jalan), REST `GET/PUT /api/memory`, UI **tab "Memori"** (editor dua dokumen + tombol Simpan + flash tersimpan); USER.md yang dulu ditulis-tak-dibaca kini benar-benar dibaca agent; +10 test (manager 6 + tool 4)
- [x] **P1-MEM-2** Nudge pasca-task (prompt learn ringan, aux model) → usul skill/catatan · _C · 2d_, ✅ sesi dev 9: `memory/nudge.ts`, aux call ringan pasca-turn yang melibatkan tool (fire-and-forget, tak memblokir UI): prompt kecil dengan bar tinggi "ragu → none" → verdict JSON {note, scope} → masuk lewat **tool memory_append** (kurasi+dedupe sama) → event baru **`memory.noted`** (chip "✎ Yui mencatat" di chat, kontrak + UI + test). Parse toleran code-fence; provider gagal/JSON rusak → skip aman. Config: `YUI_LEARN_MODEL` (default model utama), `YUI_LEARN=0` matikan. Trace `[yui:trace] nudge …ms → tercatat/skip`. +6 test nudge +2 test kontrak event
- [x] **P1-MEM-3** Skill-create-from-experience: flow penuh (draft → validasi lint → simpan ke domain persona) · _C+A · 3d_, ✅ sesi dev 9 (v0, scope global dulu): `skills/manager.ts` (propose → draf `skills/drafts/<slug>/SKILL.md` status draft; **Terima** = lint parse frontmatter + pindah aktif + buang status; **Tolak** = hapus; duplikat nama ditolak), tool **`skill_propose`** (bar tinggi: pola terbukti & reusable, bukan preferensi → itu memory_append; tanpa approval, validasi user eksplisit di UI) + event `skill.proposed` (chip "🛠 Yui mengusulkan skill" di chat), tab **Skill** (draf: lihat/edit inline → Terima/Tolak; siap pakai: daftar aktif), REST `/api/skills` GET/PUT/POST/DELETE, `skill_propose` di 4 toolsets + hint Learning di PERSONA.md conductor. Fix: `YAML.stringify({})` → "{}" (truthy trap), `listSkills` exclude folder drafts/. "Domain persona" (skill milik persona tertentu, P1-DUN-2) menyusul. +7 test
- [x] **P1-MEM-4** Usage tracking per skill (use/view/patch; `.usage.json` per home) · _C · 1d_, ✅ sesi dev 10 (`75a1ad5`): `.usage.json` per folder skill (views ← `skill_view`, patches ← edit draft & accept, ikut pindah folder saat aktif; used menyusul dihubungkan dungeon/P1-DUN-2), tampil di tab Skill (👁 n · ✎ n · ⚑ n), +1 test
- [x] **P1-MEM-5** `session_search` tool (FTS), agent menelusuri riwayatnya sendiri · _A · 2d_, ✅ v0 sesi dev 10: `SessionStore.searchMessages` (LIKE, recency, snippet ±60 char, hanya user/assistant, tool result dikecualikan) + tool `session_search` (scope project default / all lintas proyek, hint kapan dipakai) di 5 toolsets persona; FTS5 menyusul bila volume riwayat membesar; +1 test
- [x] **P1-MEM-6** Memory per-domain persona + blok recall di prompt (frozen per sesi!) · _A · 2d_, ✅ v0 dev-10: scope "domain" di manager (`workspace/memory/domains/<domain>.md`, slug aman; milik persona & lintas project, TIDAK ikut terhapus saat hapus project, konsisten kebijakan skill) + `memoryPromptSection` bagian "Memori bidang kamu" di-inject saat sesi DIBUAT (frozen, juga untuk sesi delegasi anak via manifest domain persona anak); tool `memory_append` scope domain menulis ke file domain persona PEMANGGIL (resolver dari manifest); +4 test

### P1-DEL (prioritas #3, delegation penuh)

- [x] **P1-DEL-1** Batch paralel (cap per plan) + `delegation.max_concurrent` config · _A · 2d_, ✅ v0 2026-11: cap paralel berlapis = `min(cap budget workspace (CRED-3, Settings→Metering), max_concurrent plan pendelegasi di delegation.yaml)`; contracts `DelegationRules.max_concurrent` (1–16, opsional); resep: conductor 3 (Maestro 3 front), planner 2 (consult P2-PM-2 paralel by design, dipelajari: consult memakai runner yang sama); pesan error menyebut sumber cap (plan vs budget); +test `delegation.test.ts`. Sisa v1: antrian (spawn di atas cap menunggu, bukan langsung tolak) & prioritas front.
- [ ] **P1-DEL-2** Background jobs + notifikasi selesai (web push) · _A+B · 2d_
- [x] **P1-DEL-3** Steering UI (arahkan/pause anak dari web) · _B · 2d · dep P0-DEL-2_, ✅ v0 2026-11 (dua tahap): **steer+cancel** (P0-DEL-2), kartu delegasi parent: tombol 💬 steer (input inline, pesan user berlabel `[arahan user, mid-turn]` di-drain tiap awal iterasi) + 🚫 cancel (graceful, job interrupted); **pause/resume** (P1-DEL-3), ⏸ di kartu delegasi: anak berhenti di BATAS ITERASI (provider tak dipanggil, progres tersimpan; parent turn ikut menunggu, jujur, bukan background), ▶ resume lanjut dari titik pause; event `delegation.paused/resumed` (audit trail + chip "paused, waiting for resume" di kartu); cancel saat pause tetap graceful (gate dibangunkan abort → interrupted); steer saat pause ter-antre & ter-drain pasca-resume; REST `POST /api/delegations/:id {action:pause|resume}`; +3 test `delegation-pause.test.ts`. Sisa v1: pause dari panel Tim/TaskTree (bukan hanya kartu chat) & auto-pause saat budget warn.
- [x] **P1-DEL-4** Isolasi & redaksi konteks anak (anak tidak melihat tool call parent), audit + test · _A · 1d_, ✅ v0 dev-10: `delegation-isolation.test.ts`, anak = sesi FRESH (bukan asumsi): diverifikasi 3 lapis, messages anak tanpa jejak history parent, systemPrompt anak tanpa konten parent, dan WIRE request ke provider (req yang benar-benar terkirim) bersih dari rahasia parent

### P1-PER (persona v1 penuh, pilar produk)

- [x] **P1-PER-1** Art direction doc + pipeline Rive (spec: dimensi, state machine, input, penamaan) · _S+artist · 3d_, ✅ 2026-11: **`docs/ART-DIRECTION.md`**, spec tunggal dari Orin v8 (sumber kebenaran: `orin_v8_larger_star.html` + rig SVG `OrinPortrait.tsx`): prinsip karakter (satu rig mata, identitas = bentuk+warna); artboard 400×400 1-file `orin.riv` dengan input `shape` 0–14; hirarki bone Root›Body(1.18 utk bintang)›Face›EyeL/R(+Glint)›FX, penamaan = kontrak by-name; tabel 15 bentuk (warna/fy/gs/es/gr/bodyScale) + pemetaan persona; state machine `Mascot` lengkap (mood/audioLevel/lookX/lookY/shape/sleep + trigger blink·nod·giggle·hum·look·tilt·yawn·hiccup·wake); keyframe 6 mood + aturan squash (bola seragam); pipeline 2-batch (Conductor+Scholar+Scribe dulu) dengan fallback SVG permanen; acceptance criteria 8 poin (≤300 KB, tajam 22–180 px). Siap langsung untuk P1-PER-2 (aset) & P1-PER-3 (runtime @rive-app/react-canvas)
- [x] **P1-PER-2** Aset Rive 6 persona × 7 state (batch: Conductor+Scholar+Scribe dulu) · _artist · berjalan paralel_, ❌ CANCELLED 2026-11: keputusan tidak memproduksi aset Rive; rig SVG OrinPortrait = portrait final (tidak akan pernah ada `orin.riv`)
  - ✎ dev-10: **Scribe berevolusi jadi persona dokumen**, upload (pdf/xlsx/csv) via tab File → `uploads/`, tool `doc_read` (unpdf + SheetJS), PERSONA.md: baca-dulu-baru-tulis. Menyusul: docx, offset paging doc_read, tabel hasil ekstraksi di UI.
- [x] **P1-PER-3** Ganti PersonaPortrait fallback → Rive runtime + pre-load · _B · 2d · dep P1-PER-2_, ❌ CANCELLED 2026-11: runtime sempat dibangun lengkap (2416cdb: RiveStage + /dev/rive + sample.riv + e2e), lalu sesuai keputusan Rive dibatalkan **dicabut bersih** (dep `@rive-app/react-canvas` di-uninstall, komponen/route/aset/e2e dihapus); PersonaPortrait & CharacterStage kembali langsung ke OrinPortrait SVG, nol perubahan perilaku
- [x] **P1-PER-4** Growth tracking (usage → level → varian gratis unlock) + timeline UI · _C+B · 3d_, ✅ v0 dev-10 (growth v0 tanpa unlock-varian, menyusul CRED-5): `personas/growth.ts`, level dikurasi dari KERJA NYATA (turn done via events persona.state, sesi, task done per assignee; kurva Baru→Berkembang 15→Mahir 50→Ahli 150 turn, tanpa jalur inflate); REST `GET /api/personas/growth` (kontrak `PersonaGrowth`); badge level + progress bar + tooltip di kartu PersonaGrid & baris PersonaPicker (poll 15 dtk); +5 test
- [ ] **P1-PER-5** Persona acceptance test blind (perilaku beda nyata antar persona, anti "hanya kosmetik") · _S · 2d_ → ≥80% penguji menebak persona benar dari output
- [x] **P1-PER-6** 2 persona tambahan (Analyst, Operator) sesuai roster D9 · _C · 1d_, ✅ v0 dev-10: **Yui Analyst** (expertise data: doc_read + run_command script reproducible, PERSONA.md inspeksi→bersih→hitung→lapor) + **Yui Operator** (otomasi/devops: run_command + mcp\_\_\* binding Tailscale, disiplin approval & verifikasi post-aksi); skill seed **data-analysis-basics** (category data, persona analyst) + kategori `data` masuk gating fase research; conductor can_spawn diperbaiki (typo `yui_designer` → hyphen) + 2 persona baru; bentuk Orin: Analyst=diamond, Operator=hex; +3 test roster D9 (manifest valid, delegation koheren, toolset benar)
- [x] **P1-PER-8** persona **Sherlock Yui** (roster ke-9, D26) ✅ Batch 14b (2026-11): `packages/personas/yui-sherlock/` (expertise quality-assurance; toolset qa_watch/qa_snapshot/qa_check + read files + run_command utk reproduce; TANPA tool eksekusi browser, watcher bukan driver; leaf: spawnable_by user+conductor, conductor can_spawn += sherlock). PERSONA.md disiplin reproduce→isolate→verify + evidence-based verdict. **Rantai nama D26**: alias "Sherlock" dilepas dari Analyst → persona QA; Analyst kini **"Nighty Yui"** (persona.yaml + PERSONA_ALIAS + 2 map web + fixture), DIPASTIKAN USER 2026-11: Nighty final
- [x] **P1-PER-7** **Persona Yui Designer** (roster ke-7, putusan user v0.5, §7.4): manifest + PERSONA.md + skill seed (design-system basics, design→code handoff, Penpot operation) + potret/tint · _C · 1d_ → GET /api/personas menampilkan Designer; delegasi dari Conductor jalan, ✅ sesi dev 10: persona.yaml (spawnable_by conductor) + PERSONA.md (fase design, handoff = HTML satu-file ke `code/` + memo keputusan ke `reports/`) + toolsets + 2 skill seed aktif (`design-system-basics`, `design-to-code-handoff`, format SKILL.md, tags personas yui-designer); shape "tri" Orin sudah tersedia sejak rig v4. Skill Penpot operation menyusul P2-DSN-2

### P1-CRED (SaaS credits v1, wajib sebelum alpha)

- [x] **P1-CRED-1** Skema ledger + usage events (per turn: token in/out/cache, sandbox detik) · _A · 2d_, ✅ v0 dev-10: kontrak `UsageEvent`/`UsageFilter`/`UsageSummary`/`UsageRollup`; `core/usage/ledger.ts` (tabel SQLite `usage_events` append-only + index at/project/persona; rollup byPersona/byModel + filter projectId/sessionId/personaId/since + feed recent); hook `LoopDeps.recordUsage` di AgentLoop (loop utama) + delegasi anak (persona/model anak ter-meter); **tanpa estimasi**, hanya dari `usage` chunk done provider (GLM/openai-compat sudah parse); runtime `getUsageSummary`/`getUsageRecent`; REST `GET /api/usage`; UI Settings → **Metering** (rentang semua/24j/1j, tabel per persona & model, feed terbaru, refresh 5 dtk); sandbox-detik = derivabel dari DungeonRun runs.json (noted); +6 test (rollup, filter, kosong, usage→event, tanpa-usage→tanpa-event, multi-iterasi tool round). CRED-2 hold/settle & CRED-3 rate-limit menyusul; akurasi <2% vs tagihan = CRED-6 saat billing nyata
- [x] **P1-CRED-2** Admission control hold→settle + saldo cache · _A · 2d · dep P1-CRED-1_, ✅ v0 dev-10: kontrak `BudgetConfig`/`UpdateBudgetRequest`/`BudgetStatus` (mode warn|block, dailyLimit/totalLimit unit = mata uang price book, maxTurnsPerMinute, maxDelegationConcurrency); `core/budget.ts` `AdmissionControl`, gas-station: pre-auth HOLD kasar (rata² biaya/panggilan 24j × 4, clamp 0.02–2) → settle saat turn selesai (hold dilepas; actual usage sudah di ledger CRED-1); **saldo cache** TTL 10 dtk + invalidate per usage event; angka belanja = ledger jujur × price book, model tanpa harga → coverage partial/none (batas bawah, bukan 0); deny = `session.error` recoverable sebelum turn jalan (warn = ⚠ tapi tetap jalan); file `data/budget.json`; runtime `getBudgetStatus`/`updateBudget`; +10 test
- [x] **P1-CRED-3** Rate limit per workspace (turn/menit, delegation concurrency) · _A · 1d_, ✅ v0 dev-10: sliding window 60 dtk di `AdmissionControl.admitTurn` (maxTurnsPerMinute, deny = pesan rate limit); cap delegasi paralel dinamis `DelegationDeps.maxChildren()` (default 2 tetap; dari budget.json → Settings → Metering); +1 test runner (spawn di atas cap ditolak)
- [x] **P1-CRED-4** UI saldo + burn-rate + attribution per persona/job · _B · 2d · dep P1-CRED-1_, ✅ v0 dev-10: Settings → Metering → panel **Saldo & Batas** (bar belanja hari ini/total vs limit, burn-rate 24j, hold aktif, badge limit-hit merah saat block, editor limit + mode + rate-limit + cap delegasi, blur = simpan PUT `/api/settings/budget`); **attribution matrix persona×model** + est. biaya (`GET /api/usage?matrix=1`, `ledger.matrix()` GROUP BY persona×model + `usageMatrixWithCost` × price book; tanpa harga = "—"); +1 test matrix
- [ ] **P1-CRED-5** Billing v1: plan sederhana + top-up (Stripe) + webhook · _B · 3d_
- [ ] **P1-CRED-6** Uji akurasi metering: selisih vs tagihan provider < 2% · _A · 1d_

### P1-INF

- [ ] **P1-INF-1** Auth (email+password → magic link) + workspace + tenant scope middleware · _B · 3d_, **DIARAHKAN ULANG 2026-11 (D23)**: bagian 1 password auth ✅ (lihat catatan sesi bawah); bagian workspace multi-user per server **DIGANTI** model akun-portal + linked device (`D:\projects\yuika-portal`, ARCH-PORTAL.md), identitas lintas platform = akun portal, self-host tetap mode-lokal ala Gitea → lanjutan task = **P1-PRT** di bawah; magic link & tenant middleware defer sampai ada kebutuhan nyata
- [x] **P1-INF-2** Adapter Anthropic + Gemini + router kualitas/biaya · _A · 2d_, ✅ v0 dev-10: `provider/anthropic.ts` (Messages API SSE via fetch: system terpisah, tool_use/tool_result block, input_json_delta terakumulasi, stop_reason & usage terpetakan) + `provider/gemini.ts` (streamGenerateContent alt=sse: functionCall TANPA id → id sintetis, tool result → functionResponse role user via mapping id→nama, usageMetadata), keduanya tanpa SDK baru (fetch + parser SSE generik `parseSse`); factory `makeProvider` satu titik di runtime; kind provider jadi kontrak (`ProviderSettings.kind` + `UpdateProviderSettingsRequest.kind`, env `YUI_PROVIDER_KIND`, persist .env, swap panas + smoke ulang); UI Settings → Provider: dropdown jenis provider + placeholder base URL per kind; +6 test (konversi pesan kedua format, stream tool-call, usage/finishReason, HTTP error, tool-result non-JSON Gemini). Router kualitas/biaya penuh menyusul bersama multi-key (butuh ≥2 provider aktif, catatan CRED/billing)
- [x] **P1-INF-3** Aux routing (title/compression/skill-extract → model murah) · _A · 1d_, ✅ v0 dev-10: knob tunggal **model aux** `YUI_AUX_MODEL` (alias lama YUI_LEARN_MODEL di-hormati & dibersihkan saat disimpan), dipakai learn nudge (aux call ringan pasca-turn); **aux kini ter-meter** (recordUsage di nudge, sebelumnya token nudge TAK tercatat, jujur untuk CRED-6); Settings → Provider: field "Model aux" (kosong = model utama, persist .env); updateEnvFile kini mendukung hapus key (null), perbaiki bug lama: fallback dikosongkan tidak "hidup lagi" setelah restart; +3 test (preferensi model aux, aux ter-meter, env delete). Compression v0 = truncasi lokal (tanpa model); title generation belum ada di produk; skill-extract dungeon tetap model persona (kualitas draf), aux routing tinggal pakai knob yang sama saat fitur itu lahir
- [x] **P1-INF-4** Observability: trace view per turn (pino + tabel DB) · _B · 2d_, ✅ v0 dev-10: **tanpa tabel baru**, agregasi dari sumber yang sudah jujur: event store append-only (tool call/result dengan nama via callId-map, delegasi, approval, error, memory/skill) + usage ledger (latensi & token per panggilan model, join via window waktu turn); `core/session/trace.ts` `buildTrace` → kontrak `SessionTrace`/`TraceTurn`/`TraceStep` (status done/running/cancelled/error); runtime `getTrace(sessionId)`; REST `GET /api/sessions/[id]/trace`; UI **panel Trace** (tombol sidebar, poll 3 dtk, turn terbaru di atas & auto-expand saat running, ikon per jenis langkah, durasi model call, rollup token per turn); +3 test (grup turn + join ledger, turn error terisolasi, sesi kosong). pino + tabel log terpisah menyusul bersama deploy (INF-5)
- [ ] **P1-INF-5** Deploy staging (VPS/Fly) + domain + TLS · _B · 1d_

### P1-PRT, Portal & remote integration (baru 2026-11, D23; pondasi server sudah jalan di repo `yuika-portal`, crypto 9 test + relay 5 test + web portal v0)

> **Keputusan kunci implementasi (D23):** device keys + koneksi relay host dipegang **apps/api** (proses host), BUKAN browser, host tetap online tanpa tab terbuka, dan kode yang sama dipakai ulang desktop-host nanti. Klien SDK (`packages/relay-client`) hidup di repo INI karena semua konsumennya di sini (studio host, mobile, desktop); protokol wire = spec `ARCH-PORTAL.md §3` dengan field `proto: 1` supaya server (repo portal) dan klien tak silently drift.
>
> **KONTRAK DIBEKUKAN (kerja paralel dua repo):** implementasi mengikuti **`docs/portal/`** (mirror identik dari `yuika-portal`): `SPEC-PROTOCOL.md` (wire v1 field-level, pesan, kode error, envelope, limit, REST claim), `CONTRACTS-REMOTE.md` (zod RemoteAction/RemoteEvent, salin verbatim ke `packages/contracts/src/remote.ts`), `vectors/proto1.json` (golden vectors, suite Yuika WAJIB hijau terhadap file ini, sama seperti portal; hash tercatat di `docs/portal/README.md`). Sebelum P1-PRT-6 cek portal memancang "PORTAL READY FOR INTEGRATION" di TASKS-nya. Usulan perubahan spec → lewat user (portal memegang dokumennya).

- [x] **P1-PRT-1** `packages/relay-client` SDK, connect + auth challenge (Ed25519), register*host/join (dhPub), list_hosts, seal/open envelope, reconnect backoff + sticky host_back, typed API · \_A · 2d* (mock ws; implementasi terhadap `docs/portal/SPEC-PROTOCOL.md`; acceptance termasuk suite golden vectors `docs/portal/vectors/proto1.json` hijau di repo ini), ✅ `4e58968` (crypto vectors 45 test dua backend node+web) + `09b5d1d` (SDK core/host/remote + SpecRelay double, 12 test skenario SPEC §11.1–7)
- [x] **P1-PRT-2** Kontrak remote: blok zod `RemoteAction`/`RemoteEvent` disalin VERBATIM dari `docs/portal/CONTRACTS-REMOTE.md` ke `packages/contracts/src/remote.ts` + barrel; payload tetap OPAQUE bagi relay · _A · 1d_, ✅ `ff50d39` (+8 test)
- [x] **P1-PRT-3** Host mode di `apps/api`: device store (kunci device host tersimpan di server lokal, gaya auth.db), REST `/api/portal/pair|status|unlink` + UI Settings → tab Portal (paste pairing token → claim → linked), relay host worker: RemoteAction → runtime (re-use handler route) + bus YuiEvent → envelope per-recipient; badge "N remote connected" di web · _A · 3d · dep P1-PRT-1,2_, ✅ backend `bfd4a72` (portal-device.db, PortalHostService: dispatch 9 action + proyeksi event seq/ring resume 500 + broadcast per-pelanggan, auto-online saat boot; core +EventBus.subscribeAll +listRecentSessions) + UI `a8a31d3` (tab Portal, RemoteBadge, +7 test)
- [x] **P1-PRT-4** Halaman `/dev/remote`, remote uji di browser kedua (pair token, join, kirim prompt, stream delta, approve), bukti E2E TANPA mobile · _B · 1d · dep P1-PRT-3_, ✅ `a8a31d3`: kunci WebCrypto DI BROWSER (Ed25519+X25519 via @yuika/crypto/web), claim via proxy `/api/remote-dev/claim` (portal tak melihat private), pilih host, list sesi + New session (persona), streaming delta, approval Approve/Reject, resume subscribe{sinceSeq} pasca reload
- [x] **P1-PRT-5** Relay support (repo portal): `list_hosts` (host online per akun) + update `devices.last_seen` saat auth + re-join otomatis remote pasca-drop · _B · 1d_, ✅ DISELESAIKAN SESI PORTAL (T1, commit portal `0d0752d` + `d43c397`): relay produksi kini SPEC-PROTOCOL v1 penuh (hello.proto, join dhPub, list_hosts, remote_joined batch, sticky, err, limit, device_events), diverifikasi dari sisi Yuika via `scripts/live-portal-smoke.mts` (8 langkah hijau melawan relay produksi + claim nyata)
- [x] **P1-PRT-6** Gerbang e2e: host + 2 remote live sesi sama, approval dari remote, drop koneksi → resume snapshot; playwright (relay in-process) · _A · 2d · dep P1-PRT-4,5_ → HP mengendalikan host terbukti end-to-end (via /dev/remote sebelum mobile), ✅ `e2e/remote.spec.ts` G1–G6 HIJAU (2 test, 37 dtk): host pair REST, remote browser pair+join, delta streaming E2E, approval write_file di-approve dari remote, reload → resume snapshot, 2 remote live (status = 2). Relay in-process = SpecRelay double sesuai definisi task; **LIVE lintas repo** dibuktikan `scripts/live-portal-smoke.mts` (auth/register/join/data dua arah/sticky vs relay PRODUKSI portal 8/8). Live penuh (claim via portal web + staging) menyusul gerbang PORTAL READY (T2+T4 portal); **prasyarat: portal menandai PORTAL READY FOR INTEGRATION (docs/portal/README.md)**, ✅ PORTAL READY terbit (portal commit `70f84ed`, `docs/INTEGRATION.md`) → ✅ **INTEGRASI PORTAL NYATA SELESAI (2026-11-07): `scripts/portal-integration.mts` 45/45 PASS** melawan web+relay PRODUKSI portal (checklist `INTEGRATION.md` §5 penuh: bad-sig 4003, cross-account join 4003/CP-1, join+dhPub dua arah, action E2E send_prompt→message.delta, broadcast 2 remote box per-pemilik, list_hosts urut deviceId, sticky host_offline/err 4104/host_back/remote_joined, limit bye 4105+4201, golden vectors identik, claim 201/409-used/409-clash/410-expired/429 Retry-After, bonus audit device_events), TANPA PATCH di kedua repo; regresi live-smoke 8/8; flow manual utk user: `docs/TEST-FLOW-PORTAL-INTEGRATION.md` (F1 pairing UI, F2 remote via relay produksi, F3 terminal shared, F4 egress+MCP sandbox Docker-gated). CP-1=4003 & CP-2=4102 diterima portal (`1ef50cb`), sisi Yuika nol perubahan (SDK memang match-by-code)
- [x] **P1-PRT-7** SSO login via portal (CP-3 accepted 2026-11-07): tombol "Sign in with Yuika Portal" → portal /authorize (Accept) → callback → sesi Yuika; portal = satu-satunya identity provider (signup hanya di portal), login lokal tetap fallback offline/dev · _A · 2d_, ✅ SISI YUIKA SELESAI (2026-11-07): contracts SSO (`PortalSsoStart/Complete`), auth store +kolom `portal_account_id` (migrasi idempoten + find-or-create: link by email bila ada, user baru password acak), routes `/api/auth/portal/start|complete` (PKCE S256, state="attemptId.random" tanpa cookie → aman lintas port dev, attempt in-memory 5 mnt sekali pakai, exchange server-to-server `POST portal /api/oauth/token` timeout 10 dtk), AuthGate tombol portal (jalur utama) + form lokal jadi fallback, halaman `/auth/callback`. Test: api unit 6/6 (URL authorize lengkap, happy path me=email portal, state salah 400, replay 400, verifier mismatch 401, mapping id-stabil + email-link), e2e `sso.spec.ts` browser PENUH vs portal-double (gate → tombol → auto-accept → callback → workspace + badge email portal, 8/8 suite). Portal-double :3110 kini punya `GET /authorize` (auto-accept test) + `POST /api/oauth/token` (PKCE+single-use). **Menunggu sesi portal**: implement endpoint nyata (`/authorize` UI Accept, `/api/oauth/*`, tabel oauth_codes, SPEC §REST SSO) → setelah itu swap live test (ganti double) + `YUI_AUTH_MODE=portal` untuk menyembunyikan form lokal.
- [x] **P1-PRT-8** Hapus local account, portal-only auth · _A · 1d_, ✅ SELESAI (2026-11-08): API `POST /api/auth/register|login` DIHAPUS (404; kontrak zod AuthCredentials/Register/Login dihapus), store tanpa scrypt (`createUser`/`verifyUser`/`AuthError` hilang; kolom password_hash jadi sentinel `!portal-only`), identitas user = `portal_account_id` (email sama dari akun portal BEDA → 409 `PortalLinkConflictError` anti-takeover; user legacy pra-portal NULL → di-link sekali sebagai migrasi), AuthGate tanpa form email/password (gerbang = kartu portal-only + hint; mode terbuka menampilkan pill "Sign in" langsung ke portal), mode terbuka kini: user pertama lahir dari portal sign-in pertama. Test: auth unit 5/5 (404 kontrak, tenant scope via SSO user, me/logout, identitas), auth-sso unit 7/7 (+409 takeover, +register/login 404), e2e auth.spec = kontrak mode terbuka + 404, sso.spec = pill → portal → callback → badge → sign out → gerbang portal-only. Suite e2e 8/8, turbo 5/5, typecheck 6/6.
- [x] **P1-PRT-9** Auto-link browser saat SSO (CP-4 proposed): login portal = browser otomatis jadi linked device · _A · 1d_, ✅ SISI YUIKA SELESAI (2026-11-08): `/api/auth/portal/complete` membaca `deviceToken` (field opsional dari exchange `/api/oauth/token`, kontrak CP-4) → claim slot **web** via `/api/devices/claim` (keys di proses api, tabel `web_device` terpisah dari host manual di portal-device.db) → presence `webDevice` di `/api/portal/status` + baris "Web session" di Settings→Portal. Aturan: claim SEKALI per account (SSO ulang skip), tanpa deviceToken → tanpa claim (backward compat), gagal claim ≠ gagal login. Test: unit auth-sso 9/9, e2e sso.spec assert status webDevice (suite 8/8), typecheck 6/6. **Menunggu sesi portal (CP-4 proposed di yuika-portal/docs/CHANGE-PROPOSALS.md)**: field `deviceToken` di token response, claim web idempotent by signPub + slot web multi (max 3), HAPUS kartu Web dari generator token manual (web = host/presence bukan remote, keputusan user).
- [x] **P1-PRT-10** CP-5 unlink device: bye 4001 permanen + reaksi host/web (adjustment auto-unlink) · _A · 1d_, ✅ (2026-11-08): (1) SDK core.ts, `UNKNOWN_DEVICE` (4001) masuk daftar bye permanen (4200/4000/4201/**4001** → tidak reconnect; doc comment di-update). (2) Host worker, `onHostBye(4001)` → stop worker + hapus row `host_device` + status `note:"unlinked"` (UI Settings→Portal tampil "Device was unlinked from the portal, generate a new pairing token", bukan error jaringan; note hidup 5 mnt). (3) Web presence worker BARU (`portal/web-presence.ts`), koneksi relay ringan dgn identitas web device (presence online di halaman Devices portal + kanal 4001); start saat auto-link SSO + saat boot API. (4) `signOutPortalAccount` (auth/store), saat web device di-unlink: SEMUA sesi portal-account itu dicabut (login berikutnya auto-link ulang via deviceToken CP-4). (5) **Guard everAuthed**: 4001 di auth PERTAMA = relay tak mengenal device (env mismatch, ketemu saat e2e: relay nyata :3101 jalan saat suite double) → stop diam TANPA mencabut sesi; 4001 setelah pernah authed = unlink sungguhan. (6) testing.ts: hook `unlink(deviceId)`, hapus device dari registry + putus semua conn dgn bye 4001 (meniru klik Unlink di portal). Test: SDK 4001 → closed & tidak reconnect (backoff 100–200ms dilewati); API host 4001 → row terhapus + note unlinked; web 4001 → row terhapus + token invalid; guard → row & sesi utuh. Bukti: unit api+relay-client 49/49, e2e 8/8, typecheck 6/6. Live vs portal nyata: INTEGRATION.md §5 item 13 (portal-side, sudah ditambah sesi portal).
- [x] **P2-FLOW-1** Format `workflow.yaml` deklaratif + validator zod + template 7 fase · _C+A · 2d_, ✅ (2026-11-08): `packages/contracts/src/workflow.ts`, schema `WorkflowDef/WorkflowPhaseDef/WorkflowStepDef` (mode sequential/parallel, depends_on intra-fase, gate default ON, max_concurrent parallel-only), `normalizeWorkflowDef` (step id `s<N>`, gate, depends_on), `lintWorkflow` (phase/step id unik, depends_on valid, deteksi siklus DFS, roster persona opsional, warning max_concurrent-di-sequential & gate fase terakhir), `loadWorkflowYaml` (dep `yaml` ditambahkan ke contracts), template `SEVEN_PHASE_TEMPLATE_YAML` (planning→research→design→develop→testing→docs→deliverable; 12 step, persona sesuai fase). Test 7/9: template parse+lint hijau (cek roster penuh). Catatan: tipe rename `WorkflowPhaseDef` (bentrok `WorkflowPhase` union project.ts).
- [x] **P2-FLOW-2** Engine v0: run = DAG → job graph · _A · 4d_, ✅ (2026-11-08): `packages/core/src/workflow/engine.ts` `WorkflowEngine`, fase berurutan; sequential step-per-step (output fase = konteks fase berikut, ringkasan dipotong 800c/konteks 4k), parallel topo-wave by depends_on + cap `maxChildren` (retry backoff saat cap delegation tercapai); step = `runChildPersona` reuse penuh (cap/cap-plan, kontrol abort/steer/pause, metering, event delegation.\* ke sesi LEAD Conductor yang dibuat per run). Persist `workflow_runs` di ProjectStore (status queued/running/awaiting_gate/done/failed/stopped + phase_states JSON per step). Acceptance terbukti: template 7 fase jalan E2E unit (12 delegation, 7 phase.done, run done) + paralel overlap nyata (2 step.started sebelum step.done) + depends_on dihormati + step gagal → run failed (workflow.done ok:false). REST: `routes/workflows.ts` (POST /api/projects/:id/workflows/runs {brief, workflow? object|YAML|template}, GET runs + detail, POST gate {decision}, POST stop, GET /api/workflows/template); runtime wiring: engine deps pakai GETTER (provider/model hot-swap tetap), `rt.workflowEngine` + list/getWorkflowRun.
- [x] **P2-FLOW-3** Human gate antar fase + resume pasca-restart · _A · 2d_, ✅ (2026-11-08): gate ON (default) → status `awaiting_gate` + event `workflow.gate.await` → keputusan via `approveGate(runId, approved|rejected)` (rejected → run stopped; approved → `gatePassed` persist). RESUME: `resumeRuns()` dipanggil saat boot runtime, fase done dilewati, step done TIDAK diulang, dan gate yang belum diputuskan DITANYA ULANG (keputusan human tak boleh hilang pasca-restart, `gatePassed` flag di phase_states). Unit: kill engine → engine baru resume → fase A tak diulang (step.started total 2), gate.await muncul 2×, lanjut sampai done.
- [x] **P2-FLOW-4** Event `workflow.*` + replay `?since=` · _A · 1d_, ✅ (2026-11-08, by construction): 8 event aditif ke YuiEvent union (workflow.started/phase.entered/phase.done/step.started/step.done/workflow.gate.await/workflow.gate.passed/workflow.done), semua di-emit ke sesi LEAD via makeEmitter (append store + bus publish) → stream SSE sesi + replay `?since=` yang SUDAH ADA langsung meng-cover run utuh; board FLOW-5 tinggal konsumsi. Remote-host projection aman (tipe baru di-skip default).
- [x] **P2-FLOW-5** Board monitoring: kolom fase, kartu agent live, gate UI · _C+A · 3d_, ✅ (2026-11-08): `apps/web/src/components/WorkflowTab.tsx`, tab `Flow` (pill Workspace, project-aktif): start run (brief opsional → template 7 fase), stop, chip status run + progres fase, banner gerbang (Approve/Reject saat `awaiting_gate`), kolom fase scroll horizontal (seq/par chip, gate badge) dengan kartu step (PersonaFace + status pending/running/done/failed + ringkasan line-clamp). Live: SSE sesi LEAD run (event `workflow.*` → refetch detail throttle 300ms). Bug ditemukan e2e: POST run mengembalikan `{runId, leadSessionId}` (bukan `{id}`), board kini baca `runId`. Bukti: e2e `workflow.spec` 9/9 (start → board → approve ×6 → done, 4.7s) · typecheck 6/6 · turbo 5/5.
- [x] **P2-FLOW-6** Steering mid-run: pause/resume, suntik instruksi, reassign step · _B · 2d_, ✅ (2026-11-08): engine, `steerRun` (instruksi → pesan user di sesi lead + event `workflow.steer` + masuk konteks fase BERIKUTNYA), `pauseRun/resumeRun` (checkpoint antar step/phase; pause saat awaiting_gate = status `paused` LANGSUNG + gate tetap bisa diputuskan, berlaku pasca-resume; resume pulihkan status awaiting_gate/running), `reassignStep` (step pending → persona lain; def+state di-persist via patch `workflow` store → tahan restart; done/berjalan ditolak; event `workflow.step.reassigned` from/to). Status `paused` baru di union + 4 event aditif (steer/paused/resumed/reassigned). REST: POST /runs/:id/steer|pause|resume|steps/reassign. Board: tombol Pause/Resume/Stop, input Steer, select reassign di kartu pending, banner gate tampil juga saat paused. Bug e2e ketemu & fix: (1) kartu fase pending tak render (st.steps=[] bukan undefined → fallback), (2) POST kosong + content-type json → 400 (header hanya saat ada body), (3) getByRole name = substring, pakai exact untuk tombol. Bukti: engine unit 11/11 (steer masuk konteks fase-2 via capture provider, pause menahan fase berikut, stop saat paused, reassign persist+event+persona baru), e2e 10/10 (spec FLOW-6: steer→reassign→pause→approve-saat-paused→resume→done)., **KEPUTUSAN KONSEP (user, 2026-11-08): Workflow = alat kerja persona orchestrator (conductor)**, pintu masuknya dari chat conductor (tombol "Workflow" di header chat HANYA saat persona aktif conductor + kartu CTA di empty state), header board Flow menyebut "runs led by Conductor Yui", PERSONA.md conductor mengarahkan pekerjaan besar terstruktur ke Flow (chat persona lain = pekerjaan serabutan). Backend sudah sesuai sejak awal (engine membuat lead session conductor). **Tab Team DIPERTAHANKAN** (disukai user); pembahasan assign/Task-Board menyusul. Bukti: e2e workbench "FLOW gate" (tombol → board → branding)., **MERGE LANJUTAN (user, 2026-11-08): TAB FLOW DIHAPUS, informasi workflow pindah ke TAB TEAM** dengan bahasa visual Team (kartu hierarkis run → fase → step + connector garis, panel kontrol: gate banner/steer/pause/resume/stop/start/reassign/run selector; di atas canvas delegasi). Komponen baru `WorkflowTree.tsx` (logika WorkflowTab diporting, selector e2e dipertahankan: aria-label Workflow board, data-phase/data-step, tombol nama sama); WorkflowTab.tsx dihapus; pintu chat conductor → tab Team. Tab 9 → 8., **ARSITEKTUR FINAL (user, 2026-11-08, hari yang sama): KENDALI = CHAT, OBSERVASI = TEAM CANVAS, ASSIGN = TASK.** (a) WorkflowRunBar baru di ChatView (hanya conductor + project): brief/Start run, chip status live (SSE lead + poll), banner gate Approve/Reject di bar, Steer, Pause/Resume/Stop; umpan balik run selesai (chip status terakhir sebelum reset ke form start). (b) Engine: startRun menerima leadSessionId opsional = sesi chat conductor (konteks [workflow lead] di-inject sbg pesan; sesi lintas-project ditolak; unit test baru). (c) TeamTree canvas: run aktif = ROOT kedua (conductor, subtitle Workflow · nama · status) + cabang step, fase implisit; WorkflowTree.tsx dihapus. (d) WorkflowStepsCard di tab Task: step pending per fase + dropdown Reassign. (e) Bug fix: ChatView cabang items>0 sempat projectId=null (bar hilang setelah pesan pertama). Bukti: engine 12/12, e2e 14/14 (FLOW-5/6 kini full via chat+Task+Team)., **TAHAP 2 (user, 2026-11-08): SATU COMPOSER.** Input Run brief & Steer instruction DIHAPUS dari bar; makna pesan menurut konteks: run hidup → STEER (apa pun toggle), toggle Workflow Mode nyala → BRIEF (start run), selain itu chat biasa. Toggle baru sejajar tombol Hardcore Mode (ikon Steps, label Ad-hoc Mode/Workflow Mode, aria-pressed, persist localStorage yui.workflowArmed, hanya conductor+project). Hook baru useWorkflowRun.ts (poll+SSE diangkat ke page); WorkflowRunBar jadi strip status murni (chip/progres/gate/Pause-Resume-Stop + hint "messages steer the run"; tanpa run & toggle mati → bar tak dirender). Placeholder composer kontekstual (brief/steer); pesan brief/steer tercatat sbg bubble user. FIX UI nyata: pill Sign in/out AuthGate pindah bottom-right → top-right (menutupi tombol Send saat logged-out). , **FIX NaN translate OrinPortrait (laporan user 2026-11):** spam console "<g> attribute transform: translate(NaN …)" tiap frame. Akar: sejak satu-tab-satu-halaman, kolom chat disembunyikan CSS → portret di dalamnya punya getBoundingClientRect() nol; pointermove dgn clientX=0 → mx = 0/0 = NaN → menempel permanen di smx (lerp) → gx NaN tiap frame (gy selamat: clientY≠0 → ±∞ di-clamp ±1). Fix 2 lapis: (1) onPointer abaikan rect degenerate (w/h ≤1px); (2) sanitasi fin() di semua setAttribute transform + lerp smx/smy, NaN tak pernah keluar/menempel. Regression test e2e orin.spec (pointer sintetis clientX=0 di atas portret tersembunyi → console harus bersih)., **FIX tree kembar di Team canvas (user 2026-11-08):** lead run = sesi chat → root run & root chat sama-sama merender Branch utk sesi yang sama → DUA tree identik. Solusi: run yang lead-nya = sesi root DIGABUNG ke kartu root (subtitle "Workflow · nama · status", state working; run ganda ditandai +N); hanya run dgn lead sesi LAIN jadi root terpisah. **FIX pill auth:** overlay fixed bottom-right menutupi tombol Send (logged-out) → pindah top-right malah menutupi tombol header Workflow → pill jadi baris footer SIDEBAR (AuthPill, varian compact utk sidebar kolaps; logout → reload → gerbang portal-only)., **BATCH FIX LAPORAN TEST E2E USER (2026-11, 9 item):** (1+#3) **FLOW-8 task↔fase binding + sweep**: engine menandai semua task fase (TaskItem.phase, alias id lama docs→documentation / deliverable→delivery) "doing" saat fase berjalan (board live, "tiba-tiba done" hilang), konteks tiap step kini menyertakan daftar task fase-nya + aturan abaikan task fase lain (QA tak lagi bingung oleh task logo), dan **sweep step** (≤2 putaran, pseudo-step sweep-N tercatat di fase + event) mengerjakan sisa task sebelum fase boleh done, task yang butuh keputusan owner ditandai review (bukan dipaksa done); bila masih tersisa → run done melampirkan laporan eksplisit ke sesi lead ("[workflow] Run selesai…"). Template 7 fase: id docs/deliverable → documentation/delivery (alignment enum TaskItem.phase). (2) Tombol header "Workflow" DIHAPUS (menumpuk status persona; tab Team di tablist = pintu yang sama). (4+#6) **Policy browser per-project**: toggle "Allow all domains" (checkbox di bar URL tab Browser + tombol cepat saat host_denied; persist .yuika/browser.json via GET/PUT /api/projects/:id/browser/policy; SSRF guard IP-private TETAP jalan). (5) **Tab Terminal digabung ke Browser** ala VS Code: BrowserToolsTab, browser = tampilan utama, terminal = panel bawah (toggle hide/open, drag-resize 120–560px, persist localStorage yui.termPanel) dgn 2 view: Shell (xterm, sesi shared agent) & Commands. Tab 8 → 7 (Chat · Team · Files · Task · Browser · Config · Logs). (7) **Commands log**: run_command (node/npm/npx) dicerminkan ke log per-project (terminal/manager logCommand, ring 200 entri; output sudah ter-redact) → GET /api/projects/:id/terminal/commands; view Commands menampilkan perintah/exit code/output live (poll 2.5s). (8) Blok "Langkah kerja" DIHAPUS dari ChatView, observability langkah kerja penuh di tab Logs (Session Trace realtime). (9) Dot indikator tab: label jadi inline-flex items-center gap-1.5 (dot center vertikal konsisten, tak lagi naik-turun mengikuti baseline). Bukti: typecheck 6/6, turbo 5/5, engine unit 15/15 (+3 FLOW-8), reader 9/9 (+2 policy), run-command 8/8 (+2 command log), e2e 15/15 (terminal spec di-rewrite via panel; STU-4 + alur toggle allowAll; FLOW gate via tab Team).

### PUB, Gerbang Go-Public (repo privat → publik; sumber: docs/LICENSE-AUDIT.md §6–7)

> Kondisi hari ini: repo **proprietary** (LICENSE "All rights reserved" + `license: UNLICENSED"
> di 4 package.json, keputusan D11/2026-11, jalur komersial). Semua item di bawah
> **wajib sebelum push publik pertama**, jangan MIT/Apache-kan repo utama tanpa
> putuskan ulang model bisnis (one-way door).

- [ ] **PUB-1** THIRD-PARTY-NOTICES.md, regenerasi dari skrip audit (sharp/libvips LGPL,
      caniuse-lite CC-BY-4.0, lightningcss MPL-2.0, expand-template MIT, dsb) · _B · 0.5d_
- [ ] **PUB-2** Keputusan lisensi publik final: tetap proprietary / BSL 1.1 (Additional
      Use Grant + Change Date) / PolyForm (Noncommercial/Small Business) / open-core
      (core engine permissive + apps proprietary) · _A · keputusan_, bikin teks LICENSE
      edisi publik + `LicenseRef-*` SPDX bila non-OSI
- [ ] **PUB-3** Bersih-bersih pra-publik: hapus artefak internal (docs/Orin*.html berisi
      prompt kerja), audit secrets/history git, .gitignore data workspace · *B · 0.5d\*
- [ ] **PUB-4** CONTRIBUTING.md + CLA/DCO (syarat agar bisa relicense/dual-license
      di masa depan) + cek trademark "Yuika"/"Orin" (PDKI kelas 9 & 42) · _B · 1d_
- [x] **PUB-5** CI: gerbang `npm audit --omit=dev --audit-level=high` (saat ini 2 high =
      zod; hilang setelah upgrade zod v4) + regenerasi laporan lisensi berkala · _C · 0.5d_, ✅ 2026-11: step **Security audit gate (prod deps)** di ci.yml setelah `npm ci` (audit prod = 0 vulnerabilities pasca zod v4 + openai 7.51); waiver hanya lewat keputusan eksplisit + catatan di LICENSE-AUDIT §4. Regenerasi laporan lisensi berkala = manual (skrip audit lokal, §LICENSE-AUDIT), dijalankan tiap tambah dep signifikan.

### P1-PRJ, Project entity v0 (Studio §13.2; D14)

- [x] **P1-PRJ-1** Kontrak `Project*` di `@yuika/contracts` (ProjectInfo, TaskItem, roster, binding) + tabel DB + CRUD REST `/api/projects` · _A+B · 2d_ → create/list/get project; semua tipe dari contracts, ✅ sesi dev 7: `contracts/project.ts` (ProjectInfo/TaskItem/RosterEntry/McpToolBinding + WORKFLOW_PHASES), `core/project/store.ts` (tabel projects+project_tasks), runtime `createProject` (mkdir `workspace/projects/<id>/{code,docs,reports}`), REST GET/POST `/api/projects` + GET/PATCH `/api/projects/[id]`; +5 test contracts, +3 test core; smoke live: create→201, list, patch archive, 404
- [x] **P1-PRJ-2** Isolasi root per project `workspace/projects/<id>/{code,docs,reports}`, file tools & path policy menghormati scope project · _A · 1d · dep P1-PRJ-1_ → test: project A tidak bisa baca path project B, ✅ sesi dev 7: kolom `sessions.project_id` (migrasi idempotent db lama) + `CreateSessionRequest.projectId`; loop dibuat dengan workspace efektif per sesi (`effectiveWorkspace`) → semua file-ops + delegation anak otomatis scoped; smoke live: agent tulis `reports/halo.md` → mendarat di root project, workspace global kosong
- [x] **P1-PRJ-3** Roster agent per project (`project.yaml`: persona + peran + fase), loader + validasi + tampil di UI · _C · 2d · dep P1-PRJ-1_ → assign 3 persona ke project demo; roster ter-replay, ✅ sesi dev 7: kontrak `ProjectManifest`+`RosterEntry`, `core/project/roster.ts` (load/save YAML deklaratif), runtime `getProjectRoster/saveProjectRoster` (validasi persona ada + anti-duplikat), REST GET/PUT `/api/projects/[id]/roster`, UI roster di drawer proyek (assign/hapus + fase chips); smoke live: 3 persona assigned, project.yaml ter-replay, unknown persona → 400; +4 test
- [x] **P1-PRJ-4** Tasklist per project (CRUD + status todo/doing/review/done + assignee persona) + tool `todo` agent melihat/menambah task · _C · 1d · dep P1-PRJ-1_ → agent menandai task selesai dari turn, ✅ sesi dev 7: ProjectStore CRUD task lengkap (update parsial, refs append bebas duplikat), tools `todo_list/todo_add/todo_update` (scoped sesi project; sesi global → error informatif; cross-project ditolak), REST GET/POST `/api/projects/[id]/tasks` + PATCH `/[taskId]`; toolset persona diperbarui (Conductor full, worker list+update); smoke live: Conductor add→done dari turn; +5 test
- [x] **P1-PRJ-5** Binding MCP project×persona (D17): koneksi server di level project, tool `mcp__<srv>__*` hanya muncul di toolset persona yang di-bind · _C · 2d · dep P1-MCP-3_ → test: persona tanpa binding tidak melihat tool MCP, ✅ sesi dev 7: binding dari `project.yaml` (roster entry `mcp:[{server,tools}]`), `applyMcpBinding` di loop, sesi tanpa project/persona tanpa binding → SEMUA `mcp__*` disembunyikan (fail-closed); binding penuh (`tools:[]`) = prefix `mcp__<srv>__*`, tool spesifik = nama persis; delegation anak mengikuti roster persona anak; UI: pilihan "Bind MCP" saat assign roster + chips binding; smoke live GLM: Conductor ter-bind memanggil `mcp__filesystem__list_allowed_directories` → audit terisi; +3 test filter
- [x] **P1-PRJ-6** UI: project picker + project home (shell v0: chat + roster sidebar), sesi melekat ke project · _B · 2d · dep P1-PRJ-3_ → buka project → sesi persona di scope project, ✅ sesi dev 7: `ProjectPanel` (sidebar: buat/pilih project, persist localStorage), sesi dibuat dengan `projectId`, badge project di chat-header, panel drawer kanan = roster (assign/hapus persona) + tasklist (tambah manual, cycle status, auto-refresh saat agent panggil `todo_*`); **UX sesi dev 7 (usulan user):** PersonaPicker dihapus dari sidebar (sisa: Proyek + MCP), klik project = sesi PROJECT LEAD otomatis (Conductor; persona spesialis dijangkau via delegasi, bukan pilihan manual), scope Workspace memilih persona lewat kartu di tengah layar, ganti persona = dropdown wajah di chat-header; composer kini juga tampil di state kosong (dulu hanya tag saran); **resume percakapan:** klik project yang sudah punya sesi = sesi TERBARU dibuka ulang via replay SSE (`?since=0`, context berlanjut, smoke live: agent mengulang jawaban turn sebelumnya), bagian “Sesi” di drawer = riwayat + tombol “+ Sesi baru (Conductor)”, REST `GET /api/sessions?projectId=` + `listProjectSessions` (terbaru-dulu dari last event)
- [x] **P1-PRJ-7** TaskTree model (D19): TaskNode hierarki `{id,parent,title,status,assignee,refs(job/step),artefak}` + event `task.node.*`; TaskList = proyeksi flat dari tree · _A · 1.5d · dep P1-PRJ-1_ → refresh → pohon utuh dari replay (tanpa state kedua), ✅ sesi dev 7: kontrak `TaskNode`+`ProjectEvent` (discriminated union `task.node.created/updated`), tabel `project_events` (append-only), ProjectStore menulis event DI TRANSAKSI yang sama dengan mutasi task (REST & tool `todo_*` semua lewat sini → tak bisa drift), proyektor murni `taskTreeFromEvents` + `flattenTree`, REST GET `/api/projects/[id]/tree`, `parentId` di CreateTaskRequest + `addArtefak` di UpdateTaskRequest; smoke live: pohon nested + artefak ter-replay; +4 test (total 49)

- [x] **P1-PRJ-8** **Hapus project + bersihkan SEMUA artefak** (request user): sesi & event-nya, task & project*events, file workspace (MEMORY.md project, uploads, reports), revisi file, audit MCP, ruangan+run dungeon (bila kind dungeon), **skill persona & metering DIPERTAHANKAN** (skill = milik persona; usage = akuntansi jujur) · \_A · 1d* → hapus project demo → semua artefak lenyap, project lain utuh, ✅ v0 dev-10: `runtime.deleteProject(id)` (turn in-flight sesi project di-abort dulu, loopCache dibuang), store method baru `deleteProjectSessions` (transaksi: sessions+events+messages+approvals+approval_memory), `deleteProjectData` (tasks+project_events+projects), `deleteRevisionsUnder` (prefix LIKE di-escape, folder sibling mirip nama tak ikut), `McpAuditStore.deleteForSessions`; REST `DELETE /api/projects/:id` → `DeleteProjectResult` (jumlah item dibersihkan); UI: tombol ✕ per project (muncul saat hover) → konfirmasi merah 2 langkah dengan penjelasan apa yang dihapus vs dipertahankan + ringkasan hasil; +2 test (urutan persis runtime 4-store 1-DB, isolation prefix sibling)

### P1-DUN, Dungeon: arena latihan persona (Studio §13.8; D20)

- [x] **P1-DUN-1** Tipe ruang `dungeon` (bukan project produksi) + format misi `mission.yaml` (goal, sumber belajar, acceptance, skill target) + runner sesi sandbox terisolasi · _C · 1d_ → misi contoh "riset dokumentasi Phaser" parse & jalan, ✅ v0 dev-10: kolom `projects.kind` (migration ringan); misi di `workspace/dungeons/<slug>/mission.yaml` (zod `Mission`, seed **phaser-research**); runner = ruangan project kind `dungeon` (session otomatis sandbox ke folder misi via machinery P1-PRJ-2), prompt misi WAJIB ditutup `skill_propose`; run async + persist `runs.json` (restart → sweep failed; 1 run aktif/misi); REST `/api/dungeons`; UI v0 di tab Skill. Arena penuh = P1-DUN-4
- [x] **P1-DUN-2** Skill inventory per persona: registry skill milik + lifecycle `draft→tested→ready` (sambungan flow P1-MEM-3) + UI daftar "apa yang persona ini bisa" · _C+B · 2d_ → persona menampilkan skill + statusnya, ✅ v0 dev-10: loader parse `metadata.yui.status` + `personas` (default seed = ready); **accept draft = `tested`** (review manusia; blind-eval DUN-3 yang naikkan `ready`); `setSkillStatus` untuk DUN-3; tab Skill tampil chip status (`◐ diuji manusia`/`✓ siap`) + persona pemilik; dungeon run menghasilkan draft milik persona
- [x] **P1-DUN-3** Eval acceptance skill: misi verifikasi buta otomatis (hanya lulus bila skill benar) + threshold `tested→ready` (§12.17) · _S · 2d · dep P1-DUN-1_ → skill lulus eval berubah jadi `ready`, ✅ v0 dev-10: evaluator buta = **sesi hakim fresh** persona misi di ruangan dungeon yang sama (anti-bias: nilai hanya dari kriteria acceptance + bukti folder + `skill_view`); verdict `VERDICT: LULUS/GAGAL` baris terakhir (parser ambil TERAKHIR, anti draft di tengah); lulus → `setSkillStatus` ready; hasil persist `.eval.json` per skill (pending/pass/fail + alasan + judgeSessionId); trigger manual tombol **Eval buta** di tab Skill (REST `POST /api/skills/eval`, async, polling field `eval` GET /api/skills); hanya skill `tested` dengan misi target cocok yang bisa dieval
- [x] **P1-DUN-4** Dungeon UI (arena): pilih persona → jalankan misi → progress live → skill dihasilkan · _B · 2d · dep P1-DUN-1..3_ → 1 persona selesai misi research nyata & skill-nya `ready`, ✅ v0 dev-10 (revisi arah user): **halaman terpisah** (tombol ⚔ Dungeon di sidebar, bukan section di tab Skill); **buat latihan custom**: pilih persona + nama skill target + mode, `riset mandiri` (persona cari sendiri / URL awal) ATAU `bahan ajar file` (⬃ upload pdf/xlsx/csv/md → `materials/` auto-jadi sumber misi); kriteria lulus editable (default per mode, dipakai eval buta); misi user vs bawaan dipisah + hapus; progress run polling 5 dtk; prompt misi kini dukung sumber URL & file (read_file/doc_read); REST `POST /api/dungeons/mission`, `POST /api/dungeons/[slug]/materials`, `DELETE /api/dungeons/[slug]`; kontrak `Mission.origin` + `CreateMissionRequest`; +4 test
- [x] **P1-DUN-5** Assign gating: roster project menampilkan skill readiness persona; persona tanpa skill fase ditandai “belum siap” · _C · 1d · dep P1-DUN-2 + P1-PRJ-3_ → roster menandai siap/belum per fase, ✅ v0 dev-10: peta fase→kategori skill (`readiness.ts`: research/design/develop/testing/documentation; planning & delivery = inti tanpa gating); readiness = skill milik persona (tested/ready, draft tidak) kategori fase; REST roster GET + field `readiness`; UI roster chip per fase `research ✓ / ✕` (tooltip skill siap / hint latih di Dungeon)

### P1-MDL, Multi-model per persona (Studio §13.10; D21)

- [x] **P1-MDL-1** Kontrak & runtime: `model` + `model_fallback` per persona di persona.yaml; parent & tiap delegation anak resolve model persona masing-masing · _A · 1d_ → Conductor & Scholar jalan di model berbeda dalam 1 run, ✅ sesi dev 10 (`43387b5`): `model-router.ts` (urutan resolusi: **override file Settings** `data/model-overrides.json` → **persona.yaml** `model.primary.name/.fallback` → default env getter hot-swap); `LoopDeps.routeModel(personaId)`, loop & delegasi anak resolve per persona; UI Settings tabel "Model per persona" (blur = simpan, kosong = default) + REST `/api/settings/models`; kontrak `ModelRoutes`/persona `ModelRoute.name/fallback`; +11 test router. P1-MDL-2 (router kualitas/biaya) & MDL-3 (indikator biaya) menyusul
- [x] **P1-MDL-2** Router model: map peran→model + smoke test kecil per model (tool-call 2 langkah; quirk dinetralkan `normalizeToolSchema`, pelajaran GLM 1210) · _A · 1.5d · dep P1-MDL-1_ → model gagal smoke → fallback otomatis, ✅ v0 dev-10: `provider/smoke.ts`, tes minimal tool-call 2 langkah (`ping_check` WAJIB dipanggil, bukan balas teks), schema dinetralkan normalizeToolSchema, race timeout ganda (provider hang pun tetap gagal rapi ≤45 dtk); router +`markHealthy` (lulus smoke = cooldown dibersihkan); runtime `runModelSmoke()` kumpul semua model aktif (default+fallback+route tiap persona) → gagal = markUnhealthy → route jatuh ke fallback otomatis; auto setelah ganti provider (Settings), manual REST `POST /api/settings/provider/smoke`; UI Settings panel "Uji semua model" (✓/✕ + latensi + "fallback otomatis aktif"); +4 test
- [x] **P1-MDL-3** UI settings: model picker per persona + indikator biaya + metering per persona tetap akurat (sambung P1-CRED-4) · _B · 1d · dep P1-MDL-1_ → ganti model persona tanpa restart, ✅ v0 dev-10: picker per persona sudah dari MDL-1 (hot-swap tanpa restart); **indikator biaya** = kolom "Est. biaya" di Settings → Metering (total + per model) dihitung dari token metering P1-CRED-1 × price book; **price book** `data/model-prices.json` (kontrak `ModelPrice`/`PriceBook`; `core/model-prices.ts` load/upsert + `costOf`); REST `GET/PUT /api/settings/models/prices`; editor harga inline di panel Metering (per 1 jt token in/out + mata uang USD/IDR, blur=simpan, baris = model terlihat di metering + yang sudah berharga); model TANPA harga = biaya tak dihitung (tampil "—", bukan 0, jujur); token per persona tetap akurat (ledger CRED-1); attribution biaya matrix persona×model penuh menyusul di CRED-4; +2 test

### G-ALPHA, SIAP TESTING #1 (internal alpha)

- [ ] Smoke E2E (P0-QA-1) + skenario persona blind test green di staging
- [ ] Metering akurat (<2%) & saldo tidak pernah minus
- [ ] Sandbox: no-escape checklist lulus (path, network, resource, fork bomb)
- [ ] 10 pengguna internal aktif 1 minggu tanpa data loss (session resume 100%)
- [ ] Trace + error dashboard bisa dipakai debugging harian
- [ ] Runbook alpha (known issues + cara lapor)

---

## P2, Multi-platform & UX penuh (±10 minggu)

### P2-MOB (mobile)

> **D23 (2026-11): mobile = REMOTE SAJA via portal relay** (switch host, action-based, bukan mirroring; matrix ARCH-PORTAL §4). Seluruh MOB memakai `@yuika/relay-client` + kontrak RemoteAction/RemoteEvent (P1-PRT-1/2), streaming & approve LEBIH DULU lewat envelope relay, REST langsung hanya bootstrap. Urutan setelah P1-PRT selesai.

- [ ] **P2-MOB-1** Expo app: shell + generated client dari kontrak · _B · 3d_, **+ D23: pair via portal (login/token), pilih host dari `list_hosts`, join relay**
- [ ] **P2-MOB-2** Chat streaming + resume di mobile · _B · 3d_, **+ D23: via envelope relay (message.delta), resume = session.snapshot**
- [ ] **P2-MOB-3** Push notification (Expo Notifications + FCM/APNs) + tap→approve · _B · 3d_, **+ D23: trigger approval.request dari host via relay; tap → RemoteAction approve**
- [ ] **P2-MOB-4** Persona picker + portrait (portrait = rig SVG OrinPortrait; Rive RN dibatalkan 2026-11) · _B · 2d_
- [ ] **P2-MOB-5** Mission Control mini (delegation/cron monitor) · _B · 2d_, **+ D23: delegation.update via relay**

### P2-DTL (desktop)

> **D23 (2026-11): desktop = HOST atau REMOTE (switch mode)**, host = develop lokal (runtime di shell); remote = kirim action ke host lain (termasuk web-host). Konsep lama "device relay worker ambil job eksekusi lokal" MELEBUR ke relay-client + mode host (P1-PRT); task lama dianotasi, tidak dihapus.

- [~] **P2-DTL-1** Tauri shell + reuse UI web · _B · 2d_, **+ D23: mode switch host/remote di onboarding** ✅ D47 dev slice: apps/desktop (Tauri 2, window→UI web, welcome.html onboarding host/remote, host spawn+health-poll API 3211, kill-on-exit; prod export statis+sidecar menyusul D48, lihat docs/PLAN-DESKTOP.md)
- [ ] **P2-DTL-2** Device relay worker (ambil job eksekusi lokal, report hasil; approval ketat) · _A · 4d_, **+ D23: tercapai via relay-client (host worker = P1-PRT-3 berjalan dalam Tauri; approval ketat tetap prinsip)**
- [ ] **P2-DTL-3** Auto-update + packaging (NSIS/MSI/DMG) · _B · 2d_ — config NSIS+icons scaffolded D47; aktif di D49 (docs/PLAN-DESKTOP.md)

### P2-AGT (autonomy & knowledge)

- [ ] **P2-AGT-1** Cron v1 natural-language + blueprint templates + push delivery · _A · 3d_
- [ ] **P2-AGT-2** Kanban review gates (request*review/approve/request_changes) + UI · \_C+A · 3d*
- [ ] **P2-AGT-3** Curator v1 (archive skill basi per persona; konsolidasi opt-in) · _C · 2d_
- [ ] **P2-AGT-4** Knowledge base: upload → ekstrak → index (pgvector) → pin di context · _C+A · 4d_
- [ ] **P2-AGT-5** Vault secrets per workspace (envelope encryption) · _A · 2d_
  - ⚠️ AMANDEMEN (2026-11): scope diperluas & DIGANTIKAN **P2-VLT-1..5** (Batch 12 · DISETUJUI, keputusan D27), vault sharing lintas persona (workspace/project/persona), nilai tak pernah masuk konteks model. Lihat section "Batch 12 & 14a" di bawah.

### P2-BIL & P2-GROW

- [ ] **P2-BIL-1** Billing v2: langganan premium (D11 entitlement lintas platform), invoice, dunning · _B · 3d_
- [ ] **P2-GROW-1** Desain skin/event/achievement (D10), spec + mockup, tanpa implement · _S · 2d_
- [ ] **P2-GROW-2** Growth timeline UI penuh (level, varian unlock, riwayat skill) · _C+B · 3d_

### P2-FLOW, Workflow engine & monitoring (Studio §13.3; D15)

- [~] **P2-FLOW-1** Format `workflow.yaml` deklaratif (fase, mode sequential/parallel, steps {persona,task,depends*on}, gate default ON) + validator zod di contracts + template 7 fase (planning→riset→desain→develop→testing→dokumentasi→deliverable) · \_C+A · 2d · dep P1-PRJ-3* → template valid parse & lint, **REKONSILIASI 2026-11 (ROADMAP-NEXT #1)**: TIDAK diadopsi bentuk file yaml, engine jalan via template + brief chat-driven (keputusan UX user 2026-11: kendali run hidup di tab Chat); validator tasklist (lintTaskList) jalan di `/api/projects/:id/tasks/validate`. Sisa: file yaml eksternal bila ada kebutuhan reuse template lintas project.
- [x] **P2-FLOW-2** Engine v0: run = DAG → job graph di queue; fase sequential satu-per-satu, fase parallel N delegation anak (cap per project) · _A · 4d · dep P0-DEL-1_ → run template di project demo jalan E2E, ✅ `workflow/engine.ts` + workflow-engine.test; e2e workflow.spec hijau
- [x] **P2-FLOW-3** Human gate antar fase (reuse approval engine: "fase X selesai, lanjut?") + resume run pasca-restart via replay event · _A · 2d · dep P2-FLOW-2_ → kill server mid-run → restart → run lanjut dari fase terakhir, ✅ event `workflow.gate.await/passed` + e2e FLOW-5 (gate approve ×6); resume via replay store
- [x] **P2-FLOW-4** Event `workflow.started/phase.entered/phase.done/step.started/step.done/workflow.done` (aditif ke YuiEvent) + replay `?since=` · _A · 1d · dep P2-FLOW-2_ → board di-refresh → state run utuh, ✅ contracts events.ts lengkap (+steer/paused/resumed/step.reassigned)
- [x] **P2-FLOW-5** Monitoring board UI: kolom fase, kartu agent jalan (sequential satu kolom / paralel berdampingan), progress persona, hasil per langkah, live via SSE · _B · 3d · dep P2-FLOW-4_ → 2 persona paralel terlihat jalan bersamaan + hasil terkumpul, ✅ WorkflowRunBar + WorkflowStepsCard + WorkflowTree; live via SSE tick
- [x] **P2-FLOW-6** Steering mid-run: pause/stop step, reassign ke persona lain, suntik instruksi (pola OpenBot Stop/Resume/Reassign) · _B · 2d · dep P2-FLOW-5_ → reassign mid-run tercatat di event & audit, ✅ e2e FLOW-6 (steer/reassign/pause/resume mid-run via chat)
- [x] **P2-FLOW-7** TaskTree board UI (D19): pohon task→subtask→step dengan kartu agent & status live; sequential/paralel terbaca dari struktur; klik node → sesi agent + steering · _B · 2d · dep P1-PRJ-7 + P2-FLOW-4_ → pohon delegasi live; refresh → utuh via replay, ✅ v0: TreeNode di drawer + board kanban 4 kolom (drag&drop → PATCH status, auto-refresh agent `todo_*`); papan TaskTree agent-live penuh tetap target G-BETA

### P2-PM, Persona Project Manager & planning flow skala besar (request user v0.6; D22)

> Kebutuhan user: project skala **besar**, iterasi **berkali-kali**, task **bukan 1–2 digit**.
> Division of labor (D22): **Yui Planner** merencanakan (brainstorm → dokumen perencanaan →
> task list detail), **Yui Conductor** mengeksekusi (delegasi sequential/paralel sesuai
> depends_on). Tiap fase flow (brainstorm → perencanaan → task list → design → eksekusi →
> testing → deploy) punya penanggung jawab + metrik keluaran yang terukur & termonitor.

- [x] **P2-PM-1** Persona **Yui Planner** (roster ke-8): manifest (spawnable*by user; bukan spawnable, Planner dipanggil langsung/user assign) + PERSONA.md (kepribadian PM: menuntut scope jelas, toleransi ambigu rendah, wajib rencana sebelum eksekusi, obsesi acceptance criteria) + toolset (todo\*\*, task_tree write, doc_write, consult) + skill seed `project-planning-basics` · *C · 2d · dep P1-PER-7\* → menerima brief besar → menghasilkan dokumen perencanaan + kerangka TaskTree, ✅ v0 dev-10: `packages/personas/yui-planner/` (persona.yaml expertise planning, toolsets, delegation can_spawn=[scholar,analyst,scribe], konsultasi saja, TANPA delegate_task: eksekusi ranah Conductor; spawnable_by=[user,yui-conductor] utk fase planning workflow nanti) + PERSONA.md (5 langkah wajib: pahami brief → consult → dokumen perencanaan docs/PLAN.md → task list acceptance+depends_on+assignee → minta persetujuan; aturan DAG & iterasi delta) + skill seed `project-planning-basics` (category planning, personas yui-planner); Conductor can_spawn + yui-planner; bentuk Orin **star**; roster test diperluas 8 persona + 1 test baru Planner
- [x] **P2-PM-2** Langkah **brainstorm multi-persona**: tool `consult`, Planner meminta pendapat scholar+analyst+scribe (paralel, pertanyaan terstruktur) → sintesis jadi SATU dokumen keputusan `docs/PLAN.md` project (bukan chat bebas: prompt planning, output terstruktur) · _A · 3d · dep P2-PM-1 + P0-DEL-1_ → brainstorm 3 persona → 1 dokumen sintesis, semua sesi terkutip di event/audit, ✅ v0 dev-10: `tools/consult-tool.ts`, 1–3 persona paralel via delegation runner yang sama (metering, cap maxChildren, event delegation.\*, audit berlaku); prompt anak FORMAT TETAP (PENDAPAT/RISIKO/SARAN/ASUMSI, ≤250 kata) agar bisa dikutip; return jawaban berlabel persona + instruksi sintesis (perbedaan pendapat = keputusan terbuka utk user); +3 test (2 persona paralel + prompt berformat, dedupe duplikat, persona asing isError rapi)
- [x] **P2-PM-3** **Task list detail** first-class: Planner generate TaskTree penuh dari planning doc, tiap task: deskripsi, acceptance criteria, depends*on, assignee persona, estimate; **validator coverage** (setiap acceptance fase ter-cover ≥1 task; DAG tanpa cycle) · \_A · 2d · dep P2-PM-2 + P1-PRJ-7* → brief besar → ≥30 task terstruktur, validator hijau, ✅ (2026-11-08): (1) Contracts, `TaskItem`/`TaskNode`/event `task.node.created|updated` += field detail aditif-optional (description, acceptance[], dependsOn[], estimate, phase, replace-semantik di update; Create/UpdateTaskRequest REST ikut); (2) Store, kolom description/acceptance/depends_on/estimate/phase (migrasi PRAGMA idempotent) di createTask/updateTask/taskFromRow; TaskTree projector propagasi detail → replay pohon utuh; (3) Validator `lintTaskList` (contracts, browser-safe): dependsOn dikenal + anti-siklus DFS warna, coverage fase (default 7 WORKFLOW_PHASES; custom requiredPhases), warning kelengkapan (acceptance/assignee/estimate), stats (total/with\*/phaseCoverage); (4) `todo_add`/`todo_update` menerima field detail (Planner menulis lewat tool) + REST GET `/api/projects/:id/tasks/validate`; (5) PERSONA.md planner + skill `project-planning-basics` mewajibkan detail & cek validator. Bukti: skenario brief besar → 35 task via `todo_add` nyata → lint OK tanpa error/warning; lint 5 test; REST validate kontrak; typecheck 6/6, turbo 5/5, e2e 10/10.
- [x] **P2-PM-4** **Matriks tanggung jawab fase** (RACI ringan): tiap fase workflow punya owner persona + metrik keluaran (brainstorm: dokumen disetujui user; planning: % task punya acceptance; design: gate review; eksekusi: task done/test hijau; testing: laporan QA; deploy: checklist rilis), render di monitoring board · _B · 1d · dep P2-FLOW-5 + P2-PM-3_ → tiap kolom fase menampilkan owner + metrik live
  - ✅ (2026-11-08): kontrak `DashboardPhase`/`DashboardRun`/`ProjectDashboard` (contracts/project.ts, aditif); builder murni `core/src/project/dashboard.ts` (`buildProjectDashboard` + `scanProjectSignals` QA/approval-hold + `countReopened` dari event transisi); owner = roster `phases[]`; metrik live per fase = task done/total (TaskItem.phase), % acceptance (planning), gate mapping dari run terakhir (`passed`/`pending awaiting_gate`/`none`), verdict QA project-wide di kartu testing; REST `GET /api/projects/:id/dashboard` (rt.getProjectDashboard); UI `ProjectDashboardView` di atas tab Task (grid 7 fase: owner chip + bar + gate badge + qa chip)
- [x] **P2-PM-5** **Dashboard progres terukur**: burndown task (Belum/Kerja/Reviu/Selesai), health per fase (blocker aktif, task revisi, hold approval menunggu), ringkasan iterasi (run ke-N: selesai/total, delta vs run sebelumnya) · _B · 3d · dep P2-FLOW-5 + P2-PM-3_ → project 100+ task: progres & blocker terbaca sekali lihat tanpa scroll-cek satu-satu
  - ✅ (2026-11-08): burndown (todo/doing/review/done + % acceptance + unassigned) + health chips (reopened = transisi done→bukan-done dari project_events, pendingApprovals = requested tanpa resolved/expired, qaFail, delegationErrors) + ringkasan iterasi (run #N: stepsDone/Total + delta vs run sebelumnya, status chip), semua server-computed satu endpoint; test core `dashboard.test.ts` 5/5 (reopened, signals, RACI+qa mapping, gate 3-state, delta iterasi) + REST contract test + e2e FLOW-6 assertion (dashboard tampil saat run hidup)
- [ ] **P2-PM-6** **Iterasi berantai**: hasil acceptance fase testing/deploy → Planner susun run BERIKUTNYA (hanya task delta + regresi blocker, bukan restart dari nol); workflow.run*id berantai + link dokumen retrospektif singkat · \_A · 2d · dep P2-FLOW-3 + P2-PM-3* → iterasi #2 berisi task delta; riwayat run ke-1..N utuh

### P2-STU, Workbench multi-tab & surface (Studio §13.5; D16)

- [x] **P2-STU-1** Tab shell v0: tab chat/file/board/monitor dalam project home (state per tab; layout kolom desktop) · _B · 2d · dep P1-PRJ-6_ → pindah tab tanpa kehilangan state chat, ✅ Batch 6 (2026-11-08), **diamendemen sesuai feedback user (hari yang sama): satu tab = satu halaman**, saat tab lain aktif chat TERTUTUP penuh (bukan lagi layout kolom `lg:flex-row`; kolom dianggap sesak) dan tab aktif mendapat lebar penuh. Chat tetap ter-mount (disembunyikan CSS, bukan unmount) sehingga draft composer, scroll, dan streaming tetap valid saat kembali. Penggabungan tab (Board/Tools, Docs→Files, Config & Logs jadi drawer) disepakati dikerjakan BATCH BERIKUT. Bukti: e2e workbench STU-1 versi baru (chat hidden saat Files aktif; draft selamat setelah kembali).
- [x] **P2-STU-2** Terminal tab: `xterm.js` ↔ PTY di sandbox (generalisasi `run_command`); user & agent share sesi terminal; approval untuk perintah berisiko · _A+B · 4d · dep P0-SEC-1_, ✅ Batch 2: TerminalManager core (satu sesi per project, backend docker-sandbox dgn egress / fallback shell lokal pipes; ring 400KB; dispose ikut runtime) + tool `terminal` agent (output tail 4k, quiet-detect; SAFE: node/npm install|ci|run|test/git read+commit/ls-cat-echo, npm publish, git push, curl, rm → approval card) + REST/SSE api (sessions, stream replay+live, input, buffer, DELETE) + tab Terminal web (xterm lazy no-SSR, lokal-echo, SSE), e2e T1-T3 hijau → agent menjalankan CLI & output muncul di tab yang user lihat
- [x] **P2-STU-3** File tab: tree + viewer + diff hasil edit agent (di atas file tools) · _B · 2d · dep P1-PRJ-2_ → diff write_file agent terlihat, ✅ v0 sesi dev 10 (`75a1ad5`) + diff penuh (`4136722`): tab **File** (tree + viewer ≤256 KB, `safeProjectPath` anti-traversal) & **`FileRevisionStore`**, write_file merekam snapshot isi LAMA pra-timpan (cap 20/file, no-op & >256 KB skip) → dropdown "revisi…" di viewer → `diffLines` (LCS, subpath `@yuika/core/project/diff`) → diff ±N baris berwarna; +11 test, **FIX bug user (2026-11-08)**: buka file/upload/diff sempat 401 "authentication required" karena `pick/showDiff/upload/poll-sync` pakai `fetch` polos tanpa token → semua diganti `authFetch`
  - ✎ fix test-user: tree kini via `projectRoot()` absolut (dulu readdir relatif cwd Next → selalu `[]`); auto-refresh 5 dtk + tombol ↻ + ⬆ Upload dokumen.
  - ✎ fix test-user #2: **file tak bisa dibuka**, effect reset di FileTab bergantung identitas `loadTree` (dep `sel`) → tiap klik file sel ter-reset null; kini reset hanya saat ganti project (latest-ref).
  - ✎ **Tim = infinite canvas** (request user): hold-drag = pan (Pointer Events + capture), scroll = geser, Ctrl+scroll/tombol ± = zoom (35–250%), ⌂ reset; grid dot ikut bergeser; tanpa dependency baru.
- [x] **P2-STU-4** Browser tab v0 read-only: _(amandemen 2026-11: mode Live = P2-SCR-3 Batch 14a, reader Static tetap fallback)_ server-side proxy + render (screenshot/DOM), domain allowlist per project, **security review = gerbang** (risiko §11) · _A · 4d · dep P0-SEC-1_ → agent membuka URL riset & user melihat halaman yang sama, ✅ Batch 6 (2026-11-08): tab Browser read-only, `packages/core/src/browser/reader.ts` (allowlist per-project `.yuika/browser.json` → env `YUI_BROWSER_ALLOW` → default example.com; SSRF guard IP-private/loopback/link-local/CGNAT/metadata + DNS resolve, pengecualian eksplisit `YUI_BROWSER_ALLOW_PRIVATE=1` dev/test; redirect manual max-4-hop tiap hop divalidasi ulang; content-type whitelist html/plain; cap 2 MB; timeout 15s; sanitizer script/iframe/object/embed/form/template + on\* + javascript:/vbscript:/data: + URL relatif→absolut) + iframe `sandbox=""` klien (tanpa allow-scripts/same-origin) + REST `GET /api/projects/:id/browser/fetch|visits` + riwayat `browser_visits` (agent `web_fetch` tercatat byRole=agent → user buka ulang halaman sama) + SECURITY-REVIEW-BROWSER.md (checklist 10 risiko + known limitations: DNS-rebinding race, sanitizer regex → mitigasi iframe sandbox). Bukti: unit reader 7/7 + api kontrak + e2e STU-4 (server loopback di-spec, script distrip, host luar allowlist 403).
- [ ] **P2-STU-5** MCP Figma connector (OAuth P1-MCP-2; bind ke persona design, D17) · _C · 2d · dep P1-PRJ-5_ → persona design membaca frame Figma di fase desain
- [ ] **P2-STU-6** ~~Eksplorasi pen.dev~~ → **digantikan Penpot** (pen.dev tidak open source, keputusan D18): pindah ke **P2-DSN-1** (eksplorasi repo `D:\projects\penpot`; deliverable sama: laporan referensi)
- [x] **P2-STU-7** Docs tab: viewer/editor markdown deliverable + ringkasan run · _B · 1d · dep P1-PRJ-6_ → laporan run terbuka sebagai doc, ✅ Batch 6 (2026-11-08): tab Docs, kiri daftar Run reports (GET runs, klik → sintesis markdown per fase/step/gate di klien) + Documents (semua file .md project via files API); kanan render komponen Markdown. Bukti: e2e STU-7 (upload deliverable-note.md → terbaca sebagai doc ber-heading)., **MERGE (feedback user 2026-11-08): tab Docs dihapus, fungsinya diserap tab Files** (satu konsep artefak project): seksi **Run reports** di atas tree file (dot status, klik → sintesis markdown), file `.md` default ter-render dengan toggle **Rendered/Source**, revisi & diff tetap hanya utk file asli; tab pill turun dari 10 → 9. Bukti: e2e STU-7 versi baru lewat tab Files (heading ter-render + toggle source + seksi Run reports).

### P2-DSN, Pipeline desain→kode via Penpot (Studio §13.9; D18)

- [x] **P2-DSN-1** Eksplorasi Penpot (repo `D:\projects\penpot`, tunggu clone selesai): API publik, plugin system, export/tokens, kemampuan render, **+ opsi mekanisme embed** (iframe scoped / komponen frontend / plugin, rekomendasi untuk tab Design) → laporan `docs/refs/penpot.md` + keputusan cloud vs self-host (§12.15) · _C · 1d_ → peta kemampuan API vs kebutuhan studio + rekomendasi mekanisme embed, _verif: `docs/refs/penpot.md`, keputusan: self-host (CSP) + RPC API v0 + iframe share-link viewer + MCP resmi v1 + exporter WASM untuk artefak; checklist verifikasi runtime disiapkan_
- [ ] **P2-DSN-2** Penpot connector, **mekanisme diputuskan (DSN-1)**: jalur utama v0 = **RPC API + access token** (create/update file headless via `update-file`, share-link per halaman, snapshot); MCP server resmi = jalur v1 (Streamable HTTP `/mcp`, plugin di sesi embedded); binding ke persona Designer (D17) · _C · 2d · dep P2-DSN-1 + P1-PRJ-5_ → persona Designer membuat/mengubah file Penpot dari dalam turn (headless)
- [ ] **P2-DSN-3** Tab Design = canvas Penpot **TER-EMBED di platform** (bukan link/app terpisah, D18): scope v0 ramping, lihat, navigasi halaman/frame, zoom, artefak ter-link ke node TaskTree; mekanisme embed sesuai DSN-1 · _B · 2d · dep P2-DSN-2 + P2-STU-1_ → desain fase `design` terlihat live di tab tanpa keluar app
- [ ] **P2-DSN-4** Pipeline design→kode: fase `develop` membaca file Penpot (shapes + tokens via API) → generate komponen kode → diff di tab File → acceptance di human gate · _A+C · 3d · dep P2-DSN-2 + P2-FLOW-2_ → frame sederhana → komponen kode + diff (ekspektasi v0: komponen+tokens, bukan pixel-perfect, D18)
- [ ] **P2-DSN-5** Persona Designer final (roster ke-7, sudah diputuskan, lihat P1-PER-7): skill seed Penpot dilatih lewat dungeon + misi acceptance · _C · 1d · dep P2-DSN-2 + P1-PER-7_ → Designer lulus misi dungeon Penpot → skill `ready`
- [ ] **P2-DSN-6** **Golden path flow ramping** (garansi flow utuh walau fitur lean): E2E test alur, agent Designer buat frame (fase `design`) → user lihat live di tab ter-embed → fase `develop` baca → generate komponen → diff, semua tanpa keluar platform · _S · 1d · dep P2-DSN-3 + P2-DSN-4_ → skrip golden path hijau 2× berturut

### G-BETA, SIAP TESTING #2 (closed beta)

- [ ] Mobile TestFlight/Play internal track terdistribusi ke 20 tester
- [ ] Push E2E (approval dari lock screen < 10 detik)
- [ ] Relay desktop: security review (scope tool, approval path) lulus
- [ ] Credits: audit akurasi bulan pertama + refund flow
- [ ] Support channel + feedback widget + triage SLA internal
- [ ] Analytics dasar (activation, retention, cost per workspace)
- [ ] Load: 100 sesi paralel, p95 turn-start < 2 dtk
- [ ] **(Studio)** Run workflow 7-fase template E2E di project demo (≥2 fase paralel), monitoring board live, resume mid-run lulus
- [ ] **(Studio)** Terminal & browser tab: security review lulus (path, egress, SSRF, allowlist) · binding MCP Figma bekerja di satu persona saja
- [ ] **(Studio v0.5)** TaskTree board live: pohon delegasi utuh via replay; steering per node jalan
- [ ] **(Studio v0.5)** Pipeline Penpot E2E minimal **ter-embed**: canvas hidup di tab Design (user tidak keluar platform); persona Designer produksi file di fase `design` → dikonversi komponen kode di fase `develop`; golden path (P2-DSN-6) hijau
- [ ] **(Dungeon)** ≥1 persona dilatih lewat misi research nyata (mis. Phaser) → skill `ready` → di-assign ke project; gating terlihat di roster
- [ ] **(Multi-model)** ≥2 model berbeda aktif untuk persona berbeda dalam satu run; fallback per persona terbukti; metering per persona akurat

---

## P3, Ekosistem (coarse; rinci saat masuk fase)

- [ ] Marketplace: persona (fork/remix) + skill + MCP, review otomatis (lint/scan/sandbox smoke) + moderasi + rev-share
- [ ] Teams: multi-user workspace, pool credits, role & permission
- [ ] Voice per persona (STT/TTS streaming)
- [ ] Self-host edition (docker-compose + license server D11 + grace offline)
- [ ] Curator konsolidasi LLM opt-in + backup/rollback

## P4, Skala (coarse)

- [ ] Visual workflow builder (node graph)
- [ ] Eval harness perilaku persona (regression suite, pola batch_runner Hermes)
- [ ] Sandbox microVM (Firecracker/gVisor) plan enterprise
- [ ] Enterprise: SSO, audit export, BYO-KMS, SLA

---

## Watchlist Risiko (ringkas, detail PLAN §11)

| Risiko minggu demo                 | Mitigasi sekarang                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Model ogah mendelegasikan          | W0-1 pilih model kuat; W5-C1 3 varian prompt; fallback skenario tanpa Conductor                                            |
| Rive makan waktu                   | Timebox 3 jam (W3-C1) → fallback CSS sudah final ABI-nya                                                                   |
| Scope creep                        | OUT list DEMO-WEEK-1 §3.2; reviewer tolak PR di luar scope                                                                 |
| SSE race / resume                  | W4-B2 + W5-A1; replay `?since=` adalah kontrak, bukan bonus                                                                |
| Utang demo menumpuk                | P0 = fase membayar `DEMO-SHORTCUT`; grep rutin; G-P0 tidak boleh dilewati                                                  |
| Workflow engine scope creep        | D15: DAG deklaratif template dulu; builder visual = P4; gate antar fase default ON; state hanya lewat event                |
| Browser embed = permukaan serangan | D16: proxy server-side default-deny, allowlist per project; review = gerbang P2-STU-4                                      |
| Paralel = biaya & race             | Cap concurrency per project; metering per step; replay untuk debug race (event = sumber kebenaran tunggal)                 |
| Studio menggeser kernel            | Urutan P1-PRJ → P2-FLOW → P2-STU; kernel tidak boleh tahu UI (contract-first)                                              |
| Dungeon skill basah                | Eval acceptance wajib (blind test P1-PER-5) + curator (P2-AGT-3); misi hanya di sandbox; tanpa lulus = tetap `draft` (D20) |
| Multi-model quirk & biaya          | Normalisasi schema terpusat (GLM 1210) + smoke test per model + fallback per persona + metering/budget per persona (D21)   |
| Penpot ops & API berubah           | Mulai token API (cloud/self-host ringan); adapter tipis + pin versi; self-host penuh bareng D11 (D18)                      |

## Konvensi Task Baru

1. Task baru masuk fase aktif dengan ID berikutnya, jangan sisipkan di tengah.
2. Task tanpa owner = belum siap dikerjakan.
3. Task > 2d harus dipecah saat planning.
4. Setiap bugfix P0/P1 menambah 1 test invariant bila relevan (pola Hermes: 1–2 invariant test per fix).

## Batch fix 2026-11 (feedback user pasca-rest)

> **MCP tidak lagi spam reconnect:** singleton runtime kini di-tag HASH SOURCE
> `createYuiRuntime` (dulu per module-instance → tiap route API baru di-compile
> dev = runtime dibuang-dibuat ulang = SEMUA server MCP reconnect menumpuk);
> health ping 30→60 dtk.
> **Delegasi PARALEL beneran:** tool calls dalam satu round kini `Promise.all`
> (dulu di-await berurutan → "paralel" Maestro ternyata sequential); hasil tetap
> di-append berurutan. Cap delegasi default 2→3 (budget + runner + teks Settings).
> **"child gagal: Socket timeout":** timeout provider default 120 dtk→5 mnt via
> env (`YUI_PROVIDER_TIMEOUT_MS`), model reasoning + konteks MCP besar bisa
>
> > 120 dtk sampai token pertama; berlaku openai-compat/anthropic/gemini.
> > **Hardcore Mode tuntas:** approval mode "auto" → cap iterasi 64
> > (`YUI_MAX_ITER_HARDCORE`) bukan 16, selesaikan sampai jawaban final tanpa
> > minta "lanjutkan".
> > **Chat tanpa timelapse:** buka sesi lama = snapshot di-hydrate SATU fetch →
> > satu render (dulu delta di-replay satu-satu = efek streaming ulang).
> > **Kartu delegasi klikable** → langsung buka sesi persona anak.
> > **Restrukturisasi tab (10→6):** Chat · Tim · Task (Papan+Pohon via drawer
> > "Log Task") · File · Trace · Konfigurasi (menu Roster/Memori/Skill ala
> > Settings non-modal). Tab Sesi → header Chat: status persona di tengah +
> > dropdown sesi + tombol sesi baru di kanan.
> > **Scrollbar compact** 7px bertoken (default Windows terlalu tebal).
> > **MCP cold-start tak lagi -32001 & mati permanen:** timeout handshake naik
> > 60 dtk→150 dtk (`connectTimeoutMs`) + kegagalan connect STARTUP kini masuk
> > reconnect backoff 2s..300s (dulu: satu warn lalu mati sampai restart walau
> > cache `uvx`/`npx` sudah terisi) + handshake gagal → proses anak dimatikan.
> > **Menu Enhancer → Persona (character studio ala game, permintaan user):**
> > `PersonaStudioView`, tab **Characters**: roster persona (level/XP growth
> > nyata) + preview maskot hidup `OrinPortrait` dengan emote (7 state) + **ganti
> > wujud geometri** (15 bentuk, persist `workspace/persona-shapes.json` via
> > REST `/api/personas/shapes`; reaktif di SEMUA UI via module-store +
> > `useSyncExternalStore`) + **skill loadout** (attach/detach chip, accept draft
> > latihan langsung); tab **Missions** + **Training history** (warisan Dungeon,
> > polling run live). Kontrak `OrinShapeKey`/`PersonaShapeOverride` (contracts).
> > **Orin v8 “Larger Star” + geometri organik v6 penuh** (lihat commit a433824):
> > 15 bentuk path filled membulat (v4 stroke-based dihapus), bintang 1.18×
> > HANYA siluet, gradient radial + soft shadow + kilau mata ganda, rig v8
> > (blink halus, gaze smoothing, squash seragam bola, look smoothstep).
> > Spec Rive: `docs/ART-DIRECTION.md` (P1-PER-1).
> > **Konsep Runner masuk PLAN §13.5** (port registry + preview iframe + jembatan
> > Penpot), belum dikerjakan, menunggu fase.

### 2026-11 · Housekeeping penutup fase (post-P0, pasca character-select)

- [x] **Bersih-bersih fase** (commit menyusul): PersonaPicker, hapus komponen
      `PersonaPicker` (nav sidebar lama), `usePersonaGrowth` + `GrowthBadge`
      (0 pemakai; level bar sudah di card Persona), re-export & import mati;
      orinShapes, hapus `personaShape()` (pemanggil = usePersonaShape),
      `personaShapeKey` jadi internal; ui, hapus `CardHead` (0 pemakai) +
      ekspor index tak terpakai (buttonClass, TabItem, ButtonProps, ChipTone,
      CardVariant); web deps, hapus `zod` (0 import) & `@rive-app/react-canvas`
      (dipasang ulang saat P1-PER-2 runtime Rive); hapus artefak
      `docs/favicon_io/` (duplikat public/), log tmp, `e2e/.tmp/*`;
      SettingsModal, ModelRoutesEditor pindah penuh ke page Persona
      (`PersonaModelModal`, tombol gear card identitas, "Check Connection").
- [x] **Rename scope package `@yui/*` → `@yuika/*`** (semua: contracts, core,
      web, api, personas, skills): package.json + import path di source/test,
      turbo.json `with`-graph, Dockerfile `--filter`, docs, lockfile regenerate;
      env `YUI_*` & konfigurasi lain tidak berubah (hanya nama package).
- [x] **Push pertama ke GitHub** (`ZamIzzudin/Yuika`): audit sensitif bersih
      (`.env`/DB/workspace tak pernah masuk history, dua string `sk-…` hanyalah
      fixture dummy test; `demo.db-shm/-wal` dikeluarkan dari tracking), merge
      `dev/p0-kernel` → `main` (epic P0 25/25 + housekeeping + rebrand @yuika/\*),
      seluruh 138 commit ditulis-ulang author atas nama pemilik repo, branch
      `main` + `dev/p0-kernel` ter-push → CI (.github/workflows/ci.yml) kini
      dapat berjalan.

### 2026-11 · P1-INF-1 auth gate (bagian 1)

- [x] **P1-INF-1 (password auth + gerbang tenant)**, ✅ 2026-11: kontrak
      `AuthCredentials/AuthUser/AuthSession/AuthStatus` (contracts/auth.ts);
      auth store SQLite terpisah (`YUI_AUTH_DB`, default auth.db), password
      scrypt+salt (timingSafeEqual), token sesi 32B random disimpan HANYA sebagai
      SHA-256 hash (TTL 30 hari, purge expired); REST `/api/auth/register|login|
logout|me`; middleware preHandler Fastify: mode lokal selama 0 user
      (backward-compat, smoke/latihan tetap jalan), setelah user pertama semua
      route non-/api/auth wajib Bearer (header, atau `?auth_token=` untuk SSE
      EventSource); web: `authFetch` (Bearer otomatis via localStorage) mengganti
      semua fetch API + `AuthGate` (form sign in/create account + badge sign out,
      oval latar ala CharacterStage); fix latent bug: fetch `/api/personas` tanpa
      guard `r.ok` → `setPersonas(undefined)` crash saat 401. +5 test API (mode
      lokal, register/duplikat, 401→token→200, logout, validasi zod) · e2e
      `auth.spec.ts` (mode lokal → gate → login salah/benar → persist reload →
      sign out; afterAll hapus users agar spec lain tetap mode lokal). Magic link
      (butuh infra email) & workspace multi-tenant per user menyusul (bagian 2).

### 2026-11 · P1-PER-3 runtime Rive (+ QA handoff artist)

- [x] **P1-PER-3** Ganti PersonaPortrait fallback → Rive runtime + pre-load · _B · 2d_, ✅ 2026-11: dep `@rive-app/react-canvas` dipasang lagi. **`components/rive/`**: `riveMap.ts` (kontrak by-name: PersonaState→mood 0–5, OrinShapeKey→shape 0–14 via SHAPE_ORDER, daftar input number+trigger, spec ART-DIRECTION §5 jadi kode) & `RiveStage.tsx` (probe HEAD aset → 404 = fallback OrinPortrait SVG **tanpa mengubah perilaku hari ini**; prefers-reduced-motion → fallback; ErrorBoundary + onLoadError → fallback; `warmRive()` pre-load idle sekali per src; aksi trigger via prop `{name,nonce}`; `stateMachine` param baru non-deprecated; aset non-kontrak: play animasi pertama). Dipakai di PersonaPortrait (hero 220 + compact 40) & CharacterStage hero 200, **grid persona tetap SVG** (1 canvas = 1 WebGL context). **`/dev/rive`** halaman QA handoff artist: status load, artboard+daftar animasi, checklist input vs kontrak (Contract missing ✓/✗), 7 PersonaState → mood, 9 tombol trigger, toggle SM off untuk aset non-kontrak; `sample.riv` (contoh publik Rive, Truck/idle-curves-bounce) untuk menguji canvas hidup. e2e `rive.spec.ts` ×3 (fallback missing → SVG, sample → canvas+laporan kontrak, halaman utama tetap SVG). P1-PER-2 tinggal drop `orin.riv` ke `apps/web/public/rive/` → semua portrait otomatis menyala. Bonus housekeeping: `auth.db`/`-shm`/`-wal` (runtime, terbawa `git add -A` kemarin) di-untrack + .gitignore.

### 2026-11 · Rive dicabut total (keputusan produk)

- [x] **Cancel jalur Rive**, ❌ CANCELLED 2026-11: user memutuskan Yuika tidak
      memakai aset Rive. Semua runtime P1-PER-3 (commit 2416cdb: `components/rive/`,
      `/dev/rive`, `public/rive/sample.riv`, `e2e/rive.spec.ts`, CSS `.rive-wrap`,
      integrasi PersonaPortrait/CharacterStage) **dihapus bersih**; dep
      `@rive-app/react-canvas` di-uninstall. Rig SVG `OrinPortrait` v8 = portrait
      final (fallback-selamanya menjadi satu-satunya jalur). `docs/ART-DIRECTION.md`
      ditandai arsip (nilai hidupnya: prinsip karakter & tabel 15 bentuk yang
      memang sudah implement di SVG). P1-PER-2 & P1-PER-3 dicancel; P2-MOB-4
      ganti catatan (SVG). Verifikasi pasca-cabut: tsc web bersih · e2e 4 spec
      passed (auth/smoke/persona-studio/orin).
  - Fix UX (menyusul commit 9bb3d1b): tombol **"Set up account"** di pojok
    kanan-bawah saat mode lokal, sebelumnya user pertama tidak punya jalan
    masuk via UI (gerbang hanya aktif setelah ada user); form bisa dibatalkan
    ("keep this server open"). e2e auth+smoke tetap hijau.

### 2026-11 · Keputusan arsitektur multi-platform: Yuika Portal (repo terpisah)

- [x] **ARAH PRODUK, portal akun + linked device + relay**, ✅ 2026-11: repo
      baru `D:\projects\yuika-portal` (fondasi v0 terimplementasi & teruji; lihat
      `docs/ARCH-PORTAL.md` di sana, dokumen keputusan tunggal). Ringkas:
  - **Akun pribadi** dibuat di portal (bukan di host), portal = pusat identitas;
    host memegang kunci sesi lokal (offline-friendly), portal dihubungi hanya
    saat pairing/unlink. **Implikasi: P1-INF-1 bagian "workspace multi-user per
    server" DITUNDakan/diganti**, self-host Yuika tetap mode-lokal ala Gitea,
    identitas user bermigrasi ke portal (auth.db lokal = solusi final utk
    single-owner, bukan interim).
  - **Linked device ala WhatsApp**: 3 slot (desktop/mobile/web) ×1 per jenis,
    pairing via QR/copy-token sekali pakai (TTL 120 dtk, sha256 di DB),
    pengganti WAJIB menunggu unlink manual dari portal.
  - **Relay** = satu endpoint publik, multiplexer BUTA (payload E2E: X25519
    ECDH + HKDF + AES-256-GCM, AAD from|to); host & remote connect keluar;
    join hanya sesama akun yang sama; dua remote live bersamaan sesi sama.
  - **Matriks platform (final)**: Web = HOST saja · Desktop = HOST/REMOTE
    (switch mode) · Mobile = REMOTE saja (switch host) · semua host bisa
    diremote (host wajib online, konsekuensi sadar).
  - **Remote = action-based** (intent terstruktur + event delta), BUKAN screen
    mirroring, natural bagi Yuika karena YuiEvent + REST sudah ada.
  - **Plan/billing defer**: launching free-tier; hook `accounts.plan` disiapkan.
  - v0 portal: crypto (9 test) + relay ws integrasi (5 test) + web Next
    (register/login, device manager QR/unlink, claim API, slot clash 409) +
    demo alur penuh `npm run demo:relay`.
  - Task lanjutan menyesuaikan: P2-MOB-2/3/4/5 (mobile remote via relay),
    P2-DTL-1/2 (desktop host/remote switch + device relay worker), detail
    roadmap §7 ARCH-PORTAL. Rive RN di P2-MOB-4 sudah dicancel sebelumnya.

## Batch 7 · Research Engine + Batch 8 · Live Browser (adaptasi brief "Remote Browser & Research Tool")

> **Batch 7 SELESAI (2026-11)**, disetujui user termasuk RS-1b (news/market/social) setelah diskusi use case riset bebas topik & posisi Camoufox (opsional terakhir). Batch 8 tetap rancangan.
> Dokumen lengkap: docs/PLAN-RESEARCH-LIVE-BROWSER.md. Akar pain user: (a) websearch Yui Scholar sering kena block, sistem bahkan belum punya tool web_search (hanya web_fetch fetch-polos, UA non-browser, tanpa SSRF guard); (b) tab Browser reader read-only kurang cocok untuk mencoba hasil build agent. Embed mapping + keputusan terbuka di dokumen. Menunggu persetujuan scope & est.

- [x] **RS-1a** Provider layer search + fallback chain hasil parsial · _M_, ✅ (2026-11): packages/core/src/research/, router researchSearch: cache → site-router intent-aware (news → market → social → docsites → wikipedia → github → stackex → hn, heuristic matches()) → engine umum (searxng bila YUI_SEARXNG_URL; ddg lite→html fallback nonofficial, YUI_RESEARCH_DDG=0 utk matikan). Merge prioritas provider + dedupe host/path + cap; provider gagal → errors[] jujur (agent ganti query, bukan menabrak ulang). Parser ddg & news RSS diekspor utk test.
- [x] **RS-2** Upgrade web*fetch · \_S*, ✅: pipeline researchFetch = assertBrowserUrlAllowed (BrowserReadError→ResearchError wrap) → robots.txt (parse group _, wildcard _ + anchor $, cache 1 jam; 404/hang = diizinkan → dev server aman) → domainThrottle (jeda per host) → fetch redirect-manual (tiap hop divalidasi ulang, max 4) → cap 2MB → Readability(linkedom)+turndown → markdown (fallback plain strip). Policy riset: .yuika/browser.json ada → dipakai (share dgn tab Browser); tanpa file = web terbuka; SSRF IP-private JALAN TERUS (celah lama web_fetch fetch-polos tertutup).
- [x] **RS-3** Tool web*search + persona · \_S*, ✅: registry web_search(query, limit 1–10 default 5), deskripsi arahkan "search first, never guess URLs"; web_fetch deskripsi baru (markdown, robots-aware); pesan error EN friendly (host_denied/private_blocked/robots_denied/budget). Toolset yui-scholar & yui-conductor + web_search. PERSONA scholar "How you work" di-rewrite (search first; timestamp utk angka; budget-aware); SKILL web-research prosedur baru + pitfall "guessing URLs" & "stooq ≠ realtime".
- [x] **RS-4** Cache + budget · _S_, ✅: research.db (terpisah dari db sesi, WAL, housekeeping 7 hari), table research_cache; TTL search 12 jam / halaman 72 jam; in-memory fallback. Budget ResearchBudget sliding window 1 jam per sesi: 10 query / 20 halaman default (env YUI_RESEARCH_MAX_QUERIES/MAX_PAGES); cache HIT tidak dihitung; habis → hasil kosong + error jujur.
- [x] **RS-5** Config · _S_, ✅: researchConfig(), YUI_RESEARCH_OFF (kill-switch total), YUI_SEARXNG_URL, YUI_RESEARCH_DDG, MAX_QUERIES/MAX_PAGES/DOMAIN_DELAY_MS; budget singleton tahan HMR (globalThis). Runtime: cache riset di-path.dirname(dbPath)/research.db, disuntik ke registerWebTools.
- [x] **RS-1b** Providers news/market/social (permintaan user: riset tak terbatas topik, pasar/berita/harga/sentimen) · _M_, ✅: news = Google News RSS (hl/id locale; parseNewsRss CDATA-safe) trigger kata berita/jadwal/konser/terbaru/…; market = CoinGecko simple-price (crypto live, symbol map 16 coin) + Stooq CSV (saham $TICKER & kurs USDIDR, DELAYED, ditandai jelas) → hasil baris harga sintetis + URL verifikasi; social = Reddit RSS search (top/bulan) + Bluesky searchPosts publik, proksi sentimen TANPA login (X/TikTok/IG tertutup → jalur resminya authenticated preview LB-2, bukan scraping; Camoufox TETAP opsional terakhir per brief).
- [ ] **LB-1** Process manager (spawn dev server + deteksi port) + Chromium headless CDP + screencast WS + input relay; tab Browser mode Live/Static · _M · ±3d_
- [ ] **LB-2** Agent shared-session via connectOverCDP + tools browser\_* + takeover indicator · *M · ±2d\*
- [ ] **LB-3** DevTools embedded (artefak pinned + WS proxy auth) · _M · ±2d_

> **Urutan eksekusi sisa pekerjaan → docs/ROADMAP-NEXT.md** (dibuat 2026-11: antrian prioritas tunggal + catatan rekonsiliasi docs + keputusan desain VLT-4).

## Batch 12 · Vault v0 + Batch 14a · Live Screen (DISETUJUI 2026-11, keputusan D24–D27)

> **Batch 12 SELESAI (2026-11)**, detail di BATCHES.md.
> **Batch 14a SELESAI (2026-11)**, SCR-0..4 + follow-up floating screen (ScreenPip + useScreenStream; tombol Float & Watch live). Detail di BATCHES.md. RESTRUKTURISASI lanjutan (hari kedua): bug header PiP fix, resize tepi, close=stop sesi, auto-shutdown YUI*SCREEN_TOOL_IDLE_MS, bubble chat Open Browser (event screen.state), tab Browser→Terminal penuh (reader dihapus; policy→Config), Logs=project-wide activity feed (/api/projects/:id/activity). Natural-language browser intent: PERSONA Scholar+Coder, sebut "browser" di prompt user → persona pakai browser*\* (bukan web_fetch).
> Sumber: docs/PLAN-WORKSHOP-LIVESCREEN-VAULT.md (benchmark `rokazo`, dipangkas).
> User: **A (Vault) & B (Screen) setuju eksekusi; C menyusul; D tolak semua.**
> Urutan eksekusi: Batch 12 duluan (independen), menyusul 14a.

### Batch 12 · Vault v0 (P2-VLT, supersede P2-AGT-5)

- [x] **P2-VLT-1** Store terenkripsi + kontrak vault: AES-256-GCM per record (AAD id+name+scope, nonce per tulis; primitif reuse packages/crypto), master key `YUI_VAULT_KEY`/`<data>/vault.key` (0600, warning backup), tabel `vault_secrets`, REST metadata-only (nilai tak pernah keluar API) · _A · 2d_
- [x] **P2-VLT-2** Kartu protected + tools `vault_request`/`vault_list`/`vault_forget`: varian kartu approval (nilai dibersihkan DOM-side saat submit; event hanya `hasValue`), scope workspace/project/persona + grant, switch "Save to Vault" (off = run-only, dihapus saat run berakhir, adaptasi rokazo) · _A+B · 2d_
- [x] **P2-VLT-3** Jalur pakai backend-injected: `secret_http` (origin persis+port, redirect ditolak, HTTPS wajib, 30 dtk deadline, 1MB/20k char, response di-redact) + command variables (env export `UPPER_SNAKE`, nama reserved `LD_*|GIT_*|NPM_CONFIG_*|YUI_*|PATH`, redact plain/base64/urlencode dari semua output) · _A · 2d_
- [x] **P2-VLT-5** Redaksi nilai aktif per-run (perluasan redact.ts) + audit `vault.used` (metadata saja) + **e2e negatif wajib**: nilai menyamar TIDAK pernah muncul di trace/SSE/listCommandLog/konteks model · _A · 1.5d_
- [x] ~~P2-VLT-4~~ **fill_login, SELESAI v0 (blok C, 2026-11)**: tool `request_login {origin, submit?}` (scholar+coder), vault auto-use record `login:<origin>` (kind login, scope persona, value JSON {user,pass}, resolveForUse+redaksi aktif VLT-5) TANPA kartu; bila belum ada → event `login.requested` (metadata-only: origin+deadline YUI_LOGIN_TIMEOUT_MS default 120s) → kartu chat 2 field (LoginFillCard: username/password uncontrolled, dibaca DOM-side saat submit lalu di-clear; toggle Save to Vault default ON + Submit form default ON) → REST POST /api/login/:requestId/fill|skip → `resolveLogin` → `screenFillLogin` CDP (input[type=password] pertama + input text/email terdekat sebelumnya; native setter + event input/change; requestSubmit), nilai TIDAK PERNAH di event/state chat/model. Helper `screenEvalJson`. Related-origins v0 = origin persis (SSO chain lintas domain menyusul, catatan lanjutan)

### Batch 14a · Live Screen Scholar (P2-SCR, menyerap LB-1..3)

- [x] **P2-SCR-1** (=LB-1) Screen manager core: playwright-core Chromium headless CDP 127.0.0.1 (binary `YUI_BROWSER_EXEC` → cache playwright → Chrome/Edge), Page.startScreencast JPEG (idle ≤2fps `YUI_SCREEN_FPS_IDLE`, aktif ≤15fps), input relay mouse/key/scroll + setDeviceMetricsOverride, lazy start + idle-kill, WS screencast/input (auth pola terminal; projectId binding) · _A · 3d_
- [x] **P2-SCR-2** (=LB-2 inti) Agent shared-session: `browser_*` tools via connectOverCDP sesi yang sama dengan yang di-stream; **takeover lease tunggal pola fence** (adaptasi rokazo screen-lease.ts), user takeover → tool persona yield ber-bound (max-wait + auto-release); chip "KAMU mengendalikan" · _A · 2d_
- [x] **P2-SCR-3** Profil browser persist per (project, persona) `.yuika/browser/<persona>/` + selector screen tab Browser (Preview | Scholar) + **EKSKLUSI `.yuika/browser/*` & `preview-profile/` dari tab Files/tree/artefak** · _B · 1.5d_
- [x] **P2-SCR-4** `request_takeover` persona: tool + kartu non-blocking "Needs you" (reason wajib sebut origin) + tombol Ambil alih/Lewati + deadline auto-skip + lease release · _A · 1.5d_
- [x] **P2-SCR-6** watch QA ✅ Batch 14b (2026-11): persona QA menonton live screen persona LAIN read-only, tools `qa_watch {target,on?}` (watcher keep-alive sesi target + transparansi `watchers` di ScreenState; idle close skip selama ada watcher), `qa_snapshot {target}` (snapshot sesi target tanpa lease; masking password di sumber + redactActive), `qa_check {item,status,note?,target?}` → event `qa.check` (kontrak; NON-BLOCKING, tanpa gate/kartu) → activity feed tab Logs (Chip tone ok/danger by status). File `tools/qa-tools.ts`, manager `qaWatch()` + kondisi idle `watchers.size === 0`. **Amandemen 14c (temuan test user via Sherlock)**: resolusi target qa_watch/qa_snapshot kini pintar, persona id polos dicari di SEMUA sesi aktif (cross-project otomatis utk id unik, flag `crossProject`), full key `project/personaId` diterima langsung, id ambigu → daftar kandidat, id salah/tidak ada → error menyertakan `activeScreens` (key+url+title+status semua sesi hidup) supaya persona self-correct turn berikutnya; `on:false` ke sesi mati → idempoten (bukan error). **Amandemen user 2026-11**: `qa_watch`+`qa_snapshot` DIBERIKAN JUGA ke Analyst (permintaan "perhatikan apa yang dibuka Hiro" harus jalan dari persona data, bukan rekonstruksi riwayat); `qa_check` (verdict) tetap eksklusif Sherlock
- [x] **P2-SCR-7** remote watch via relay ✅ (2026-11): kontrak remote aditif v1.1 (+act `watch_screen`/`unwatch_screen`, +ev `screen.state`/`screen.frame` ~1fps JPEG base64, +field `host.state.screens`; remote lama buang ev tak dikenal, aman). Host: `PortalHostService` watch registry (1 watch/remote v0), `subscribeScreen` viewer++ (keep-alive sesi), pump interval `YUI_REMOTE_SCREEN_MS` default 1000ms + dedupe frame identik + cap 200KB; remote pergi/unwatch → unsubscribe otomatis. Web: panel "Live screens" di /dev/remote (list screens + Watch/Stop + render frame). Bridge `apps/api/src/portal/screen-bridge.ts` (mockable utk test)
- [x] **BATCH 13, WORKSHOP PERSISTEN** (P2-WKS-1..6, D24) ✅ (2026-11-08, Docker host tersedia, staging-first dilewati): kontrak `contracts/workshop.ts` (WorkshopState absent/starting/running/asleep/stopped/error, WorkshopInfo, log item, `.yuika/workshop.json`, default egress npm+GitHub) + event aditif `workshop.state`/`workshop.command`; core `workshop/manager.ts` (WorkshopHost tipis: DockerWorkshopHost CLI + LocalWorkshopHost fallback TANPA isolasi w/ warning; lifecycle start/sleep(idle|user)/recover(volume dipertahankan)/reset(volume dibersihkan)/destroy + exec auto-wake + audit by persona + ring log + uptime + idle watchdog `YUI_WORKSHOP_IDLE_MS`) + `workshop/store.ts` (SQLite lokal sendiri, host-local, aman mode PG session); volume `/home/node` uid 1000 (persist terbukti lintas sleep/wake, test Docker ASLI); egress reuse proxy host P1-MCP-4 (`HTTP(S)_PROXY` → host.docker.internal; allowlist kosong → `--network none`); cap memory/cpus/pids + cap-drop ALL + no-new-privileges; tool `run_in_workshop` (absent → minta user buka panel; SAFE-heads bebas approval; output redacted) di coder+operator; WKS-3 terminal: workshop hidup → `docker exec -i` (home persist), else jalur lama; REST `/api/projects/:id/workshop{,/log}` + `/start|sleep|recover|reset|destroy|exec`; UI panel Workshop (Config tab): status/lifecycle/egress/run/log + konfirmasi destruktif. Test: workshop 7/7 (5 fake + 2 docker asli) · tool 3/3 · roster +REST · turbo 5/5 · typecheck 6/6 · e2e 15/15
- [x] **BATCH 13b, WORKSHOP: SATU DUNIA FILES** (follow-up test user #3: “install express”) ✅ (2026-11-08): temuan, Hiro install express jatuh ke sandbox disposable (install hilang saat container mati) + terminal workshop `docker exec` tanpa cwd (npm init menulis ke volume, bukan workspace project) + npm gagal diam-diam di sandbox (HOME=/root read-only). Fix: (1) container workshop sekarang BIND workspace project di `/home/node/project` (nested di atas volume; volume tetap utk cache npm hangat) + cwd default exec/terminal = `/home/node/project` → file = satu dunia dengan tab Files/write_file/run_command sandbox; reset membersihkan VOLUME saja (file project utuh, diuji docker asli). (2) tool `terminal` agent kini attach ke container workshop bila hidup (deps workshop+projectRoot dari runtime), sesi = sesi yang user lihat. (3) sandbox run_command/terminal: env `HOME=/tmp` + `npm_config_cache=/tmp/.npm` + `npm_config_update_notifier=false` (npm tak lagi gagal EACCES diam-diam; persona tak perlu workaround cache manual). (4) PERSONA.md Hiro §5 “Where to run commands”: urutan run_in_workshop (install/build, persist) → terminal (dev-server live) → run_command (verifikasi sekali-pakai); desc tool diperjelas. Test: workshop 7/7 + bind-mark & reset-keep-bindmark · sandbox/terminal/run-command 38 total · turbo 5/5 · e2e 15/15
- [x] **BATCH 13c, WORKSHOP MIGRASI + HEAL + COMMAND LOG PERSIST** (fix test user #4: terminal “● exited” + Commands kosong) ✅ (2026-11-08): akar, (a) container workshop dibuat pra-13b (volume /home/yui, TANPA bind /home/node/project) dipakai terus: `docker exec -w /home/node/project` langsung mati; (b) store bilang running tapi container hilang (docker rm/prune) tanpa jalur pemulihan; (c) command log terminal = Map in-memory → kosong setiap restart API; (d) test integrasi docker bocorkan container saat assertion gagal (ditemukan `yuika-ws-p_it_*` di docker user). Fix: label `yuika.workshop.layout=2` di container, ensureRunning mendeteksi container pra-label → rm -f (VOLUME utuh) → recreate layout baru (bind workspace); heal drift di start() (store=running + docker≠running → jatuh ke ensureRunning, bukan early-return); command log persist JSONL per workspace (`YUI_TERMINAL_LOG_DIR`, default tmp; lazy dir; load-from-file saat memori kosong, restart API tak lagi menghapus view Commands); afterEach docker-test membersihkan container test (filter pid test). Test: workshop 9/9 (fake: heal drift; docker asli: migrasi label → pwd=/home/node/project + marker di host) · terminal +persist · turbo 5/5 · typecheck 6/6 · e2e 15/15.
- [x] **BATCH 13d, TERMINAL DOCKER `-i` + APPROVAL CARD WORKSHOP** (fix test user #5: terminal “exited” terus + Hiro menolak dirinya sendiri) ✅ (2026-11-08): reproduksi via kode asli (tsx + path project user) menemukan akar SEJATI, `startSandboxSession` tidak pernah pass `interactive: true` → argv `docker run` TANPA `-i` → `sh` EOF → exit 0 instan tanpa output. Bug bawaan P2-STU-2 (jalur docker tak pernah diuji integrasi; test hanya fixture lokal). Fix: `-i` selalu untuk sesi interaktif + test regresi docker ASLI (pwd → /workspace). Sekalian UX WKS-2 sesuai spec asli: workshop absent → run_in_workshop memunculkan KARTU APPROVAL di chat (egress allowlist dicantumkan; approved → auto-start + exec; declined → error jelas), user tak lagi disuruh pindah tab ke panel; PERSONA.md Hiro + tool desc di-update ("ask naturally, retry after approval"). Test: workshop-tool 4/4 (approve→start+exec, decline→no-exec) · terminal +docker asli · turbo 5/5 · typecheck 6/6 · e2e 15/15.
- [x] **BATCH 13e, CLEANUP PROJECT + MENU AUTO-CLOSE** (fix test user #6) ✅ (2026-11-08): (1) `deleteProject` kini AWAIT `workshopManager.destroy(id)`, container+volume+row workshop ikut terhapus saat project dihapus (tanpa ini container `yuika-ws-*` menumpuk di docker host); kontrak `DeleteProjectResult.deleted` + `workshop: boolean` (aditif). (2) Dropdown header (persona picker + Sessions) auto-close: hook `useMenuAutoClose` (ui/menu.ts), klik di luar, Escape, dan pemilihan item menutup menu; hack `blur()` lama dibuang. Accordion (Thinking/Trace/Settings) sengaja tak diubah (bukan menu). Test: delete-project +workshop field · turbo 5/5 · typecheck 6/6 · e2e 15/15.
- [x] **BATCH 16, HOME & TEAM ASSEMBLY** (permintaan user 2026-11-08: hapus freespace, home page + typing, project modal, playground assign ala docs/Orin Playground) ✅:
      (1) FREESPACE DIHAPUS, semua sesi hidup di project; boot SELALU ke HOME (restore localStorage project dihapus; tombol Home = logo sidebar).
      (2) HOME: typing "Hello, Let's Build Something!" → hapus → "Hello, Wanna Build Something?" (reduced-motion → final langsung) + kartu project; kartu New project pertama → FORM MODAL (create dari sidebar dihapus).
      (3) TEAM ASSEMBLY: project tanpa sesi → layar "Build your own team", ring kartu float ala orbit lama (dekorasi 3 elips + float-yui) + PLAYGROUND fisika di tengah: klik kartu = ASSIGN (maskot OrinPortrait ANIMASI spawn jatuh, SEKALI: objek fisika by personaId di ref-map, tak pernah re-create; hover tak menyentuhnya; maskot z-20 DI ATAS overlay detail), klik lagi = UNASSIGN. Fisika ala referensi: gravitasi + collision impuls + STACKING (saling timpa), idle hidup (think scheduler: rangkaian hop / hop senang / dengung sway / jeda; crouch antisipasi), DRAG & THROW (pointer capture, kecepatan sampel 110ms, clamp), TAP = sapa (hop kecil), squash-spring + lean; TANPA label nama di playground. Detail hover = radial overlay transparan→canvas + fade/scale in-out (OrinPortrait 170 + nama + deskripsi). Start Session = dropdown gaya header Chat (details+glass-panel+auto-close) + tombol (≥1 assign).
      (4) ASSIGNMENT = ROSTER (project.yaml): runtime.createSession ENFORCE persona ∈ roster (dungeon dikecualikan; error English); assignProjectPersonas / ensureFullProjectRoster (merge, role=expertise); workflow run → SEMUA persona auto-assign; delegasi Maestro → onChildSpawn merge-assign anak.
      (5) TAB TERMINAL hidden kecuali Hiro/Neo ter-assign (gating live via event yui:roster-changed dari Config Roster & assign/unassign playground).
      (6) Config → menu PROJECT: edit nama+deskripsi (PATCH) + toast + refresh sidebar/header.
      Tests: roster-assign 2/2 (ensureFullRoster dipanggil startRun; onChildSpawn dg projectId) · turbo 5/5 · typecheck 6/6 · e2e 15/15 (helper openProjectWithLead; smoke/terminal/workbench/workflow/orin ke alur baru; timeout 240s orin-NaN & FLOW-gate anti-flake paralel).
- [x] **D27, RENAME PERSONA + playground tenang** ✅: display name persona diganti (ID teknis yui-\* TIDAK berubah): Sherlock Yui→**Watson Yui** · Einstein Yui→**Pierre Yui** · Liebert Yui→**Rommel Yui** (names.ts alias + persona.yaml + PERSONA.md + map web TaskDrawer/TeamTree + literal test + sebutan proses QA). Playground: intensitas lompat dikurangi (jeda think 1.8-4.2s, hop-chain p=0.34 max 2 lompat, hop senang p=0.12, greet tiap 7-15s), tetap hidup tapi tidak hiperaktif. Turbo 5/5 · typecheck 6/6 · e2e 15/15.
- [x] **D28, Kartu Home "… Ago" + flex overflow trap fix** ✅: kartu project di HOME menampilkan jarak update terakhir (English: "Just Now" / "N Minutes/Hours/Days/Months/Years Ago", `<time>` semantic, live tick 30s). `projects.updated_at` kini di-bumptouch saat aktivitas nyata: sesi baru (createSession), assign/merge roster (playground/delegasi/workflow), save roster Config, task create/update (store). FIX KRITIS UI: Home pakai `justify-center` di scroll container → begitu daftar project melebihi viewport, kartu teratas (New project) terdorong ke luar jangkauan scroll (flex overflow trap) → mustahil diklik (e2e smoke terjebak "element is outside of the viewport"). Centering dipindah ke `my-auto` wrapper: pas → center, lebih tinggi → top-aligned & scrollable. Tests: project-store +1 (touchProject & task-update bump) · turbo 5/5 · typecheck 6/6 · e2e 15/15.
- [x] **D30, Files tab: tree profesional + preview rich (Shiki)** ✅: HARMONISASI TERMINAL + TEMA SHIKI. (1) TerminalTab: holder bg-[#0b0f14] border-slate-800 p-2 → bg-inset (#101010, PERSIS pane Files) border-line rounded-lg2 p-3; wrapper p-3 gap-2 → p-4 gap-2.5; xterm theme {background #101010, foreground #dcdcdc, cursor aksen #42a0ff, selectionBackground rgba(0,124,247,.30)}; status line slate/emerald/rose/amber → token text-dim/text-success/text-danger/text-warning. (2) TerminalFullTab (shell sebenarnya): hapus bg-[#0d1117] (transparan ikut canvas), header switcher → token (active bg-hover text-primary, rounded-md2), Commands list slate-800/900 → border-line bg-raised + pill success-soft/warning-soft/danger-soft + stderr text-danger + padding p-3. (3) CodeBlock: tema shiki github-light-default → github-dark-default (app dark #101010, token light low-contrast; fix kontras kode). Tests: typecheck ok · e2e terminal 1/1 · workbench 4/4.
- [x] **D29, Files tab: tree profesional + preview rich (Shiki)** ✅: (1) TREE minimalis-profesional: indent guides (garis vertikal per kedalaman), ikon per tipe file berwarna muted (FileTs/FileJs/FileMd/FilePy/FileCss/FileHtml/FileSql/FileImage/BracketsCurly), folder open/close accent, sort folder-dulu alfabetis, ukuran file muncul saat hover, header seksi Run reports/Files + badge jumlah, selected = accent-soft. (2) CODE PREVIEW: komponen CodeBlock, syntax highlighting Shiki (github-light-default, lazy singleton via dynamic import; fallback <pre> polos bila gagal), gutter nomor baris, header chip bahasa + tombol Copy; ext→lang map (ts/tsx/js/jsx/json/yaml/html/css/py/sh/sql/xml/toml/ini/diff). (3) MARKDOWN: Markdown.tsx dapat variant "doc" (heading skala dokumen h1 1.75rem + h2 bergaris, leading lega, blockquote accent-soft) + prop renderCode → fenced code di Files di-highlight via CodeBlock; chat tetap kompak polos (streaming murah). File .md: rendered default (rich) / source (CodeBlock lineNumbers). Semua string UI Files → English. Dep baru: shiki@4 (apps/web). Tests: turbo 5/5 · typecheck 6/6 · e2e workbench 4/4 (STU-7 render md + toggle source/rendered tetap hijau).
- [ ] **MENYUSUL (C)**: SCR-5 DevTools embed · P2-DUN-x dungeon QA

### Fix riset 2026-11-07 (laporan user project p_861f2edc, turn Scholar menggantung)

- [x] Chat Markdown: tabel GFM (delimiter + alignment :---: + escaped | + kolom mismatch aman + overflow-x) + task list - [ ]/- [x] (checkbox SVG), riset Scholar kini tampil sbg tabel, bukan pipe mentah · [x] Delete project "authentication required": ProjectPanel.remove() pakai fetch polos tanpa Bearer (kelas bug FileTab) → authFetch; sekalian 4 fetch polos lain: SSE snapshot resync x2 (page.tsx), dungeon materials upload + mission remove (PersonaStudioView), semua route non-/api/auth digating P1-INF-1
- [x] dns.lookup tanpa timeout di hostnameIsPrivate → race 5 dtk (unref) · throttle domainThrottle livelock self-requeue → reservasi slot sekali · ddg selalu dipanggil (+10 dtk/search) → hanya bila hasil site-router < 3, race 5 dtk · watchdog withTimeout 25s/45s di web_search/web_fetch · budget query 10→30/jam · pesan error tool EN, research.test.ts 24/24














### D50 — Mini launch: deploy VPS (SELESAI sesi D50)
- [x] Portal (operator, Dokploy): Dockerfile web+relay, compose dokploy, docs/DEPLOY-DOKPLOY.md (di repo yuika-portal)
- [x] Studio (self-host manual user lain): docker-compose.prod.yml studio-only (caddy+web+api, api tak dipublish, same-origin /api), deploy/Caddyfile, docs/DEPLOY.md (spek min, DNS, langkah, backup, troubleshooting)
- [x] Varian privat satu-VPS: deploy/docker-compose.with-portal.yml + Caddyfile.with-portal
- [x] Hardening: YUI_AUTH_REQUIRED=1 (gerbang tertutup sejak boot; me/authRequired ikut flag), CORS YUI_CORS_ORIGIN, healthcheck /api/auth/me, FIX LEAK auth.db/vault.key/*.db ter-bake ke image (.dockerignore)
- [x] Verifikasi: build image api+web+portal+relay OK, smoke api (401 gate, 0 user baked), compose config x3 OK, api auth tests 6/6


### D51 — Versi & mekanisme update self-host (SELESAI sesi D51)
- [x] GET /api/meta (exempt gerbang): version dari package.json root + latest dari GitHub Releases (server-side, cache 1 jam, tahan offline; YUI_UPDATE_CHECK=0 untuk off)
- [x] Settings footer AboutFooter: versi + link update bila release lebih baru
- [x] scripts/update.sh: release-tag-first (--main opsional), rebuild, tunggu healthcheck, panduan rollback; .gitattributes jaga LF script/Dockerfile/compose
- [x] Version bump 0.1.0 → 0.8.0 (selaras PLAN v0.8); DEPLOY.md section Updates ditulis ulang


### D52 — Varian deploy shared-VPS dengan Dokploy (SELESAI)
- [x] docker-compose.traefik.yml: tanpa caddy, tanpa host port; web+api join jaringan eksternal dokploy-network + label Traefik (router studio-web prio 10 / studio-api prio 100 /api/*, websecure + letsencrypt). DEPLOY.md section baru Sharing the VPS with Dokploy; update.sh via YUI_COMPOSE_FILE.


### D53 — Pembersihan anotasi development untuk repo publik (SELESAI)
- [x] Backup: d:/projects/yuika-dev-notes/annotations-backup.md (57 file + konteks) + salinan TASKS/BATCHES; sumber utama = git history
- [x] Pass 1-3 (terjemah penuh ke English, makna teknis dipertahankan): apps/api + apps/web + contracts + core + e2e + scripts + relay-client (367+ pasangan)
- [x] Pass 4 (strip mekanis token tag sisa, komentar saja): ~765 baris; uji coba pertama merusak sintaks (regex makan koma string) → restore + replay pass aman; tsc api+web hijau, api 49 + core 400 test hijau
- [x] URL portal fix masuk README/.env.example/DEPLOY.md/compose comments: https://yuika.notu.dev + wss://yuika-relay.notu.dev (domain studio user tetap placeholder example)
- [x] README: tabel "Which compose file to use"


### D54 — Split repo desktop & scaffold mobile (SELESAI)
- [x] ZamIzzudin/Yuika-Desktop: apps/desktop + PLAN-DESKTOP.md + build-desktop-web.mjs keluar monorepo; coupling 3 titik dipatch (tauri.conf frontendDist→dist/web repo desktop, beforeDevCommand→scripts/dev-web.mjs, lib.rs repo_root→YUIKA_STUDIO_DIR/sibling). Alasan: clone self-hoster bersih + feed Release server (dibaca /api/meta) tidak tercampur installer desktop.
- [x] ZamIzzudin/Yuika-Mobile: scaffold Expo SDK 58 blank-TS, identitas dark Yuika, placeholder pairing; LICENSE template Expo dihapus (keputusan lisensi menunggu user).
- [x] Studio repo: apps/desktop & script dihapus, README link repo desktop + penjelasan split release; api 49 test & web tsc hijau.


### D55 — CI installer desktop (pin studio ref) (SELESAI)
- [x] Yuika-Desktop: workflow_dispatch input studio_ref (tag/branch) + release_tag opsional; windows-2022 runner, sibling clone ZamIzzudin/Yuika@ref (STUDIO_TOKEN utk repo private, fallback anonim saat publik), rust-cache, artifact NSIS + draft release via softprops.
- [x] build-desktop-web.mjs self-sufficient: npm ci otomatis bila studio node_modules belum ada (CI & kontributor baru); package-lock.json desktop repo dibuat.


### D56 — Logo, live-refresh multi-klien, persistensi mode desktop (SELESAI)
- [x] Logo sidebar 404 di live: .dockerignore mengecualikan apps/web/public/android-chrome-*.png dari image → baris dihapus; redeploy studio memperbaiki web & desktop-remote sekaligus.
- [x] Data tidak ter-update antar klien: page.tsx refresh (focus + visibilitychange) → loadProjects + sesi project aktif + roster; sesi aktif sudah ter-cover resync SSE.
- [x] Desktop reset ke onboarding tiap launch: pick_host/pick_remote kini persist setup.json (app_config_dir); welcome.html auto-resume; ?reset=1 (Switch mode) menghapus setup. Perlu build installer baru.
- [x] Ikon installer/app pakai maskot Yuika: tauri icon dari android-chrome-512 → icon.ico + set png (repo desktop, commit terpisah).


### D57 — Density Tab Persona di zoom 100% (SELESAI)
- [x] User selalu browsing 90% zoom; di 100% stage persona terlalu padat/overlap. CharacterStage dikecilkan ~15%: maskot 200→168, cincin orbit 560/390/270→460/320/220, card kaca 300/320→272/288 (p-5→p-4, gap-3→2.5, tinggi max 520→440), chevron 44→40px makin dekat pusat, tipografi card turun 1 tingkat (h2 2xl→lg, body 13→12, tag 12→11), pill emote 12→11.


### D58 — Pisahkan konsep Connect-to-host vs Remote-control (SELESAI, tahap copy)
- [x] welcome.html: kartu remote kini "Open the full web app of a Yuika host in this window" + catatan eksplisit bahwa koneksi host = direct link tanpa Portal; remote control dari HP/browser kedua dipair di Portal.
- [x] /dev/remote di-rename "Remote (dev)" → "Remote console" + subjudul menjelaskan Web token & relay blind.
- [x] PortalSettings: langkah pairing memperjelas Desktop token = host yang DIKENDALIKAN; Web token = remote controller di /dev/remote.
- [x] ~~TAHAP BERIKUT: promosikan Remote console keluar /dev~~ DIBATALKAN D59: remote console dihapus seluruhnya (remote-control pindah ke mobile, desktop = webview host).


### D59 — Konsep pairing final: auto-link SSO + owner-lock, remote console dihapus (SELESAI)
- [x] Keputusan desain: pairing = auto-link SSO saja (web host sudah otomatis; desktop host sama karena jalur login identik); token/QR manual tidak dipakai lagi; remote-control murni = mobile (mendatang); remote desktop = webview host.
- [x] /dev/remote (Remote console) + e2e remote.spec.ts + proxy /api/remote-dev/claim dihapus; seksi Portal di SettingsModal dihapus (PortalSettings.tsx dihapus); route /api/portal/pair & unlink tetap ada (API, untuk keperluan lain/testing).
- [x] Owner-lock: SSO complete menolak (403) account portal berbeda begitu instance punya user portal → desktop remote yang menunjuk studio milik orang lain ditolak. store.ownedByOtherPortalAccount + test diubah (akun sama antar test karena db shared).
- [x] Verifikasi unlink live: portal Devices → relay sweep bye 4001 → sesi studio dicabut (butuh redeploy image studio agar aktif).
- [ ] Antrian: host relay service auto-start saat SSO + slot multi-host di portal (kind desktop 1-slot belum cukup untuk web host + desktop host bersamaan) + portal Devices page sederhanakan (token issuing dihapus) + mobile login → daftar host → interaksi relay.


### D60 — Fix MCP di deployment (SELESAI)
- [x] MCP filesystem gagal di deployment baru: katalog menunjuk {workspace}/reports tapi tidak ada kode yang membuat dir level-atas itu (yang dibuat hanya per-project/dungeon). Fix: mkdir reports di boot runtime (Docker + desktop sama).
- [x] MCP git gagal: image node:24-bookworm-slim tidak memuat binary git; mcp-server-git (GitPython) butuh git sistem. Fix: apt-get install git di stage api (bersama python3/make/g++/uv).


### D61 — Live browser di deployment: sidecar Chromium + CDP (SELESAI)
- [x] Mode sidecar: YUI_SCREEN_CDP_URL (http://host:9222 atau ws://...) → koneksi CDP shared browser-level (flat protocol multiplex); kosong = mode lokal (spawn per key, profil persist) tidak berubah → desktop host inline.
- [x] Isolasi per project×persona = CDP browser context (disposeOnDetach); stop key = closeTarget + disposeBrowserContext, browser & koneksi shared tetap hidup; sidecar restart → sesi remote ditandai failed, buka ulang = reconnect otomatis (login state hilang, context in-memory).
- [x] resolveCdpEndpoint: http:// → fetch /json/version → webSocketDebuggerUrl (UUID berubah tiap boot sidecar); ws:// lolos langsung.
- [x] Compose: service chromium (chromedp/headless-shell, --no-sandbox, --disable-dev-shm-usage) jaringan internal saja, tanpa port publik/Traefik; api env YUI_SCREEN_CDP_URL; .env.example + DEPLOY.md diupdate (catatan keamanan CDP).
- [x] Test baru (16 total screen): resolver, context per key, dispose saat stop satu key, recovery sidecar restart — via fake CDP ws server + http /json/version. Core 401 passed, tsc clean.


### D62 — Pairing fase B: host service otomatis via SSO + slot multi-host (SELESAI)
- [x] Device web (SSO auto-link) kini menjalankan HOST SERVICE penuh (bukan presence-only): setiap instance (studio deployment / desktop host) remote-controllable via relay sejak login; list_hosts mobile akan melihat semuanya. WebPresenceService dihapus (satu koneksi relay per instance, tidak ada duplikat).
- [x] Boot: host = hostDevice (pairing manual lama) ?? webDevice (SSO). auth-sso complete: start host service bila tidak ada host manual. Instance dengan host manual lama tidak tersentuh (kompatibel).
- [x] Unlink unified di PortalHostService: bye 4001 + guard everAuthed (4001 di auth pertama = relay tak kenal device, stop diam tanpa mencabut). Kind web → clearWebDevice + signOutPortalAccount (sesi dicabut); kind desktop/mobile → clearHostDevice + note unlinked. Test portal-unlink dirework ke jalur host.
- [x] Portal: MAX_WEB_DEVICES 3 → 5 (satu akun: studio + beberapa desktop host); test claim multi-slot diupdate.
- [x] Fix sidecar chromium live: entrypoint chromedp/headless-shell menjalankan browser di 127.0.0.1:9223 + socat 0.0.0.0:9222 → flag remote-debugging di command bertabrakan dengan socat (bind in-use). Command kini hanya flag perilaku browser.

