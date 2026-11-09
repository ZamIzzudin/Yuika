# FEATURES.md, Papan Fitur Menuju Rilis Publik

> Dibuat 2026-11 atas permintaan user: satu papan **berorientasi fitur** (bukan
> batch) untuk memantau ke mana fitur baru mengarah dan seberapa jauh
> progresnya sampai 100%. Menggantikan `ROADMAP-NEXT.md` sebagai antrian
> aktif (dokumen itu kini dibekukan, lihat banner-nya).
>
> Relasi dokumen:
> - **FEATURES.md (file ini)** = papan fitur aktif + progres %.
> - **TASKS.md** = definisi resmi task per-item (jangan dobel di sini).
> - **BATCHES.md** = log riwayat pekerjaan selesai.
> - **PLAN.md** = visi produk (mengapa).
>
> Cara update: setiap milestone fitur selesai → centang di sini + catat di
> TASKS.md/BATCHES.md seperti biasa. Persen = milestone selesai / total
> milestone fitur itu (basis hitung ditulis eksplisit, bukan feeling).
>
> Aturan keras: **Publish prep tidak boleh dikerjakan sebelum semua fitur
> di atasnya mencapai 100%** (dikembangkan DAN teruji).

## Ringkasan

| Fitur | Progres | Sisa inti |
| --- | --- | --- |
| F1 Mobile remote (Yuika-Mobile) | 60% | push approve, persona picker, Mission Control, distribusi |
| F2 Desktop app (Yuika-Desktop) | 75% | auto-update, lazy-config first-run |
| F3 Design-to-code (Penpot) | 15% | infra self-host, connector, tab embed, pipeline, golden path |
| F4 Persona training & QA | 65% | misi nyata lulus, blind test persona, scribe dokumen v1 |
| F5 Publish prep (GERBANG) | 20% | alpha/beta gates, repo publik PUB-1..4 |

```
F1 [######----] 60%   F2 [#######---] 75%   F3 [##--------] 15%
F4 [######----] 65%   F5 [##--------] 20%
```

Urutan eksekusi yang disarankan: **F1 → F2 → F4 → F3 → F5** (F3 boleh
jalan paralel karena butuh infra Penpot self-host yang dipasang dulu).

---

## F1 · Mobile remote (Yuika-Mobile) — 60%

HP sebagai remote pertama: kendalikan host lewat portal relay, approve dari
mana saja. Basis hitung: 6/10 milestone.

Selesai (6):
- [x] Interop crypto relay (Ed25519/X25519 noble, seal/open dua arah).
- [x] Shell + login portal (OAuth client `yuika-mobile`, redirect
      `yuika://auth/callback`; fix param `client` + splash 9eadb0a).
- [x] Chat streaming + resume (B8, envelope relay, snapshot).
- [x] Approvals remote (B8; approve/reject dari HP).
- [x] Remote control UI + bukti e2e fake-relay 13/13.
- [x] Pipeline build APK: GitHub Actions hijau + codemagic.yaml
      (android-release, versionCode = run number).

Sisa (4):
- [ ] **P2-MOB-3** Push notification (FCM/APNs) + tap dari lock screen
      langsung approve (< 10 detik, gerbang G-BETA).
- [ ] **P2-MOB-4** Persona picker + portrait (rig SVG OrinPortrait).
- [ ] **P2-MOB-5** Mission Control mini: monitor delegasi + cron,
      termasuk UI `delegation.update` via relay.
- [ ] Multi-host slots di mobile (pilih host dari `list_hosts`, D59
      lanjutan) + distribusi Play internal track ke tester (G-BETA).

100% ketika: empat sisa di atas terimplementasi dan lulus pengujian
(device nyata + suite mobile hijau).

## F2 · Desktop app (Yuika-Desktop) — 75%

Shell desktop Tauri: host engine lokal (workshop/terminal/Docker di mesin
sendiri) atau remote ke host lain. Basis hitung: 6/8 milestone.

Selesai (6):
- [x] Tauri shell + mode switch host/remote + welcome onboarding
      (D47/D48/D56).
- [x] First-run env wizard (D67) + welcome redesign (D68).
- [x] Packaged engine (esbuild, node.exe + sqlite ABI dinamis, D65).
- [x] Host data reset: respawn engine exit-87 + factory welcome ulang
      (D70, terpasang di lib.rs; teruji user).
- [x] CI NSIS installer hijau (pin studio_ref).
- [x] Remote watch (SCR-7, screen 1fps via relay) + ikon brand set (D66).

Sisa (2):
- [ ] **P2-DTL-3 / D49** Auto-update aplikasi (updater NSIS/tauri).
- [ ] **D49 lazy-config** first-run penuh tanpa env file wajib (jalur
      tanpa wizard pun bisa boot).

100% ketika: kedua sisa selesai dan installer teruji end-to-end
(install bersih → pakai → update otomatis → reset factory).

## F3 · Design-to-code (Penpot) — 15%

Pipeline desain → kode ter-embed: persona Designer produksi file Penpot di
fase design, fase develop membacanya jadi komponen kode + diff. Basis
hitung: 1/7 milestone.

Selesai (1):
- [x] **P2-DSN-1** Riset Penpot + keputusan arsitektur: self-host,
      RPC API v0 (access token, update-file, share-link), MCP resmi v1
      menyusul, exporter WASM untuk artefak (`docs/refs/penpot.md`).

Sisa (6):
- [ ] Instance **Penpot self-host** berjalan (docker, CSP) + akun token.
- [ ] **P2-DSN-2** Connector RPC (create/update headless, snapshot) +
      binding ke persona Designer (roster, D17).
- [ ] **P2-DSN-3** Tab Design: canvas Penpot ter-embed (lihat, navigasi
      halaman/frame, zoom; artefak ter-link ke task).
- [ ] **P2-DSN-4** Pipeline develop: baca shapes + tokens → generate
      komponen → diff di tab Files → acceptance di human gate.
- [ ] **P2-DSN-5** Skill Penpot Designer dilatih lewat dungeon → ready.
- [ ] **P2-DSN-6** Golden path E2E (design → lihat live → develop → diff)
      hijau 2x berturut.

100% ketika: golden path jalan di project demo tanpa keluar platform.

## F4 · Persona training & QA — 65%

Arena latihan + bukti kualitas persona: skill lahir dari misi nyata,
dinilai buta, readiness terlihat di roster; QA persona menonton layar.
Basis hitung: 6/9 milestone.

Selesai (6):
- [x] Dungeon v0 penuh: misi mission.yaml, runner sandbox, skill
      inventory lifecycle draft→tested→ready, eval buta (sesi hakim),
      arena UI custom + bahan ajar file (P1-DUN-1..4).
- [x] Readiness gating di roster project (P1-DUN-5).
- [x] Persona ke-9 Sherlock Yui (QA) + toolset qa_watch/qa_snapshot/
      qa_check (P1-PER-8, Batch 14b).
- [x] SCR-6 watch QA: persona menonton live screen persona lain, event
      `qa.check.*`, laporan non-blocking.
- [x] Template misi phaser-research + misi user custom.
- [x] Metering skill/dungeon ikut usage ledger (jujur).

Sisa (3):
- [ ] **ROADMAP #9** Minimal 1 persona produksi lulus misi research nyata
      → skill `ready` → di-assign ke project nyata (bukti end-to-end
      nilai arena, bukan hanya demo).
- [ ] **P1-PER-5** Blind test antar persona: >= 80% penguji menebak
      persona benar dari output (anti "hanya kosmetik").
- [ ] Scribe dokumen v1: docx, paging doc_read, tabel hasil ekstraksi
      di UI (evolusi persona dokumen).

100% ketika: tiga sisa selesai (arena terbukti menghasilkan persona yang
terbedakan dan siap pakai).

## F5 · Publish prep (GERBANG TERAKHIR) — 20%

TIDAK BOLEH dikerjakan sebelum F1-F4 100% (dikembangkan dan teruji).
Isi = gerbang alpha → beta → publik. Basis hitung: 3/15 gerbang.

Selesai (3):
- [x] Staging live: studio + portal + relay produksi (notu.dev), TLS,
      update.sh + update satu-klik (D50-D52, D60-D63, D71), reset data
      (D70).
- [x] Audit keamanan prod deps = 0 vulnerabilities + gate CI (PUB-5).
- [x] Self-host docs lengkap (DEPLOY.md dua opsi + backup + update).

Sisa alpha (internal):
- [ ] Smoke E2E + skenario persona hijau di staging (G-ALPHA).
- [ ] Metering akurat < 2% vs tagihan provider; saldo tak pernah minus.
- [ ] Sandbox no-escape checklist (path, network, resource, fork bomb).
- [ ] 10 pengguna internal aktif 1 minggu tanpa data loss.
- [ ] Runbook alpha (known issues + cara lapor).

Sisa beta (closed):
- [ ] Mobile distribusi internal track + push E2E < 10 detik.
- [ ] Load 100 sesi paralel, p95 turn-start < 2 detik.
- [ ] Analytics dasar (activation, retention, cost per workspace).
- [ ] Support channel + feedback widget + triage SLA internal.
- [ ] Security review ulang terminal/browser/relay scope.

Sisa publik repo:
- [ ] **PUB-1** THIRD-PARTY-NOTICES.md regenerasi.
- [ ] **PUB-2** Keputusan lisensi final (BSL/PolyForm/open-core).
- [ ] **PUB-3** Bersih artefak internal + audit secrets/history git.
- [ ] **PUB-4** CONTRIBUTING.md + CLA/DCO + cek trademark Yuika/Orin.
- [ ] `npm audit` dev-deps (6 vuln toolchain dev) ditutup atau waivered.

100% = siap push repo publik dan mengundang beta tester.

---

## Ditangguhkan (post-publish; bukan penghalang F1-F5)

Keputusan sadar, bukan hilang. Dirinci kembali saat masuk fasenya:

- **Autonomy suite**: cron natural-language + blueprint (AGT-1), kanban
  review gates (AGT-2), curator skill basi (AGT-3), knowledge base
  pgvector (AGT-4), background jobs web push (DEL-2).
- **Billing** (CRED-5/6, BIL-1): free tier sampai launching (keputusan
  Batch 11).
- **Growth penuh**: skin/event/achievement design (GROW-1), timeline UI
  varian unlock (GROW-2).
- **Figma connector** (STU-5): opsional, tergantikan jalur Penpot F3.
- **DevTools embed** (SCR-5): opsional, bisa diserap ke QA bila butuh
  DOM inspector.
- **Workflow yaml eksternal** (FLOW-1 sisa): reuse template lintas
  project; engine saat ini template + brief chat-driven.
- **Delegation queue v1** (DEL-1 sisa): antrian saat cap + prioritas
  front + auto-pause saat budget warn.
- **Iterasi berantai** (PM-6): run berikutnya dari delta hasil testing.
- **Vault related-origins lintas domain** (VLT-4 lanjutan: SSO chain
  capture).
- **P3 ekosistem**: marketplace persona/skill/MCP, teams multi-user,
  voice per persona, eval harness, self-host license server.
- **P4 skala**: visual workflow builder, sandbox microVM, enterprise.

## Selesai (konteks; tidak dibahas lagi di papan ini)

Workbench studio multi-tab (Batch 6), workflow engine + steering + board
(FLOW-2..8), project entity + roster + TaskTree (PRJ-1..8), delegation
isolation/steer/pause (DEL-3/4), vault v0 + fill_login (VLT-4/5), live
browser + screen watch (Batch 14a, SCR-1..4/6/7), workshop persisten
(Batch 13), dungeon arena v0 (lihat F4), usage metering + budget (CRED),
multi-model router + smoke (MDL), SSO portal-only + pairing + unlink +
devices (PRT-1..10, portal live), growth v0, terminal + commands log,
MCP catalog/trust/audit, deploy & ops (D50-D63, D70, D71), env wizard +
welcome desktop (D67/D68), Codemagic MCP + skill (D69).
