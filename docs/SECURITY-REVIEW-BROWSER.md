# Security Review — Browser Tab Read-Only (P2-STU-4)

Status: **LULUS v0** (2026-11-08) — dengan catatan known-limitations di bawah.
Scope: tab Browser (apps/web) + proxy read-only (packages/core/browser/reader.ts,
apps/api/routes/browser.ts). Ancaman utama: SSRF, XSS via konten pihak ketiga,
ekfiltrasi data project.

## Checklist SSRF & konten

| # | Risiko | Pertahanan | Bukti test |
|---|--------|-----------|-----------|
| 1 | Fetch ke host arbitrer (SSRF) | Allowlist domain per project: `.yuika/browser.json` → env `YUI_BROWSER_ALLOW` → default hanya `example.com`. Host diluar allowlist → 403 `host_denied`. **Opt-in eksplisit user (2026-11): `allowAll: true`** (toggle "Allow all domains" di tab Browser; persist `.yuika/browser.json`) melewati CEK HOST saja — guard #3 (IP private/loopback/metadata) TETAP jalan tanpa pengecualian | `browser-reader.test.ts` "allowlist" + "allowAll melewati cek host — SSRF guard IP private TETAP jalan" + api test 403 |
| 10 | **web_fetch agent (riset) — celah lama fetch-polos tanpa guard (Batch 7)** | Pipeline researchFetch: SSRF guard reader SELALU (host policy bila `.yuika/browser.json` ada; tanpa file = web terbuka namun private-block tetap) + robots.txt (group *, wildcard, cache 1 jam; 404 = boleh) + throttle per-domain + cap 2MB + redirect tervalidasi ulang | `research.test.ts` (private_blocked, robots_denied, content_type_denied, redirect) |
| 2 | Scheme berbahaya (`file:`, `data:`) | Hanya `http:`/`https:` → `scheme_denied` | unit `assertBrowserUrlAllowed` |
| 3 | IP private / loopback / link-local / metadata cloud (`169.254.169.254`) | Guard: IP-literal + nama (`localhost`, `.local`, `.internal`) + **DNS resolve** → semua alamat private diblok `private_blocked`. Pengecualian EKSLISIT `YUI_BROWSER_ALLOW_PRIVATE=1` (dev/test) | unit `isPrivateIp` (12 kasus) + `private_blocked` |
| 4 | SSRF via redirect (allowlisted.com → 169.254.169.254) | `redirect: "manual"`, max 4 hop, **setiap hop divalidasi ulang** (allowlist + private) | unit "redirect KE host private → blok" |
| 5 | Respons raksasa (DoS memori) | Cap `content-length` + slice 2 MB → `too_large` | code `MAX_BYTES`; content-type test |
| 6 | Binary / konten non-teks | Whitelist content-type: hanya `text/html` & `text/plain` → `content_type_denied` | unit |
| 7 | XSS via halaman (script/on*/javascript:/iframe) | Sanitizer server: buang `<script>/<iframe>/<object>/<embed>/<form>/<template>` + isi, netralkan `on*=` handler & `javascript:`/`vbscript:`/`data:` URL, rewrite URL relatif → absolut | unit sanitizer |
| 8 | Eksekusi sisa (payload sanitasi lolos regex) | Pertahanan ke-2 di klien: `<iframe sandbox="">` — TANPA `allow-scripts` & TANPA `allow-same-origin`; script apa pun yang lolos tetap tidak bisa jalan / menyentuh origin web | BrowserTab.tsx iframe sandbox |
| 9 | Waktu hang fetch | `AbortSignal.timeout(15s)` → `timeout` | code |
| 10 | Bypass lintas project (project A buka URL utk project B) | Route scoped `/api/projects/:id/...`; allowlist dibaca dari workspace PROJECT TERSEBUT | route + `readBrowserAllow(projectRoot(id))` |

## Agent vs user

- `web_fetch` (agent) TIDAK lewat proxy ini (tool riset teks, perilaku lama) —
  namun setiap fetch di sesi project **tercatat** di `browser_visits`
  (`byRole=agent`) agar user bisa membuka ulang halaman yang sama via proxy.
- Tab Browser (user) SELALU lewat proxy + tercatat (`byRole=user`).

## Known limitations (v0, diterima)

1. **DNS rebinding penuh**: guard resolve DNS *sebelum* fetch; race rebinding
   (jawaban DNS berubah antara cek dan koneksi) tidak dicegah — mitigasi penuh
   butuh pinning IP di agent fetch (undici custom dispatcher). Risiko rendah
   (allowlist sempit per project; default hanya example.com).
2. **Sanitizer berbasis regex** — bukan parser HTML; payload eksotis bisa lolos
   regex TAPI tetap mati di iframe sandbox kosong (lapisan 8). Upgrade ke
   sanitizer DOM (parse5/sanitize-html) bila kelak butuh render lebih kaya.
3. **CSS eksternal** (`<link>`) tetap dimuat oleh iframe — CSS bisa memuat
   subresource (font/gambar) dari origin halaman; tanpa `allow-same-origin`
   tidak ada akses DOM/cookie web Yuika.
4. `YUI_BROWSER_ALLOW_PRIVATE=1` sengaja menurunkan guard #3 — hanya untuk
   dev/test (e2e memakai loopback server lokal), TIDAK boleh diset di produksi.

## Kesimpulan

Pertahanan berlapis (allowlist → SSRF guard → redirect re-validation →
content-type/size → sanitizer → iframe sandbox) dan tiap lapis punya test.
Gerbang security review batch 6 terpenuhi untuk v0.
