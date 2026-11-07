# Rencana: Research Engine + Live Browser

> **STATUS (2026-11): Research Engine SELESAI; LB-1..3 diserap P2-SCR-1..3 (Batch 14a,
> DISETUJUI user)** — sumber kebenaran baru: PLAN-WORKSHOP-LIVESCREEN-VAULT.md §2
> (Screen Runtime ter-unifikasi + take control dua arah). Nomor "Batch 7/8" di dokumen
> ini = sebelum tabrakan diperbaiki; nomor resmi lihat BATCHES.md.

Pertanyaan pembuka: **bisakah brief ini di-embed ke sistem sekarang?**
Jawaban: **ya, keduanya** — tapi bukan sebagai proyek baru berdiri sendiri.
Semua komponen brief sudah punya titik pijak di Yuika; sisanya adaptasi,
bukan pembangunan dari nol. Dua subsistem berjalan independen dan prioritasnya
dibalik dari urutan dokumen brief: **Research Engine duluan** (pain nyata
Scholar hari ini, effort kecil–sedang), **Live Browser menyusul** (effort
sedang–besar, 3 fase).

---

## 1. Kondisi sekarang (fakta kode, 2026-11)

| Area | Status | Lokasi |
|---|---|---|
| Search agent | **TIDAK ADA tool `web_search`** | — |
| Fetch agent | `web_fetch`: fetch polos + strip HTML regex; UA `Yuika/0.1 (demo)`; **tanpa SSRF guard** | `packages/core/src/tools/web-tools.ts` |
| Tab Browser project | Reader read-only: fetch → sanitize → iframe sandbox; + panel terminal VS Code | `apps/web/src/components/BrowserToolsTab.tsx`, `packages/core/src/browser/reader.ts` |
| Policy browser | Per-project `.yuika/browser.json` (allow/allowAll), SSRF guard IP-private, sanitizer | `browser/reader.ts`, `apps/api/src/routes/browser.ts` |
| Spawn proses + log | Terminal manager: sesi persist, ring buffer, REST/WS, Commands log | `packages/core/src/terminal/manager.ts` |
| Chromium | Playwright 1.64 terpasang (devDep e2e) → binary Chromium tersedia di dev host | `package.json` |
| Bus realtime | SSE per sesi + event bus (workflow/terminal pakai ini) | `packages/core/src/bus.ts` |
| Scholar | Toolset hanya `web_fetch` + skill `web-research` (menebak URL manual) | `packages/personas/yui-scholar/` |

Mengapa Scholar sering kena block: tanpa provider search, agent membuka
halaman hasil search engine via fetch polos dengan UA non-browser →
bot-detection/CAPTCHA/403. Solusinya bukan "lebih pintar menebak URL",
tapi **search provider resmi + fetch yang sopan** (render penuh sebagai
fallback terakhir).

---

## 2. Embed mapping (brief → Yuika)

| Komponen brief | Titik pijak Yuika | Catatan |
|---|---|---|
| Research: SearchProvider/FetchProvider | modul baru `packages/core/src/research/` | pattern sama seperti provider/model-router |
| Research: cache | tabel `research_cache` di db runtime (SQLite) | lintas project, key = hash(query/url) |
| Research: SSRF + sanitizer | reuse `assertBrowserUrlAllowed` + `isPrivateIp` (browser/reader.ts) | sekalian menutup celah `web_fetch` |
| Research: tools | upgrade `web_fetch`, tambah `web_search` (registry + toolset scholar) | contract REST tidak berubah |
| Research: SearXNG | opsional via config URL | Docker tidak tersedia di host user — jangan jadikan default |
| Browser: Process Manager | pola `terminal/manager.ts` (spawn + ring log + status) | modul baru `process/manager.ts` |
| Browser: Chromium + CDP | `playwright-core` (runtime) + binary: env `YUI_BROWSER_EXEC` → playwright cache → Chrome/Edge sistem | headless `--remote-debugging-port` 127.0.0.1 |
| Browser: Screencast + input relay | route WS baru di apps/api (lebih auth `yuika.auth.token`/portal) | `Page.startScreencast` JPEG → canvas |
| Browser: DevTools embed | fase terakhir; static `chrome-devtools-frontend` + WS proxy dengan auth rewrite | lihat §5 LB-3 |
| Browser: tab Browser UI | ganti konsep: mode **Live** (default) + **Static** (reader sekarang, fallback) | panel terminal bawah TETAP |

Struktur direktori brief (`/packages/browser-gateway`, `/process-manager`, …)
**tidak diadopsi** — semua embed ke `packages/core/src/…` + `apps/api/src/routes/…`
+ `apps/web/src/components/…` sesuai struktur Yuika. Repo tetap satu;
pengecualian hanya jika nanti muncul kebutuhan Tauri sidecar terpisah.

---

## 3. Bagian B dulu — Research Engine (Batch 7 · RS)

### RS-1 · Provider layer + fallback chain (M)
```
packages/core/src/research/
  types.ts        — SearchResult, FetchedPage, SearchProvider, FetchProvider
  providers/
    wikipedia.ts  — API resmi (search + summary), tanpa key
    github.ts     — search API unauth (10 req/min, cukup utk riset)
    hn.ts         — Algolia API
    stackex.ts    — API resmi
    docsites.ts   — sitemap.xml / llms.txt utk situs dokumentasi
    ddg-html.ts   — html.duckduckgo.com (fallback; UA browser; rawan block → posisi terakhir)
    searxng.ts    — hanya jika URL dikonfigurasi
    http-read.ts  — fetch + Readability (linkedom) + turndown → markdown
```
Router `search(query)`: cache → site-router (deteksi intent: "github repo X",
"HN thread", "wikipedia", docs domain) → ddg-html → searxng (jika ada) →
hasil parsial + pesan provider mana yang gagal (agent bisa memutuskan
ganti query, bukan mengulang menabrak yang sama).

Dep baru (kecil): `linkedom` (DOM ringan utk Readability), `@mozilla/readability`,
`turndown`. Alternatif `jsdom` ditolak — berat.

### RS-2 · Upgrade `web_fetch` (S)
- Lewat `assertBrowserUrlAllowed` (policy project + SSRF private guard) —
  menutup celah hari ini.
- HTML → markdown bersih (Readability → turndown), judul + tanggal ikut.
- Hormati `robots.txt` (cache 1 jam, parse sederhana), jeda per-domain
  (default 1 dtk), timeout 20 dtk, cap ukuran (reuse MAX_BYTES reader).
- Hasil tetap tercatat di riwayat tab Browser project (perilaku sekarang dipertahankan).
- UA: versi browser desktop nyata + identitas Yuika di bagian akhir.

### RS-3 · Tool `web_search` + persona (S)
- Tool `web_search(query, limit?)` → SearchResult[] (title/url/snippet/source).
- Toolset `yui-scholar` + `yui-conductor`: tambah `web_search`.
- PERSONA.md scholar: ganti "plan candidate URLs" → "search dulu dengan
  `web_search`, baru `web_fetch` ke URL terpilih"; tetap wajib ≥2 sumber.
- Skill `web-research`: prosedur diperbarui (search → pilih → fetch → sintesis).

### RS-4 · Cache + limit (S)
- Tabel `research_cache(key TEXT PK, kind TEXT, payload TEXT, created_at)` —
  TTL search 12 jam, halaman 72 jam.
- Budget per task: max 10 query / 20 halaman (di-cache tidak dihitung).

### RS-5 · Config (S)
- `YUI_SEARXNG_URL` (kosong = skip), `YUI_RESEARCH_OFF=1` (matikan seluruhnya).
- Settings modal nanti bisa menampilkannya; versi awal env-only cukup.

**Est total RS: ~2–3 hari.** Tidak menyentuh UI sama sekali (agent-only),
risiko rendah, langsung menjawab pain Scholar.

---

## 4. Bagian A — Live Browser (Batch 8 · LB, 3 fase)

Pengganti konsep tab Browser: dari "reader halaman statis" menjadi
**viewport Chromium hidup** yang dipakai bersama user + agent, plus panel
terminal bawah (tetap). Reader lama tidak dibuang: turun kelas jadi mode
**Static** (fallback ketika Chromium mati / untuk baca cepat halaman eksternal).

### LB-1 · Process Manager + Live viewport (M)
- `packages/core/src/process/manager.ts`: spawn `npm run dev` dsb. di
  workspace project; deteksi port dari log (regex `localhost:(\d+)` /
  `ready on`); status starting → ready → error; log ring (reuse pola Commands).
- REST: POST `/api/projects/:id/preview/start|stop`, GET `…/preview/status|log`.
- UI: kartu "Dev server" di header tab Browser (Start/Stop + status + port).
- Chromium: `playwright-core.chromium.launch({ headless: true, args: [--remote-debugging-port=0 …] })`;
  resolusi binary: env `YUI_BROWSER_EXEC` → cache playwright → Chrome/Edge sistem.
- Screencast: WS `/api/projects/:id/preview/screencast` — relay frame JPEG
  (`Page.startScreencast`, kualitas adaptif, idle ≤ 2 fps, aktif ≤ 15 fps).
- Input: mouse/key/scroll/resize dari canvas → `Input.dispatch*`; URL bar
  (back/forward/reload). Sinkron ukuran panel → `Emulation.setDeviceMetricsOverride`.
- Lifecycle: lazy start saat tab dibuka; auto-kill idle 10 mnt atau project
  ditutup; profil preview per project di `.yuika/preview-profile/`.

### LB-2 · Agent pada sesi yang sama + takeover (M)
- Core connect `chromium.connectOverCDP("127.0.0.1:<port>")` — tab yang sama
  dengan yang di-stream user.
- **Authenticated preview research (keputusan diskusi 2026-11):** user login
  sendiri sekali di tab Live Browser (profil persist per project) → Scholar
  membaca halaman yang sudah authenticated (hasil search, balasan, feed) dengan
  kecepatan manusia — jalur jujur untuk platform tertutup (X/Threads/TikTok),
  menggantikan gagalan scraping/Camoufox. Read-only by default; rate dibatasi
  budget riset yang sama.
- Tools: `browser_screenshot`, `browser_console` (log+error), `browser_click`,
  `browser_type`, `browser_snapshot` (a11y tree ringkas), `browser_network`
  (request gagal). (`browser_open` = URL bar programatik.)
- Takeover: mutex kontrol; user input saat agent mengontrol → agent yield
  (tool berikutnya menunggu); indikator chip di header tab:
  "Agent is controlling" / "You are controlling". Tool `browser_*` lewat
  approval engine seperti run_command berisiko (opsional per policy).
- Verifikasi diri: alur kerja Coder → jalanin dev server → screenshot →
  baca console error → perbaiki — tanpa perlu mata user.

### LB-3 · DevTools embedded (M, opsional tapi disarankan)
- Serve build `chrome-devtools-frontend` dari API (static, versi dipin ke
  versi Chromium yang dipakai; kalau paket npm tidak tersedia per versi —
  unduh artefak saat first-run ke `node_modules/.cache`).
- WS proxy `/api/preview/:pid/devtools/page/:targetId` dengan auth token —
  DevTools frontend diarahkan lewat query param sehingga semua WS melewati
  backend, port CDP tidak pernah keluar dari 127.0.0.1.
- UI: switch area utama **Preview | DevTools**; panel bawah tetap Terminal/Commands.

### Yang TIDAK diambil dari brief (keputusan)
- **WebRTC/Neko/KasmVNC** — berat; screencast CDP cukup untuk iterasi dev.
- **Mode iframe ringan** — reader Static sudah meng-cover kebutuhan murahnya.
- **Camoufox** — ditunda; anggap penembusan proteksi bukan default produk.
- **Subdomain per port (`5173.preview.domain`)** — relevan saat multi-tenant
  hosting publik; Yuika self-host single-user belum butuh.

### Est LB: LB-1 ±3d, LB-2 ±2d, LB-3 ±2d. Urutan ketat: 1 → 2 → 3.

---

## 5. Keamanan (delta dari SECURITY-REVIEW-BROWSER.md)

1. CDP **hanya** 127.0.0.1; tidak pernah di-publish. Semua klien (web UI,
   DevTools, core agent) lewat proxy apps/api dengan auth portal/token.
2. Screencast/input/DevTools WS: wajib token sesi — sama seperti WS terminal.
3. `web_fetch` kini lewat SSRF guard (menutup celah existing) — research dan
   reader berbagi satu lapisan pertahanan, bukan dua implementasi.
4. Halaman = data, bukan instruksi (prompt injection): catatan ini masuk
   PERSONA scholar (sudah ada semangatnya) + skill.
5. Konten DevTools/screencast hanya ke sesi project yang sama (cek projectId
   di route WS, sama seperti route terminal sekarang).
6. Research: robots + jeda domain + cap — dipatuhi provider layer, bukan
   diserahkan ke kebiasaan model.

---

## 6. Keputusan terbuka brief → rekomendasi

| Pertanyaan brief | Rekomendasi | Alasan |
|---|---|---|
| Bahasa sidecar? | TypeScript di apps/api yang ada | Yuika sudah Node/Fastify; tanpa proses baru. (Rust/Python hanya kalau kelak paksaan nyata) |
| Chromium headless/headful server? | **Headless** (new mode) + screencast | Tanpa X server; screencast bekerja; hemat sumber |
| 1 Chromium per project / pool? | Per project, lazy start, idle kill 10 mnt | Isolasi profil + lifecycle sederhana; pool = optimasi nanti |
| FPS/kualitas default? | idle 2 fps / aktif 15 fps, JPEG q=60 adaptif | cukup utk iterasi dev, hemat bandwidth lokal |
| Mode iframe ringan versi awal? | Tidak | Static reader = penggantinya |
| Camoufox versi awal? | Tidak | lihat §4 |
| DevTools frontend sumbernya? | Artefak pinned, unduh first-run, serve dari API | npm build tidak selalu sinkron versi Chromium |

---

## 7. Roadmap gabung

| Batch | Isi | Est | Status |
|---|---|---|---|
| 7 · RS-1..RS-5 | Research Engine (search providers, web_fetch upgrade, web_search, cache, config) | 2–3 d | **SELESAI 2026-11** (+ RS-1b news/market/social — riset bebas topik) |
| 8a · LB-1 | Process manager + live viewport + input | ±3 d | usulan |
| 8b · LB-2 | Agent shared-session + browser_* + takeover | ±2 d | usulan |
| 8c · LB-3 | DevTools embedded | ±2 d | usulan |

Setelah Batch 7 selesai, tab Browser belum berubah (research agent-only);
perubahan UX tab Browser terjadi di 8a (mode Live/Static). Terminal panel
VS Code (commit 999a6d0) tetap menjadi dasar layout workbench.

E2E yang menyertai: RS (unit providers dengan fixture HTML + guard SSRF +
fallback chain), LB (screencast mock CDP + takeover flag + policy auth WS).
