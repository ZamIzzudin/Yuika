# Rancangan: Workshop Persisten · Live Screen & Take Control · Vault Kredensial

> **Status: DISETUJUI SEBAGIAN (2026-11)**, putusan user: **A (Vault v0 · Batch 12) dan
> B (Live Screen · Batch 14a) DISETUJUI dieksekusi; C MENYUSUL; D DITOLAK SEMUA.**
> Revisi desain dari review (masuk PLAN v0.8 D24–D27): fallback tanpa-Docker = kelas satu
> (Docker absen di mesin dev user); slicing v0 (vault = api_key+command; screen = Scholar +
> user takeover); fill_login menyusul + related-origins (SSO) + scrub hidden field di SEMUA
> run scope (rokazo hanya per-bot); lease takeover = pola fence + max-wait bound; profil
> browser dikecualikan dari tab Files. Sumber benchmark asli: `D:\projects\rokazo`.
>
> ~~Status: RANCANGAN v1~~, disusun dari riset benchmark **Rakazo** (`D:\projects\rakazo`,
> open source, Apache-2.0) terhadap arsitektur Yuika yang berjalan (2026-11).
> Dokumen ini = sumber kebenaran **usulan**; belum mengubah PLAN.md/TASKS.md/BATCHES.md.
> Ditujukan untuk sesi development berikutnya: pahami §1–§3 (konsep), eksekusi amandemen
> di §4 (dampak ke plan), dan minta persetujuan user atas keputusan D24–D27 (§5).
>
> **Asal-usul konsep** (adaptasi, bukan salinan, Rakazo ditolak di bagian yang
> bertabrakan dengan ekosistem tertutup D4 / model Portal D23):
>
> - _Workshop_ ← Rakazo "Computer" (Team/Private), dipangkas: tanpa browser-identity
>   sharing lintas bot, tanpa desktop grafis penuh.
> - _Live Screen + Take Control_ ← Rakazo "Agent computer / Take control / request_takeover"
>   , digabung dengan rencana Live Browser sendiri (PLAN-RESEARCH-LIVE-BROWSER.md).
> - _Vault_ ← Rakazo "Reusable credentials", dipangkas: tanpa kartu pembayaran,
>   tanpa spending limit; ditambah model **sharing lintas persona** milik Yuika.
> - **Tidak diadopsi dari Rakazo**: payment cards, messaging apps (D4), spaces
>   multi-user (D23), memory provider pihak ketiga (tetap sesuai PLAN §4.7).

---

## Daftar Isi

1. [Konsep A, Workshop (persisten) vs Sandbox (disposable)](#1-konsep-a)
2. [Konsep B, Live Screen + Take Control (Scholar & Sherlock)](#2-konsep-b)
3. [Konsep C, Vault & Sharing Kredensial](#3-konsep-c)
4. [Analisis Dampak ke PLAN.md / TASKS.md / BATCHES.md / dokumen lain](#4-analisis-dampak)
5. [Draft Keputusan D24–D27 (untuk persetujuan user)](#5-draft-keputusan)
6. [Risiko baru & mitigasi](#6-risiko)

---

## 0. Ringkasan eksekutif

| Konsep                            | Satu kalimat                                                                                                                                                                                                         | Keputusan            | Task group                      | Batch usulan |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------- | ------------ |
| **A. Workshop**                   | Kelas eksekusi kedua: container project yang **menetap** (volume persist, tidur/bangun, egress allowlist) sebagai rumah kerja persona, sandbox disposable tetap untuk eksekusi tak dipercaya                         | D24                  | `P2-WKS-*`                      | Batch 13     |
| **B. Live Screen & Take Control** | Viewport Chromium hidup milik **sesi persona** (Scholar riset / Sherlock QA) yang di-stream ke user + ambil alih dua arah (user takeover, persona `request_takeover`), unifikasi dengan rencana Live Browser LB-1..3 | D25 + D26 (Sherlock) | `P2-SCR-*` + `P1-PER-8`         | Batch 14     |
| **C. Vault**                      | Kredensial user (API key, login website, command variable) tersimpan terenkripsi, **tidak pernah masuk konteks model**, di-inject backend, dengan model **sharing lintas persona × project**                         | D27                  | `P2-VLT-*` (supersede P2-AGT-5) | Batch 12     |

**Urutan rekomendasi:** Batch 12 (Vault, independen) → Batch 14a (screen core + Scholar,
profil browser di direktori project, tidak menunggu workshop) → Batch 13 (Workshop) →
Batch 14b (Sherlock QA + integrasi workshop). Rincian di [§4.5](#45-graf-ketergantungan--urutan).

**Kenapa ketiganya satu paket:** Vault men-supply login untuk riset authenticated Scholar
(sudah ada keputusan "authenticated preview research" di PLAN-RESEARCH-LIVE-BROWSER §4
LB-2); Workshop men-supply rumah persist untuk profil browser & command variables;
Live Screen adalah wajah dari ketiganya. Sherlock (QA) adalah konsumen paling menarang:
**user menyaksikan persona menjalankan test fungsional di browser, live.**

---

## 1. Konsep A

# Workshop (persisten) vs Sandbox (disposable)

### 1.1 Masalah yang diselesaikan

Sandbox hari ini (`P0-SEC-1`, `tools/sandbox.ts`) dirancang untuk **eksekusi tidak
dipercaya**: `--rm --network none --read-only --tmpfs /tmp:rw,noexec`, cap
512MB/1CPU/128 pids, timeout keras. Sempurna untuk "jalankan script ini sekali".

Tapi persona yang **bekerja di project** butuh kebalikannya:

- `npm install` 200 paket → hilang saat container dibuang → install ulang tiap turn
  (lambat + boros token metering).
- Tools yang dipasang persona (playwright, jq, CLI klien) tidak menetap.
- Login browser riset Scholar (keputusan authenticated research di LB-2) hilang tiap run.
- Terminal per-project (P2-STU-2) sudah setengah-jadi "workshop", session persist,
  egress proxy, tapi masih container ad-hoc yang hilang saat restart.

**Workshop = kelas eksekusi kedua dengan threat model berbeda.** Bukan mengganti
sandbox; keduanya hidup berdampingan dan dipilih per tool-call.

### 1.2 Definisi dua kelas eksekusi

| Properti     | **Sandbox** (ada)                             | **Workshop** (usulan)                                                                                                                                                                         |
| ------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tujuan       | Eksekusi kode/CLI tak dipercaya, sekali jalan | Rumah kerja persona dalam satu project                                                                                                                                                        |
| Umur         | Sekali pakai (`docker --rm`)                  | Menetap selama project hidup; **tidur** saat idle, **bangun** on-demand                                                                                                                       |
| Persistence  | Tidak ada (tmpfs saja)                        | **Volume docker** `yui-ws-<projectId>-home` → mount `/home/yui` (rw)                                                                                                                          |
| Network      | `--network none` (deny total)                 | Default-deny + **egress allowlist** via proxy host (reuse `tools/egress.ts` pola P1-MCP-4)                                                                                                    |
| Filesystem   | `--read-only` + tmpfs noexec                  | Rootfs read-only; `/home/yui` rw (perlu exec utk binary terinstall, lihat §1.9 Q1)                                                                                                            |
| Resource     | 512MB / 1 CPU / 128 pids / timeout keras      | Lebih longgar (default 2GB / 2 CPU / 512 pids), tanpa timeout per-perintah, tapi **idle sleep** (default 10 mnt)                                                                              |
| Isolasi      | Maksimal: cap-drop ALL, no-new-privileges     | Tetap cap-drop ALL + no-new-privileges + pids-limit; bedanya volume & egress terkurasi                                                                                                        |
| Approval     | Per perintah berisiko (defense-in-depth)      | **Sekali saat workshop pertama kali dibuka per project** (kartu khusus: "Persona X meminta meja kerja persisten di project Y") + kelas risiko per perintah (pola SAFE list terminal sekarang) |
| Metering     | Token LLM saja                                | Token LLM + **uptime workshop** (`workshop.wake/sleep` event; jam aktif dihitung, dasar credits D3)                                                                                           |
| Dipakai oleh | `run_command` anonim                          | Persona yang bekerja di project (terminal, install tools, test suite, build)                                                                                                                  |
| Kegagalan    | Container mati = hasil command tetap tercatat | Workshop rusak → **Recover** (recreate container, volume utuh) / **Reset** (kembali ke checkpoint terakhir, lihat §1.4)                                                                       |

Prinsip kunci (warisan filosofi Rakazo yang layak dipertahankan): _computer is durable
state, sandbox is a blast radius_. Yuika versinya: **"persona pulang ke meja kerjanya,
bukan membangun tenda baru tiap hari."**

### 1.3 Workshop milik siapa? (keputusan penting)

**Workshop milik PROJECT (bukan persona)**, 1 project = ≤1 workshop, semua persona
yang bekerja di project itu berbagi workshop (files, tools terinstall). Ini selaras
D14 (project = entitas first-class) dan lebih sederhana dari Rakazo (Team vs Private
Computer per bot).

Isolasi antar-persona DALAM workshop: **tidak ada** di v0 (mereka satu tim di satu
project, setara "Team Computer" Rakazo). Private workshop per persona = eksplisit
ditunda (§1.9 Q2), baru relevan kalau muncul kasus persona dengan kredensial rahasia
yang tak boleh terlihat persona lain.

Konsekuensi desain yang HARUS jujur di-dokumentasi: **apa yang ada di workshop
workshop itu shared**, termasuk command variables (Vault §3.6) yang di-export ke
workshop env terlihat oleh semua persona di project itu. Kredensial login website
TIDAK ikut workshop (hidup di vault + profil browser per persona, §2.4).

### 1.4 Lifecycle workshop

```
                   ┌────────────────────────────────────────────┐
                   │  ABSENT (belum pernah dibuat)              │
                   └───────────────┬────────────────────────────┘
                                   │ toolbutuh workshop / user klik "Mulai workshop"
                                   ▼kartu approval pertama kali
                   ┌────────────────────────────────────────────┐
        recover ──▶│  RUNNING                                    │
                   │  container up + volume mounted              │
                   └───┬───────────────┬────────────────────────┘
             idle > N │               │ user Stop / project ditutup
                       ▼               ▼
                   ┌────────┐    ┌──────────────┐
                   │ ASLEEP │    │ STOPPED      │
                   │ (volume│    │ (volume tetap│
                   │  tetap)│    │  ada)        │
                   └───┬────┘    └──────────────┘
                       │ toolbutuh lagi (wake, tanpa approval ulang)
                       └──▶ RUNNING
```

- **Wake** = `docker start` container lama (bukan recreate), state utuh, < 2 dtk.
- **Sleep** = `docker stop` (default idle 10 mnt; env `YUI_WORKSHOP_IDLE_MIN`).
  Volume TIDAK dihapus. Uptime metering berhenti.
- **Checkpoint** (opsional v1): `docker commit` → image snapshot `yui-ws-<pid>-ckpt`
  sebelum operasi destruktif besar (reset toolchain), basis tombol **Reset**.
  Rakazo menyebutnya "saved workspace". Est: kecil, tapi jangan blokir v0.
- **Recover**: container corrupt → hapus container, buat baru dengan volume lama.
- **Destroy**: hanya eksplisit dari UI (dengan konfirmasi) atau hapus project.

Semua transisi = event `workshop.state` (aditif ke YuiEvent, replay-able, pola
`terminal.*`/`delegation.*` sekarang), jadi board/UI mobile tetap konsisten pasca-restart.

### 1.5 Model data & kontrak (aditif)

```ts
// packages/contracts/src/workshop.ts (baru), zod, pola contracts lama
WorkshopState    = "absent" | "starting" | "running" | "asleep" | "stopped" | "error"
WorkshopInfo     = { projectId, state, containerName, volumeName,
                     createdAt, lastWakeAt, lastSleepAt, egressAllow: string[],
                     resourceCap: { memory, cpus, pids } }
// REST aditif
GET    /api/projects/:id/workshop              → WorkshopInfo
POST   /api/projects/:id/workshop/start|stop|recover|reset|destroy
GET    /api/projects/:id/workshop/log          → ring log (pola terminal)
// event YuiEvent aditif
workshop.state { projectId, from, to, reason }
workshop.command { projectId, by: "user"|"agent"|"persona:<id>", cmd }   // audit
```

- Registry workshop = tabel SQLite `workshops(project_id PK, container_name, volume_name,
state, egress_allow JSON, created_at, …)` di db runtime (pola `approvals`/`delegation_jobs`).
- Egress allowlist default per project: `["registry.npmjs.org", "github.com",
"objects.githubusercontent.com", "api.github.com"]` + editable via UI project settings
  (pola `.yuika/browser.json` → `.yuika/workshop.json`).
- **Terminal migrasi**: TerminalManager (satu sesi per project) backend-nya menjadi
  `docker exec` ke container workshop, user & agent tetap share sesi terminal yang sama
  (perilaku P2-STU-2 dipertahankan, hanya rumahnya berubah).

### 1.6 Keamanan & threat model (delta dari sandbox)

1. **Egress terkurati, bukan internet bebas.** Semua trafik lewat proxy allowlist host
   (pola `tools/egress.ts`, SNI/host match). Domain baru = ubah `.yuika/workshop.json`
   (kartu approval ringan, sekali). Ini perbedaan kunci dari Rakazo (internet penuh).
2. **Volume bukan wild-west:** cap ukuran volume (default 5 GB, env `YUI_WORKSHOP_VOLUME_GB`);
   yang menetap hanya `/home/yui`. Workspace file project tetap di host (mount read-only
   copy-on-write?, v0: workspace TIDAK dimount ke workshop; pertukaran file lewat tool
   `file tools` biasa + perintah tar di PTY. Sederhana, dan path policy P0-SEC-3 tak berubah).
3. **Persona ≠ root:** container jalan user non-root `yui` (uid 1000). `--cap-drop ALL`,
   `--security-opt no-new-privileges`, `--pids-limit` tetap.
4. **Approval dua lapis:** (a) kartu pembukaan workshop (sekali per project, alasan +
   daftar egress awal), (b) perintah destruktif dalam PTY tetap lewat kelas risiko
   terminal (SAFE list → auto; publish/rm/curl → kartu).
5. **Audit:** setiap perintah agent di workshop → `workshop.command` event + Commands log
   (pola terminal manager sekarang), oleh persona SIAPA (persona-first!).
6. **Metering:** `workshop.wake/sleep` + total jam aktif per project per bulan → panel
   Metering (D3 credits; self-host = info saja).

### 1.7 Titik pijak kode hari ini (bukan bangun dari nol)

| Kebutuhan                                        | Sudah ada | Lokasi                                                      |
| ------------------------------------------------ | --------- | ----------------------------------------------------------- |
| Spawn container + cap + read-only + tmpfs        | ✅        | `core/src/tools/sandbox.ts` (`sandboxArgv`)                 |
| Egress allowlist proxy                           | ✅        | `core/src/tools/egress.ts` (P1-MCP-4)                       |
| Sesi persist + ring log + REST/WS + Commands log | ✅        | `core/src/terminal/manager.ts`                              |
| Tabel persist + boot-heal pola                   | ✅        | `approvals`, `delegation_jobs`, `delegation/runner.ts` heal |
| Event aditif + replay                            | ✅        | `contracts/src/events.ts`, bus, SSE `?since=`               |
| Approval engine + "Setujui & ingat" persist      | ✅        | `core/src/approval/engine.ts`, P0-DATA-3                    |
| Docker compose + volume pattern                  | ✅        | `Dockerfile`, `docker-compose.yml`                          |

Baru yang benar-benar baru: manajemen **volume persist + lifecycle tidur/bangun**,
tabel `workshops`, kontrak/REST/event workshop, kartu approval pembukaan, panel UI.

### 1.8 Yang TIDAK diambil dari Rakazo

- **Browser identity sharing lintas bot** (login di satu bot terbawa ke semua),
  diganti profil browser **per persona** di dalam project (§2.4), lebih sesuai
  persona-first dan lebih aman.
- **Desktop grafis penuh** (X/VNC, aplikasi GUI), Yuika butuh browser + terminal,
  bukan desktop. Out of scope.
- **Computer provider cloud** (E2B/Daytona/Boat/CreateOS), Yuika self-host Docker dulu;
  interface `WorkshopHost` disiapin tipis supaya provider cloud bisa nempel nanti.

### 1.9 Pertanyaan terbuka (untuk user / sesi berikutnya)

- **Q1, exec di volume home?** Install binary butuh exec. Opsi: (a) `/home/yui` rw+exec
  (praktis, risiko: malware persist, mitigasi egress+cap+antivirus manual),
  (b) rw tapi `noexec` + binari lewat wrapper (aman, nyebelin). **Rekomendasi: (a) di v0**
  dengan egress ketat; (b) jadi hardening option `YUI_WORKSHOP_NOEXEC=1`.
- **Q2, private workshop per persona?** Defer. Catat di §12 terbuka PLAN.
- **Q3, workshop di mesin tanpa Docker?** Fallback: direktori workspace `.workshop/`
  di host + shell lokal (setara terminal fallback sekarang, warning "TANPA isolasi").

---

## 2. Konsep B

# Live Screen + Take Control, untuk Scholar & Sherlock

### 2.1 Posisi terhadap rencana Live Browser (LB)

`docs/PLAN-RESEARCH-LIVE-BROWSER.md` (Batch 8 · LB-1/2/3, status usulan) sudah
merancang: process manager, Chromium headless + CDP, screencast WS, input relay,
agent shared-session + takeover, DevTools embed, untuk **tab Browser project**
(dev preview Coder).

Rancangan ini **me-generalisasi LB** menjadi satu layanan yang sama,
**Screen Runtime**, dengan TIGA konsumen:

| Konsumen                                  | Browser milik siapa        | Profil                         | Tujuan                                            |
| ----------------------------------------- | -------------------------- | ------------------------------ | ------------------------------------------------- |
| **Tab Preview project** (= LB-1..3)       | Project                    | `.yuika/preview-profile/`      | Coder verifikasi dev server                       |
| **Screen Scholar** (baru, prioritas user) | Sesi persona Scholar       | `.yuika/browser/yui-scholar/`  | Riset authenticated, user menonton/mengambil alih |
| **Screen Sherlock** (baru)                | Sesi persona Sherlock (QA) | `.yuika/browser/yui-sherlock/` | Test fungsional live, "teater QA"                 |

Satu infrastruktur (screencast, input, CDP proxy, takeover mutex), tiga pintu.
LB-1..3 TIDAK dibuang, menjadi SCR-1..3 di bawah + amandemen penomoran batch (§4.3).

### 2.2 Arsitektur Screen Runtime

```
┌─ apps/web ──────────────────────────────────────────────────────┐
│  Tab Browser (Live) ── canvas JPEG frames ◀── WS screencast ──┐ │
│  chip: "Scholar mengendalikan" / "KAMU mengendalikan"          │ │
│  input mouse/key/scroll/URL bar ── WS input ──────────────────┐│ │
└───────────────────────────────────────────────────────────────││─┘
┌─ apps/api ─────────────────────────────────────────────────────││─┐
│  routes/screen.ts  (auth yuika.auth.token / portal; pola WS    ││ │
│  terminal sekarang: projectId + personaId dicek per frame) ◀───┘│ │
│  ▸ Kontrol LEASE (mutex 1 pengendali: user ↔ persona)           │ │
│  ▸ Takeover policy + request_takeover cards (→ approval engine)  │ │
└──────────────────────────────┬───────────────────────────────────┘─┘
┌─ packages/core ──────────────▼─────────────────────────────────────┐
│  screen/manager.ts (pola terminal/manager.ts):                    │
│   - launch chromium (playwright-core, headless, CDP 127.0.0.1)     │
│   - binary: YUI_BROWSER_EXEC → playwright cache → Chrome/Edge      │
│   - Page.startScreencast (JPEG q60; idle ≤2fps, aktif ≤15fps)      │
│   - Input.dispatch* (mouse/key/scroll) + setDeviceMetricsOverride  │
│   - profil persist per (project, persona), lazy start, idle kill  │
│   - browser_* tools untuk agent (connectOverCDP, sesi YANG SAMA)   │
└────────────────────────────────────────────────────────────────────┘
```

Prinsip keamanan LB §5 tetap 100% berlaku: CDP hanya 127.0.0.1, semua klien lewat
proxy api dengan auth, halaman = data bukan instruksi (PERSONA note), konten hanya
ke sesi project+persona yang sama.

### 2.3 Take Control, dua arah (inti konsep)

**Lease tunggal:** pada satu waktu, satu browser dikendalikan OLEH SATU pihak,
user ATAU persona. Transisi:

1. **User takeover (proaktif):** tombol "Ambil alih" → chip "KAMU mengendalikan";
   tool `browser_*` persona berikutnya **yield** (menunggu, tanpa error) sampai
   user menekan "Serahkan kembali". Pola ini sudah dirancang LB-2, dipertahankan.
2. **Persona minta bantuan (`request_takeover`), BARU, dari Rakazo:**
   Persona menabrak hal yang hanya manusia bisa: CAPTCHA, OTP SMS, login manual
   pertama, konfirmasi 2FA. Persona memanggil tool `request_takeover(reason)`,
   dijalankan lewat approval engine → **kartu non-blocking** muncul di chat
   (prinsip Rakazo yang diadopsi: _kartu tidak pernah memblokir chat_):
   `🔍 Sherlock butuh kamu: verifikasi captcha di example.com` [Ambil alih] [Lewati].
   - User klik → lease pindah ke user; persona idle-menunggu (state persona
     `awaiting_input`, ekspresi Orin sudah ada!).
   - User selesai → "Selesai" → lease kembali ke persona → turn lanjut.
   - "Lewati" → persona melanjutkan tanpa langkah itu (best-effort).
   - Deadline + auto-skip (pola expire P0-SEC-4) supaya turn tidak menggantung.
3. **Sinkronisasi via Portal (remote):** kartu `request_takeover` = RemoteAction
   aditif, user bisa approve + bahkan **menonton screen read-only dari mobile**
   (v1: frame saja tanpa input; input remote = v2). Lihat §2.7.

### 2.4 Scholar: riset authenticated (prioritas user)

Keputusan "authenticated preview research" di LB-2 (2026-11) menjadi kelas satu:

- **Profil browser persist per project×persona** (`.yuika/browser/yui-scholar/`):
  login user sekali (via takeover atau vault fill §3.6) → cookie/session menetap →
  Scholar membaca halaman authenticated (hasil search, feed, balasan) di run berikutnya.
- **Jalur jujur untuk platform tertutup** (X/Threads/dll), menggantikan gagalan
  scraping; read-only by default; rate dibatasi budget riset (reuse `research/budget.ts`).
- User **menonton** riset berjalan: tab Browser menampilkan screen Scholar
  (mode Live), riwayat kunjungan tetap tercatat (`browser_visits`, STU-4).
- Halaman = data, bukan instruksi: catatan prompt-injection sudah ada di PERSONA
  scholar, diperkuat + skill `web-research` di-update.

### 2.5 Sherlock, persona QA, roster ke-9 (baru)

> **Catatan penamaan (penting untuk PLAN §7.4):** tabel roster lama mencantumkan
> "Sherlock Yui = domain data", posisi itu sudah terisi persona **Analyst**
> (roster D9 final: conductor, coder, scholar, scribe, analyst, operator, designer,
> planner). Nama "Sherlock" TIDAK terpakai di implementasi → **dibebaskan untuk
> persona QA**. Tema detektif justru pass banget: _mendeteksi, menginvestigasi,
> membuktikan_. Ini harus dicatat sebagai amandemen §7.4 (§4.1).

**Yui Sherlock (QA & Verifikasi), draft manifest:**

```yaml
id: yui-sherlock
name: "Sherlock Yui"
version: 0.1.0
expertise: quality-assurance
tags: [testing, qa, verification, debugging]
description: "QA specialist: functional testing, bug reproduction, regression checks."
model:
  primary: { quality: high }
  aux: { quality: low }
memory:
  domain: quality-assurance
  learn: true
# toolsets: browser_* (screen), todo_*, doc-tools (laporan), session-search
# delegation.yaml: spawnable_by [user, yui-conductor, yui-planner];
#                  can_spawn: [] (leaf worker, selesai investigasi, lapor)
# bentuk Orin: pakai shape yang belum terpakai (lihat core/personas/shapes.ts)
```

- **PERSONA.md (kepribadian detektif):** obsesi reproduksi ("bug yang tak bisa
  direproduksi adalah rumor"), metode: reproduce → isolate → verify fix → regression
  checklist; melaporkan dengan bukti (screenshot, langkah, log); tidak menuduh
  (menyalahkan kode, bukan orang); menuntut acceptance criteria jelas dari Planner
  (sinergi P2-PM-3: tiap task punya acceptance[] → Sherlock yang memverifikasi).
- **Skill seeds:** `functional-testing-basics`, `bug-reproduction`, `regression-checklist`
  (pola skill seed persona lain).
- **Dungeon (D20):** misi tipe **praktik**, QA app demo dengan bug ter-seed;
  lulus = skill `tested→ready`; blind test evaluator existing (`dungeon/eval.ts`).
- **Workflow (D15/D22):** fase `testing` template 7 fase PUNYA OWNER RESMI.
  Metrik keluaran fase testing (P2-PM-4): "laporan QA: N kasus lulus/gagal,
  bukti screenshot, daftar blocker". Conductor delegasi fase testing → Sherlock.
- **Growth:** turn QA + misi dungeon → level (sistem growth existing).

### 2.6 "Saya bisa menyaksikan dia melakukan testnya", alur watch mode

1. Run workflow fase `testing` (atau chat langsung: "Sherlock, QA aplikasinya").
2. Sherlock buka screen (`browser_open` ke dev server preview, sinergi LB-1:
   process manager sudah jalanin dev server).
3. User buka tab Browser → pilih **Screen: Sherlock** → melihat live: klik tombol,
   isi form, cek hasil, screenshot bukti.
4. Event QA aditif: `qa.check.started { label }` / `qa.check.done { label, pass,
evidence }` → jadi kartu checklist live di chat + TaskDrawer; gagal → bug card
   dengan langkah reproduksi otomatis.
5. Sherlock menabrak login/captcha → `request_takeover` → user ambil alih 10 detik →
   selesai → Sherlock lanjut.
6. Deliverable: **laporan QA** (doc-tools, muncul di tab Files sebagai run report)
   , artefak fase testing untuk human gate (P2-FLOW-3).

### 2.7 Sinergi Portal & mobile (D23)

- `request_takeover` card = RemoteAction aditif (`takeover.claim/release/skip`),
  approve dari HP sudah ada polanya (approval via relay, Batch 1 DONE).
- **Remote watch v1 (read-only):** stream frame screencast via relay envelope
  (`screen.frame` RemoteEvent, downsampled 1fps q40, hanya saat tab mobile aktif),
  "nonton Sherlock QA dari HP". Input remote = v2 (tulis eksplisit di §14 roadmap,
  jangan di-silent-scope).
- Metering: frame ≠ token, tapi bandwidth diukur & dibatasi (cap fps, only-on-view).

### 2.8 Keamanan (delta SECURITY-REVIEW-BROWSER + LB §5)

1. Semua poin LB §5 berlaku (CDP 127.0.0.1, WS auth, projectId+personaId binding).
2. **Screen persona ≠ tab preview project**, session Chromium terpisah, profil
   terpisah; persona tidak bisa membuka tab preview user secara diam-diam (semua
   `browser_open` tercatat `browser_visits` byRole=persona).
3. Input relay: rate-limit + validasi target (hanya browser milik sesi itu).
4. `request_takeover` reason wajib menyebut origin halaman (user tahu ke mana
   dia akan mengetik password).
5. Screenshot yang masuk konteks model = data halaman (sudah di-redact secrets
   via redact.ts yang diperluas §3.7; nilai login terisi **dots** oleh page browser
   , pola fill Rakazo: nilai tidak pernah diketik ke field yang terlihat model?,
   v0: snapshot masking field password + field yang barusan di-fill secret).
6. Sandbox vs screen: browser screen HIDUP DI HOST (bukan di workshop) v0, risiko
   rendah karena hanya render + CDP; pertimbangkan pindah ke workshop v1 (isolasi
   egress browser = allowlist riset).

### 2.9 Pertanyaan terbuka

- Q4: Sherloc QA terhadap app **eksternal** (staging klien) vs **lokal preview**,
  keduanya jalan; default lokal dulu (LB-1 dev server), staging menyusul.
- Q5: apakah fase `testing` workflow default assignee = sherlock di template
  7 fase (rekomendasi: YA, amandemen SEVEN_PHASE_TEMPLATE_YAML).
- Q6: nama "Sherlock" final? (alternatif: "Watson", rekomendasi tetap Sherlock,
  tema detektif = menemukan bug).

---

## 3. Konsep C

# Vault & Sharing Kredensial

### 3.1 Prinsip (tidak bisa ditawar)

1. **Nilai kredensial TIDAK PERNAH masuk konteks model**, tidak di pesan, tidak di
   tool result, tidak di log, tidak di trace. Model hanya melihat metadata
   (nama, origin, jenis auth).
2. **Backend yang meng-inject**, saat tool butuh kredensial, backend mendekripsi
   sesaat, menempelkan ke request/env/browser-fill, lalu buang. Model minta lewat
   _referensi nama_, bukan nilai.
3. **User selalu tahu & mengendalikan**, kartu protected saat menyimpan; daftar
   vault di Settings; hapus kapan pun; audit kapan dipakai persona siapa.
4. **Redaksi menyeluruh pasca-pakai**, nilai (plain/base64/urlencoded) di-scrub
   dari SEMUA jalur keluar (stdout terminal/workshop, read_file, web_fetch, hasil
   browser), perluasan `core/redact.ts` (P0-SEC-2) dengan daftar nilai aktif per-run.

### 3.2 Jenis kredensial

| Kind                                            | Untuk                                        | Contoh                      | Diambil?                                                                   |
| ----------------------------------------------- | -------------------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| `api_key` (bearer / header / basic)             | HTTP API eksternal                           | `OPENROUTER_KEY`, API klien | ✅ v0                                                                      |
| `login` (fields 1–8, username+password default) | Login website via browser fill               | akun riset Scholar          | ✅ v0                                                                      |
| `command` (env variable)                        | Di-export ke env workshop/terminal           | `NETBIRD_SETUP_KEY`         | ✅ v0                                                                      |
| `mcp_oauth`                                     | Token OAuth MCP server (hasil flow P1-MCP-2) | token Figma                 | ✅ v1 (auto)                                                               |
| `payment_card`, `contact`, `one_time_code`      | ,                                            | ,                           | ❌ out of scope (Rakazo punya; Yuika tidak butuh, catat eksplisit di §4.1) |

Batas (pola Rakazo, disederhanakan): nilai ≤ 16.384 char; ≤ 100 kredensial per
workspace; nama `[a-z0-9-]` unik per scope.

### 3.3 Model sharing lintas persona (INTI permintaan user)

Kredensial dimiliki **user** (satu vault per workspace host), lalu **di-grant**:

```
Scope kredensial (dipilih saat menyimpan / kartu):
┌───────────────────────────────────────────────────────────────────┐
│ workspace  → SEMUA persona, SEMUA project          (default api_key)
│ project    → semua persona DI project itu          (default login riset)
│ persona    → hanya persona itu, semua project      (kredensial personal)
└───────────────────────────────────────────────────────────────────┘
+ grant granularity v1: tombol "batasi ke persona…" per entri (edit kapan pun)
```

- **Sharing lintas persona terjadi otomatis di scope workspace/project**, inilah
  "sharing kredensial": simpan sekali, semua persona di scope bisa memakai via
  referensi. Persona TIDAK pernah melihat nilai; persona hanya melihat metadata
  (`vault_list`) + memakai (`vault_use`).
- **Kredensial MCP menyusul binding D17** (project × persona × tool): token OAuth
  server MCP otomatis masuk vault kind `mcp_oauth` dengan scope mengikuti binding.
- Default yang aman: `api_key` → workspace; `login` → project (login riset biasanya
  per-project); `command` → project. User bisa naik/turunkan scope.
- Persona baru otomatis mewarisi scope workspace/project tempat dia bekerja,
  tanpa setup per persona (pain point Rakazo yang diselesaikan desain connection-
  per-space; Yuika versi: grant di vault, bukan di persona).

### 3.4 Penyimpanan & enkripsi

- Enkripsi **AES-256-GCM per record** (nonce unik per tulis; AAD = `id + name + scope`
  → record tidak bisa ditukar-tukar). Pola crypto sudah ada: `packages/crypto`
  (portal X25519+HKDF+GCM), reuse primitif GCM-nya.
- Master key: file `YUI_VAULT_KEY` (env) atau `<data>/vault.key` (auto-generate 0600,
  warning backup). Portal nanti bisa jadi penyimpan kunci ter-enroll (v2, catat §14).
- SQLite: `vault_secrets(id, name, kind, scope, project_id?, persona_id?, origin?,
auth_type, fields_meta JSON, note, ciphertext, nonce, created_at, updated_at,
last_used_at, last_used_by)`. Nilai & metadata terpisah kolom; `fields_meta`
  menyimpan LABEL field (bukan nilai).
- REST: metadata-only untuk klien; nilai tidak pernah keluar API. (Pola Rakazo:
  "cleared from input when submission starts, omitted from messages, events and
  model input", disalin: input kartu dibersihkan DOM-side saat submit.)

### 3.5 Tool & alur (agent-side)

```
Persona butuh kredensial:
  vault_request { label, kind, name, origin?, auth, fields? }
    → kartu PROTECTED di chat (input masked, "Simpan ke Vault" ON default)
    → user isi → POST /api/vault (nilai langsung terenkripsi, tak lewat model)
    → persona menerima konfirmasi referensi saja

  vault_list  → metadata saja (name, kind, scope, origin, last_used) [tool read-only]
  vault_forget { name } → hapus (kartu konfirmasi ringan bila dipakai agent)

Pemakaian (backend-injected, bukan tool model):
  secret_http  { name, url, method, body? } → backend dekrip + inject header →
                response di-redact → potongan terbatas (20k char) ke model
  fill_login   { secret, fields } → browser fill terikat ORIGIN (§3.6)
  command var  → export otomatis ke env workshop (nama → $UPPER_SNAKE)
```

Kartu protected = varian kartu approval (UI sama, tanpa tombol allow-list; nilai
submit TIDAK masuk event/log, perlu jaminan kontrak `approval.card` aditif kind
`secret_request` yang menyimpan `hasValue` saja).

### 3.6 Jalur pemakaian & batas tiap jalur

| Jalur         | Aturan ketat                                                                                                                                                                                                                                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `secret_http` | Origin harus HTTPS & cocok **persis** (port ikut) dengan yang tersimpan; redirect ditolak ke origin lain; response ≤ 1MB, 20k char, tanpa header; 30 dtk deadline; lewat approval kelas ringan pertama kali per (persona, name)                                                                                                                       |
| `fill_login`  | Hanya saat page MASIH di origin tersimpan (dicek saat mengetik, bukan saat mulai); HTTPS wajib; field hidden → hanya input password, field visible → text/email/tel; snapshot browser TIDAK melaporkan nilai field itu; masuk event `workshop.command`-style audit `vault.used`                                                                       |
| `command var` | Nama reserved ditolak (`LD_*`, `GIT_CONFIG_*`, `NPM_CONFIG_*`, `RAKAZO`-equiv `YUI_*`, `PATH`…); di-redact dari output command (plain/base64/urlencoded); JUJUR: shell yang diberi variabel BISA membocorkannya, dokumentasikan (pola kejujuran Rakazo: "redaction stops it appearing in a result the model reads; it does not stop a permitted bot") |

### 3.7 Redaksi menyeluruh (perluasan redact.ts)

- `redact.ts` hari ini: pattern vendor + assignment statis. Ditambah: **registry
  nilai aktif per-run**, saat run memakai kredensial X, nilai X (+ bentuk base64/
  urlencoded/form-nya) masuk daftar scrub semua jalur keluar run itu (stdout
  terminal/workshop, read_file, web_fetch hasil, browser snapshot).
- Nilai < 6 char tidak di-scrub bentuk encodenya (false positive berbahaya, pola Rakazo).
- Test wajib (pola P0-SEC-2): nilai menyamar di semua jalur; idempoten; no-false-positive.

### 3.8 Integrasi existing

| Sistem                      | Integrasi                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `mcp/trust.ts` (gate trust) | `mcp_oauth` kind → token OAuth disimpan DI VAULT (bukan file json mentah); trust record tetap di `mcp-trust.json`                 |
| Approval engine             | kartu protected = varian kartu; `vault.used` masuk audit/trace (metadata saja)                                                    |
| Metering (D3)               | `secret_http` = tool call biasa (token response dihitung); vault sendiri tidak di-meter                                           |
| Browser screen (§2)         | `fill_login` = enabler riset authenticated Scholar                                                                                |
| Workshop (§1)               | command variables dieksekusi saat wake; egress proxy otomatis mengizinkan origin kredensial aktif (inject rule allowlist)         |
| Persona PERSONA.md          | catatan: "minta kredensial lewat vault_request, JANGAN pernah minta user mengetik nilai di chat" (anti-pola yang harus dimatikan) |

### 3.9 Pertanyaan terbuka

- Q7: master key di portal (multi-device unlock) = v2? (rekomendasi: ya, catat §14;
  v0 file lokal + env).
- Q8: bolehkah persona MENYIMPAN kredensial hasil OAuth flow-nya sendiri ke vault
  (Rakazo: bot bisa minta simpan)? Rekomendasi v0: hanya user yang menyimpan;
  persona hanya request.
- Q9: `.env` provider (YUI_OPENAI_API_KEY) ikut dimigrasi ke vault? Rekomendasi:
  tidak di v0 (env tetap untuk infra); vault untuk kredensial KERJA persona.

---

## 4. Analisis Dampak

> Bagian ini = daftar kerja untuk sesi yang meng-update plan. Format: dokumen →
> perubahan. **Jangan hapus baris/task lama** (aturan BATCHES.md); gunakan amendemen.

### 4.1 PLAN.md

| Bagian                                | Perubahan                                                                                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header changelog                      | Tambah **v0.8**: tiga pilar baru, Workshop (D24), Live Screen & Take Control (D25), Vault (D27), persona Sherlock (D26); sumber: dokumen ini                                                                                                            |
| §2 tabel keputusan                    | + baris **D24, D25, D26, D27** (draft lengkap di §5 dokumen ini, salin)                                                                                                                                                                                 |
| §6.5 "Eksekusi & sandboxing (3 tier)" | Ganti judul → "Kelas eksekusi" (4): (1) container sandbox disposable [tetap], (2) **workshop persisten per project** [baru D24], (3) device relay, (4) self-host edition. Tambah 1 paragraf workshop + tabel §1.2 diringkas                             |
| §7.4 roster                           | + baris **Sherlock Yui (QA & verifikasi)** roster ke-9; footnote amandemen: "Sherlock" lama (data) = posisi Analyst sejak D9 final, nama dibebaskan untuk QA (D26)                                                                                      |
| §7.5 arsitektur memori                | tidak berubah (domain QA = procedural per persona, sudah ter-cover)                                                                                                                                                                                     |
| §13 Studio Proyek                     | §13.2 model data project: + `workshop` (state, egress) & `browser_profiles`; §13.3 workflow: fase `testing` owner default = sherlock + event `qa.*` aditif; §13.5 workbench: tab Browser = mode Live (screen) + Static (reader), amandemen konsisten LB |
| §13.8 Dungeon                         | + contoh misi tipe praktik QA (bug ter-seed) untuk Sherlock                                                                                                                                                                                             |
| §14 Portal                            | §14.3 implikasi roadmap: + RemoteAction `takeover.*`, RemoteEvent `screen.frame` (watch v1); input remote screen = §14 open v2                                                                                                                          |
| §11 Risiko                            | + risiko baru (lihat §6 dokumen ini): persist-container escape, kredensial via shell, browser automation abuse, bandwith screencast                                                                                                                     |
| §12 pertanyaan terbuka                | tutup/tambah Q1–Q9 dokumen ini sesuai keputusan user                                                                                                                                                                                                    |

### 4.2 TASKS.md

**Task baru (group baru):**

```
P2-VLT, Vault kredensial & sharing (SUPERSEDE P2-AGT-5, tandai P2-AGT-5
         "diperluas oleh P2-VLT-1..5, lihat PLAN-WORKSHOP-LIVESCREEN-VAULT §3")
- [ ] P2-VLT-1  Store terenkripsi + kontrak vault (AES-256-GCM per record, master
      key, tabel vault_secrets, REST metadata-only) · A · 2d
- [ ] P2-VLT-2  Kartu protected + tools vault_request/list/forget (nilai tak
      lewat model/event; varian kartu approval) · A+B · 2d
- [ ] P2-VLT-3  secret_http (origin-bound, redact response) + command variables
      (reserved names, export env) · A · 2d
- [ ] P2-VLT-4  fill_login browser (origin-bound HTTPS, masking snapshot) · A · 1.5d · dep P2-SCR-3
- [ ] P2-VLT-5  Redaksi nilai aktif per-run (redact.ts) + audit vault.used + e2e
      "nilai menyamar di semua jalur" · A · 1.5d

P2-WKS, Workshop persisten per project (D24)
- [ ] P2-WKS-1  Manager: container + volume + lifecycle absent/running/asleep/
      stopped + wake/sleep + tabel workshops + event workshop.state · A · 3d
- [ ] P2-WKS-2  Egress allowlist per project (.yuika/workshop.json, proxy reuse)
      + kartu pembukaan workshop + audit workshop.command · A · 1.5d
- [ ] P2-WKS-3  Migrasi TerminalManager → backend workshop (docker exec; fallback
      lokal tetap) · A · 1d
- [ ] P2-WKS-4  Tool persona run_in_workshop + SAFE-list kelas risiko + wiring
      toolset persona coder/operator · A · 1.5d
- [ ] P2-WKS-5  Idle sleep + metering uptime (panel Metering) + cap volume · B · 1.5d
- [ ] P2-WKS-6  UI: panel Workshop (status, log, Stop/Recover/Reset/Destroy,
      edit egress) + event replay · B · 1.5d

P2-SCR, Screen runtime, Live Screen & Take Control (D25; menyerap LB-1..3
         dari PLAN-RESEARCH-LIVE-BROWSER.md, task LB diberi catatan "pindah ke
         P2-SCR, nomor lama dipertahankan untuk jejak")
- [x] P2-SCR-1  (=LB-1) Process manager dev-server + Chromium manager + screencast
      WS + input relay (canvas) · A · 3d, ✅ Batch 14a (raw CDP Node 24, SSE frame,
      detail TASKS.md)
- [x] P2-SCR-2  (=LB-2 inti) Agent shared-session: browser_* tools via CDP sesi
      sama + takeover mutex user↔persona (yield) · A · 2d, ✅ Batch 14a (lease fence
      rokazo)
- [x] P2-SCR-3  Profil browser per (project, persona) + screen selector tab Browser
      (Preview | Scholar | Sherlock) + chip pengendali · B · 1.5d, ✅ Batch 14a;
      14a++: selector tab dihapus (floating window + bubble "Open Browser")
- [x] P2-SCR-4  request_takeover: tool persona + kartu non-blocking + deadline
      auto-skip + lease flow · A · 1.5d, ✅ Batch 14a
- [ ] P2-SCR-5  (=LB-3, opsional) DevTools embedded (WS proxy + artefak pinned) · C · 2d
- [ ] P2-SCR-6  Watch mode QA: event qa.check.* + kartu checklist live + laporan
      QA doc-tools → run report · B · 2d, antrian #3 (ROADMAP-NEXT)
- [ ] P2-SCR-7  Remote watch v1: RemoteEvent screen.frame via relay (1fps read-only)
      + RemoteAction takeover.* · A · 2d · dep P1-PRT (sudah DONE), antrian #4

P1-PER-8  Persona Sherlock (roster ke-9, D26): manifest + PERSONA.md detektif +
          toolsets (browser_*, todo, doc) + delegation.yaml + 3 skill seed +
          bentuk Orin + roster test diperluas 9 persona · C · 2d · dep P2-SCR-2
P1-CRED-5 Metering uptime workshop + bandwidth screen (usage event aditif) · B · 1d
P2-DUN-x  Dungeon misi QA: app demo bug ter-seed + blind test + gating assign
          (extends dungeon/mission.ts kinds) · C · 2d · dep P1-PER-8
```

**Amandemen task existing (tambah catatan, jangan hapus):**

| Task                     | Amandemen                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P2-AGT-5`               | scope diperluas → digantikan P2-VLT-1..5 (lihat atas)                                                                                                   |
| `P2-STU-2` (terminal)    | backend berpindah ke workshop (P2-WKS-3); perilaku UI tak berubah                                                                                       |
| `P2-STU-4` (browser tab) | reader Static = fallback; mode Live via P2-SCR-3 (konsisten catatan LB)                                                                                 |
| `P2-PM-4` (RACI)         | owner fase `testing` = sherlock; metrik: laporan QA (P2-SCR-6)                                                                                          |
| `P2-FLOW-1` (template)   | SEVEN_PHASE_TEMPLATE_YAML: fase testing default persona yui-sherlock (setelah P1-PER-8)                                                                 |
| `P1-PRT-*`               | RemoteAction/Event aditif takeover.\*/screen.frame (P2-SCR-7), kontrak remote.ts di-freeze? → tambahkan sebagai v2 addendum, JANGAN ubah shape existing |
| `P2-MOB-5`               | Mission Control mini += watch screen read-only (mengonsumsi P2-SCR-7)                                                                                   |

### 4.3 BATCHES.md

1. **Perbaiki tabrakan penomoran** (ditemukan saat riset): PLAN-RESEARCH-LIVE-
   BROWSER.md memakai "Batch 7 · RS / Batch 8 · LB", tapi BATCHES.md 7=Design→Code,
   8=Mobile. → Amandemen dokumen riset: RS = "Batch RS (selesai)", LB = "diserap
   Batch 14". BATCHES.md tetap sumber nomor.
2. **Batch baru:**

| #   | Batch                      | Isi                                                                     | Est     | Bisa mulai                                |
| --- | -------------------------- | ----------------------------------------------------------------------- | ------- | ----------------------------------------- |
| 12  | **Vault & Kredensial**     | P2-VLT-1..3, 5 (VLT-4 menyusul SCR-3)                                   | ~7d     | ✅ independen                             |
| 13  | **Workshop Persisten**     | P2-WKS-1..6 + P1-CRED-5                                                 | ~10d    | ✅ independen                             |
| 14  | **Live Screen & Sherlock** | P2-SCR-1..4, 6 + P1-PER-8 + P2-DUN-x (+SCR-5/7 opsional; VLT-4 di sini) | ~12–14d | SCR-1/2 ✅ independen; Sherlock dep SCR-2 |

### 4.4 Dokumen lain

| Dokumen                                 | Perubahan                                                                                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PLAN-RESEARCH-LIVE-BROWSER.md`         | header: "LB-1..3 diserap P2-SCR (Batch 14)"; §4 LB-2 diperluas referensi §2 dokumen ini (persona screens, request_takeover)                                 |
| `SECURITY-REVIEW-BROWSER.md`            | + seksi delta: screen persona, input relay, request_takeover, vault fill (review = gerbang Batch 14, pola STU-4)                                            |
| `.env.example`                          | + `YUI_VAULT_KEY`, `YUI_WORKSHOP_IDLE_MIN`, `YUI_WORKSHOP_VOLUME_GB`, `YUI_WORKSHOP_NOEXEC`, `YUI_BROWSER_EXEC` (sudah direncanakan LB), `YUI_SCREEN_FPS_*` |
| `README.md`                             | fitur list (menyusul implementasi): workshop, screen, vault, Sherlock                                                                                       |
| `docs/DESIGN-SYSTEM.md` / ART-DIRECTION | chip pengendali screen, kartu protected vault, bentuk Orin Sherlock                                                                                         |
| `mcp.json`                              | tak berubah (trust OAuth → vault = internal)                                                                                                                |

### 4.5 Graf ketergantungan & urutan

```
Batch 12 Vault ──────────────┐ (VLT-4 fill_login ──┐)
Batch 13 Workshop ───────────┼─────────────────────┤ (command vars, egress)
Batch 14 Screen: SCR-1 → SCR-2 → ┬─ SCR-3 (profil+selector) ←─┘
                                 ├─ SCR-4 (takeover card)
                                 ├─ P1-PER-8 (Sherlock) → SCR-6 (watch QA) → P2-DUN-x
                                 └─ SCR-7 (remote watch; P1-PRT sudah DONE)
SCR-5 DevTools opsional kapan saja setelah SCR-1.
```

**Rekomendasi urutan eksekusi:** 12 → 14 (SCR-1..4 + Scholar screen + VLT-4) →
13 → 14 lanjut (Sherlock + watch QA + dungeon). Alasan: pain Scholar paling nyata
(user sudah menyebut "inginkan sekali"), vault kecil & independen, workshop
fondasinya sudah 60% (terminal+egress) jadi bisa menyusul tanpa memblokir.

### 4.6 Yang tidak berubah (jaga scope)

- Prompt-cache discipline §3.2: toolset browser\_\* & vault masuk via **registry +
  toolset persona** (frozen per sesi, sudah pola existing); TIDAK ada swap toolset
  mid-session.
- Kontrak aditif: semua event/REST baru = field baru optional; tak ada rename.
- Ekosistem tertutup D4: screen & vault TIDAK membuka integrasi pihak ketiga;
  browser = alat persona, bukan channel.
- Metering jujur: hanya angka provider (workshop/screen = satuan infra sendiri,
  dilaporkan terpisah dari token, jangan dicampur kredit token).

---

## 5. Draft Keputusan

> Salin ke §2 PLAN.md setelah user setuju. Format mengikuti tabel D1–D23.

| #       | Keputusan                                                                                                                                                                                                                                                                                                                                                                                                                             | Konsekuensi arsitektural                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **D24** | **Dua kelas eksekusi**: sandbox disposable (tetap, eksekusi tak dipercaya) + **workshop persisten per project** (volume `/home/yui` menetap, egress allowlist per project, idle-sleep, approval sekali per project, metering uptime). Workshop milik project, dipakai bersama persona di project itu; private workshop per persona = defer                                                                                            | Manager + tabel `workshops` + event `workshop.*`; TerminalManager pindah backend; `.yuika/workshop.json`; P2-WKS-\*        |
| **D25** | **Screen Runtime ter-unifikasi**: satu layanan Chromium+screencast+input untuk (a) tab preview project (=LB), (b) **screen persona Scholar** (riset authenticated, profil persist per project×persona), (c) **screen persona Sherlock** (QA fungsional live). **Take control dua arah**: user takeover (persona yield) + persona `request_takeover` (kartu non-blocking, deadline, lease tunggal). CDP hanya 127.0.0.1 via proxy auth | P2-SCR-_; amandemen P2-STU-4 (mode Live/Static); RemoteAction `takeover._`+ RemoteEvent`screen.frame` (watch read-only v1) |
| **D26** | **Persona Sherlock Yui (roster ke-9, domain QA & verifikasi)**, pemilik fase `testing` workflow; tema detektif; skill seed functional-testing/bug-reproduction/regression-checklist; misi dungeon QA (bug ter-seed); amandemen §7.4 (nama "Sherlock" lama=data kini Analyst)                                                                                                                                                          | P1-PER-8; SEVEN_PHASE_TEMPLATE testing owner; P2-PM-4 RACI; P2-DUN-x                                                       |
| **D27** | **Vault kredensial dengan sharing lintas persona**: nilai tak pernah masuk konteks model (backend-inject + redaksi per-run); scope workspace/project/persona dengan grant; kinds api_key/login/command (+mcp_oauth v1); kartu protected; kartu pembayaran eksplisit ditolak                                                                                                                                                           | P2-VLT-\* (supersede P2-AGT-5); perluasan redact.ts; integrasi mcp trust; master key lokal v0                              |

---

## 6. Risiko

| Risiko                                                           | severity | Mitigasi                                                                                                                                  |
| ---------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Container persist = tempat malware menetap (workshop)            | tinggi   | egress allowlist (bukan internet bebas), cap-drop ALL, non-root, cap volume, audit perintah, Reset/Destroy mudah; opsi `noexec` hardening |
| Kredensial bocor lewat shell yang diberi command variable        | tinggi   | kejujuran dokumentasi (bukan boundary dari persona itu sendiri); redaksi semua jalur keluar; nama reserved; scope sempit default          |
| Nilai login terlihat di screenshot konteks model                 | sedang   | masking field yang di-fill + snapshot tidak melaporkan nilai; nilai hidden hanya ke input password; test wajib                            |
| Browser automation memancing abuse platform (bot detection, TOS) | sedang   | read-only default riset; rate budget; identitas UA jujur; bukan penembus proteksi (keputusan Camoufox = tidak)                            |
| Screencast memakan bandwidth/CPU host                            | sedang   | fps adaptif (2/15), JPEG q adaptif, hanya saat tab aktif, remote watch 1fps downsampled                                                   |
| Kompleksitas lifecycle workshop (state bug, volume orphan)       | sedang   | event-sourced state + replay (pola existing); heal saat boot (pola delegation); opsi Recover/Reset                                        |
| Tabrakan nomor batch (RS/LB vs BATCHES.md)                       | rendah   | diperbaiki di §4.3 saat amandemen                                                                                                         |
| Scope creep dari dokumen ini                                     | ,        | §4.6 "yang tidak berubah" jadi pagar; pertanyaan terbuka Q1–Q9 wajib diputuskan user sebelum eksekusi                                     |

---

_Dokumen ini disusun oleh sesi riset benchmark Rakazo (2026-11). Sumber rujukan
kode Rakazo: `docs/computer.md`, `docs/approvals.md`, `docs/bot-secrets.md`,
`docs/routines.md`, `docs/skills.md`, `packages/core/src/screen-lease.ts`,
`packages/core/src/answerable-ask.ts`. Tidak ada kode Rakazo yang disalin,
hanya konsep, diadaptasi ke pilar Yuika (Design/Train/Direct/Trust) dan
keputusan D4/D14/D17/D23 yang sudah berlaku._
