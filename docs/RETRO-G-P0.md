# Retro G-P0 — Pelajaran Demo → Backlog

> Gerbang **G-P0** ditutup 2026-11 (branch `dev/p0-kernel`). Epic **P0 = 25/25 (100%)**.
> Format: kriteria gerbang → bukti; lalu pelajaran (APA → SO WHAT → BACKLOG).

## Kriteria gerbang → bukti

| Kriteria | Bukti |
|---|---|
| Smoke E2E green di CI | `npm run e2e` **2 passed** (smoke + orin v8, ≈22 dtk, Playwright + mock provider :3299 + api :3291 + web :3990). CI workflow `.github/workflows/ci.yml` siap (turbo typecheck+test+lint, cache `.turbo`) — **eksekusi CI tertunda: remote GitHub belum di-set** (lihat Pelajaran #4) |
| Contract invariant tests green | contracts **9/9** · core contract-invariants hijau · api **8/8** (turbo 3/3: total 265 passed / 10 gated-skip) |
| Sandbox escape test lulus | `YUI_SANDBOX_IT=1` integrasi docker nyata **5/5** (egress diblokir exit 3 · file muncul di host · rootfs read-only EROFS · timeout → kill) |
| pino trace per turn terlihat | `YUI_TRACE=1` log struktur per turn/iter/tool/approval + panel Trace UI (`buildTrace` = events × ledger); log pretty `YUI [mod] msg k=v` |
| Fallback model terbukti | model-router fallback + graceful degrade (test loop & router) — swap panas via Settings terverifikasi manual dev-10 |
| Retro tim | Dokumen ini |

## Pelajaran → Backlog

1. **Utang demo harus ditandai saat dibuat.**
   Shortcut `// DEMO-SHORTCUT` dari W0–W7 **semua** terlunasi di P0 tanpa satu pun terlewat — karena setiap shortcut ditandai di kode & dikumpulkan jadi epic P0.
   → Pertahankan pola: *tak ada shortcut tanpa komentar penanda + entri backlog*.

2. **E2E datang terlambat (P0-QA-1 di akhir epic).**
   Bug nyata SSE CORS (`reply.hijack()` melewati pipeline CORS) baru ketemu saat E2E pertama — padahal jalur yang sama dipakai web→api produksi sejak P0-INF-1.
   → **Backlog**: perluas `e2e/` — multi-session paralel, flow approval end-to-end, dungeon mission, reconnect SSE (Last-Event-Id). E2E masuk definisi-done tiap epic infra berikutnya.

3. **`next build` Windows (EPERM) ≠ kode salah — environment.**
   Verifikasi lintas-platform memakan waktu; sumber kebenaran build = Docker (`node:24-bookworm-slim`).
   → **Backlog**: saat remote aktif, CI matrix `ubuntu + windows` agar dev DX Windows tak pernah regress lagi.

4. **Remote/push adalah dependensi organisasi, bukan teknis.**
   Semua verifikasi CI & PUB gate menunggu `git remote` di-set — tercatat berulang sesi.
   → **Backlog (user)**: set remote GitHub → aktifkan CI (P0-INF-6 terverifikasi penuh) → buka PUB-5.

5. **Identitas data tidak boleh berubah saat migrasi.**
   Desain retensi (arsip UNION, id events monoton) membuat replay SSE & reconnect aman pasca-migrasi SQLite→PG — dibuktikan migrasi idempoten (run ulang = 0 baris, id identik).
   → **Backlog**: konsolidasi store project/memory/skills ke driver swappable (split-brain v1) dengan prinsip sama.

6. **Interface stabil > refactor besar.**
   Keputusan `ISessionStore` sinkron (sync-bridge worker utk PG) menghemat 250+ test & 12 call site dari perubahan; biaya = kompleksitas bridge.
   → **Backlog**: async-native store saat P2 (api multi-worker sungguhan) — jangan sebelum ada kebutuhan nyata.

7. **Observability murah berdampak besar.**
   Log pretty (`ses=136b`, find `[mod]`) mempercepat seluruh sesi debugging test user.
   → **Backlog**: export trace per-turn dari UI (JSON) utk laporan bug user; struktur field stabil = kontrak.

8. **Persona "terasa beda" belum terbukti objektif.**
   Identitas visual (bentuk Orin) + toolset membedakan persona secara nyata di demo, tapi bukti ukur belum ada.
   → **Backlog**: P1-PER-5 blind test (≥80% penguji menebak persona dari output) sebelum menginvest aset Rive penuh — jalur sekarang: spec dulu (P1-PER-1), aset batch kecil (P1-PER-2).

## Lanjutan (jembatan ke P1/P2)

- **P1-PER-1** art direction Rive (spec dari Orin v8 SVG — rig & state machine sudah terdefinisi 1:1).
- **P1-INF-1** auth + workspace — gerbang menuju publik (butuh remote, lihat #4).
- **P2-STU** Studio multi-project — visi "Agent OS".
