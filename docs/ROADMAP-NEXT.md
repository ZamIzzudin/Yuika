# ROADMAP-NEXT — Urutan Prioritas Sisa Pekerjaan

> Dibuat 2026-11 setelah rencana menyeluruh bersama user. Dokumen ini = **urutan
> eksekusi tunggal** untuk sisa pekerjaan; TASKS.md tetap sumber definisi task
> per-item (jangan dobel), BATCHES.md tetap log riwayat. Setiap item selesai →
> centang di sini + centang/nambah catatan di TASKS.md + entri BATCHES.md.
>
> Status legenda: [ ] belum · [x] selesai · [~] parsial (catatan alasan).

## Antrian prioritas

1. [x] **Docs reconciliation** (0.5d) — seksi P2-FLOW & P2-SCR di TASKS/PLAN
   yang usang dicocokkan dengan realitas kode (engine workflow, board, steering
   teruji e2e). Selesai bersama pembuatan dokumen ini.
2. [x] **VLT-4 fill_login** (~2-3d) — menutup Vault v0: persona di halaman login
   minta kredensial via kartu protected (nilai tak pernah masuk konteks model),
   di-inject lewat CDP ke live browser; opsi Save to Vault (scope project+persona,
   kind login, related-origins per registrable domain); scrub nilai aktif di SEMUA
   run scope. Desain v0 disepakati user: gabungan pola kartu Batch 12 + takeover
   Batch 14a.
3. [x] **Batch 14b — Sherlock QA + SCR-6 watch QA** (~4d) — P1-PER-8 persona ke-9
   (roster) + SCR-6: persona menonton live screen persona lain, event
   `qa.check.*`, laporan QA non-blocking. Dep: live screen ✅.
4. [x] **SCR-7 remote watch via relay** (~2d) — live screen 1fps diteruskan lewat
   relay portal; nonton dari device lain. Dep: relay-client ✅; butuh host relay.
5. [x] **P2-PM-4/5 — dashboard progres terukur** (~4d) — RACI ringan per fase +
   burndown + health fase (blocker, revisi, hold approval). Dep: board FLOW ✅.
6. [ ] **Batch 13 — Workshop persisten** (P2-WKS-1..6, ~10d) — container menetap
   per project (volume, wake/sleep, egress allowlist, `run_in_workshop`, UI,
   metering). **Staging/VPS-first** (Docker absen di host dev); `WorkshopHost`
   interface + fallback lokal.
7. [ ] **Desktop Tauri** (P2-DTL-1+3, ~4d; DTL-2 sudah melebur ke relay-client) —
   shell Tauri reuse UI web + mode switch host/remote di onboarding + packaging
   (NSIS/MSI) & auto-update. **Ditaruh pasca-Workshop** karena nilai utama Tauri
   host = workshop/terminal/Docker di shell desktop. Bila test relay multi-platform
   jadi mendesak sebelum Workshop → boleh di-swap maju (ubah dokumen ini saja).
8. [ ] **SCR-5 DevTools embed** (~2d, opsional) — panel DevTools di floating
   window. Bisa di-swallow ke #3 bila QA butuh DOM inspector.
9. [ ] **P2-DUN-x dungeon QA** (~2d) — misi research nyata + eval persona.
10. [ ] **DSN Penpot pipeline** (P2-DSN-2..6) — butuh Penpot self-host; connector
    RPC → tab Design embed → design→kode → golden path E2E.
11. [ ] **Portal live session** (repo yuika-portal) — endpoint SSO nyata +
    swap portal-double + live test CP-5 (unlink & auto-link) + `YUI_AUTH_MODE=portal`.
12. [ ] **Mobile Expo** (P2-MOB-1..5 + P1-DEL-2 push, ~13d) — remote-only via
    portal relay (D23): shell + chat streaming/resume via envelope, push approve
    dari lock screen, persona picker, Mission Control mini. Dep: #11 portal live
    + #4 SCR-7 remote watch (nonton screen dari HP).
13. [ ] **Pra-beta infra/bisnis** — P1-CRED-5/6 billing + metering audit,
    P1-INF-5 staging, P1-MCP-2/5, P1-PER-5 blind test, G-BETA checklist.
14. [ ] **Pra-publik repo** — PUB-1..4 (THIRD-PARTY-NOTICES, keputusan lisensi,
    bersih-bersih artefak internal, CONTRIBUTING) + review `npm audit` dev-deps
    (6 vuln dev-toolchain; prod 0). WAJIB sebelum push publik.

Sisanya (P3/P4 coarse, G-BETA checklist, P2-AGT/BIL/GROW lainnya) dirinci saat
masuk fasenya — lihat TASKS.md.

## Platform multi-platform (D23) — logika penempatan (disetujui user 2026-11)

- **Desktop Tauri #7** & **Mobile Expo #12** TIDAK menunggu semua fitur web —
  fondasi relay (P1-PRT, kontrak RemoteAction/RemoteEvent) sudah selesai.
- Tauri dipasang pasca-Workshop (nilai host-mode-nya di sana); **bisa di-swap
  maju** bila test relay jadi prioritas.
- Mobile menunggu portal live (#11) + remote watch (#4) karena mobile =
  remote-only (D23).
- **Test relay HARI INI tanpa platform baru**: halaman dev `/dev/remote`
  (web) sudah bisa jadi klien remote vs host di tab/lain mesin — dipakai e2e
  remote.spec. Platform native nanti menggantikan harness ini, kontrak sama.

## Catatan rekonsiliasi docs (item #1)

- **P2-FLOW-1..7 (TASKS.md)**: FLOW-2..6 realita sudah jalan & teruji e2e
  (engine `workflow/engine.ts`, event `workflow.*` lengkap termasuk
  gate/steer/pause/resume/reassigned; UI WorkflowRunBar + WorkflowStepsCard;
  e2e FLOW-5/6 hijau) — dicoret dengan catatan. FLOW-1 (format yaml deklaratif
  file) TIDAK diadopsi persis — engine memakai template + chat-driven brief
  (keputusan UX user 2026-11: kendali run hidup di tab Chat) → ditandai [~].
  FLOW-7 v0 ada (TreeNode di drawer + board kanban); papan TaskTree penuh
  tetap target G-BETA.
- **PLAN-WORKSHOP-LIVESCREEN-VAULT.md §P2-SCR**: daftar SCR-1..4 masih `[ ]`
  padahal selesai (TASKS.md sumber kebenaran) → diberi catatan ✅ per item.
  SCR-5/6/7 tetap `[ ]` sesuai antrian #3/#4/#7.

## Keputusan desain VLT-4 fill_login (v0, disepakati saat eksekusi #2)

- Tool persona `request_login {origin}` (butuh sesi screen aktif). Jika vault
  punya record `login:<origin>` (scope project+persona) → pakai langsung tanpa
  bertanya (audit `vault.used`). Jika tidak → event `login.requested`
  (metadata-only: origin, hasValue=false) + deadline
  `YUI_LOGIN_TIMEOUT_MS` (default 120s, 0=off) auto-expired.
- Kartu chat (kind `login`, non-blocking): field username + password
  (password type=password; nilai dibaca DOM-side saat submit, TIDAK pernah
  dikirim sebagai event chat), checkbox "Save to Vault" (default on), tombol
  Fill / Skip. Submit → REST `POST /api/login/:requestId/fill` (authFetch).
- Nilai di-inject di proses API via CDP: input text/email terdekat di atas
  `input[type=password]` pertama; submit opsional (persona lanjut klik sendiri).
- **Related-origins v0**: registrable domain sama otomatis dianggap terkait
  (login Google di `accounts.google.com` sah untuk `google.com`); SSO chain
  lintas domain berbeda = menyusul (butuh capture redirect chain — dicatat di
  TASKS VLT-4 note sebagai pekerjaan lanjutan).
- **Scrub**: nilai user+pass masuk redaksi aktif (plain+base64+urlencode —
  reuse VLT-5) dari fill sampai turn berakhir; jika Save to Vault → record
  `login:<origin>` value JSON {user,pass} (AES-GCM per record, tidak pernah
  keluar API); e2e negatif wajib: nilai tak muncul di trace/SSE/event/log.
