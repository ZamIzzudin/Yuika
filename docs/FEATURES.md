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
| F1 Mobile remote (Yuika-Mobile) | 85% | push e2e device + Firebase, Play internal track |
| F2 Desktop app (Yuika-Desktop) | 75% | auto-update, lazy-config first-run |
| F3 Design-to-code (embedded canvas) | 100% | SELESAI (D86): draw loop live + generate acceptance + golden path |
| F4 Persona training & QA | 83% | misi nyata lulus, blind test run penguji |
| F5 Publish prep (GERBANG) | 20% | alpha/beta gates, repo publik PUB-1..4 |

```
F1 [########·-] 85%   F2 [#######···] 75%   F3 [##########] 100%
F4 [########·-] 83%   F5 [##········] 20%
```

Urutan eksekusi yang disarankan: **F1 → F2 → F4 → F5** (F3 selesai D86).

---

## F1 · Mobile remote (Yuika-Mobile) — 85%

HP sebagai remote pertama: kendalikan host lewat portal relay, approve dari
mana saja. Basis hitung: 9/11 milestone (D76 menambah picker/missions/push).

Selesai (9):
- [x] Interop crypto relay (Ed25519/X25519 noble, seal/open dua arah).
- [x] Shell + login portal (OAuth client `yuika-mobile`, redirect
      `yuika://auth/callback`; fix param `client` + splash 9eadb0a).
- [x] Chat streaming + resume (B8, envelope relay, snapshot).
- [x] Approvals remote (B8; approve/reject dari HP).
- [x] Remote control UI + bukti e2e fake-relay 13/13.
- [x] Pipeline build APK: GitHub Actions hijau + codemagic.yaml
      (android-release, versionCode = run number).
- [x] **P2-MOB-4** Persona picker + portrait (D73/D76: sheet new-chat
      `personas.list`, portrait rig Mascot shapes Orin v8 + model label).
- [x] **P2-MOB-5** Mission Control mini (D76): tab Missions lintas project
      (Running now / Recently finished), live `delegation.update` via relay;
      cron host-side menyusul bersama cron v1 (backlog PLAN fase 2).
- [x] Multi-host pick via hosts screen (D59/v1.2; D76: tap push membuka
      host terkait langsung).

Sisa (2):
- [~] **P2-MOB-3** Push notification (FCM) — pipeline LENGKAP D76: portal
      `POST /api/devices/push-token` + `POST /api/push/notify` (FCM HTTP v1,
      tanpa deps baru, env-gated), host kirim notify saat approval.request
      + replay approval pending saat remote join, mobile register token +
      tap deep-link ke host. Menunggu: project Firebase (google-services.json
      mobile + service account portal) + bukti e2e < 10 dtk device nyata.
- [ ] Distribusi Play internal track ke tester (G-BETA; butuh akun Play).

100% ketika: dua sisa di atas terimplementasi dan lulus pengujian
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

## F3 · Design-to-code (embedded canvas) — 65%

> **Polish D90 (layers panel):** dropdown Pages diganti layers tree ala
> Canva/Figma di panel kiri — Pages → Screen (badge Monitor) → komponen
> nested (z-order depan-ke-belakang); rename inline double-click (nama =
> D95: hapus file desain (trash di file menu + konfirmasi, tool
persona design_delete_file).
D96 canvas: ruler atas/kiri + indikator kursor; smart guides snap
(edge/tengah) saat drag; props panel pakai Dropdown custom; layers
panel bisa di-fold (canvas lebih lebar).
D106: MCP Cloudflare Quick Tunnel: persona bisa publikasikan dev lokal ke
URL publik tanpa login (cf_quick_start -> trycloudflare.com, URL terbaru
di browser_open).
D104: card skill Persona = hanya terpasang + modal library per kategori
(equipped chips di awal, toggle langsung; kategori = domain persona).
D102/D103: Design tab font bank (Google Fonts, 90+ family per kategori,
load CDN runtime) + icon bank SVG (221 Phosphor, 9 kategori) - Picasso
dan user bisa pilih dari props panel; validasi nama EN.
D99: pretrain bawaan seluruh persona dari docs/skills (PM toolkit, PRD,
issue breakdown, triage, journey map, wayfinder, workflow grilling, AI
strategy; handoff + review loop; copywriting + docx/pdf; xlsx + dataviz +
diagram; source/user research + web scraping; LLM product engineering;
eval audit).
D98: pretrain bawaan Picasso (67 style pack + taste/color/platform/microcopy)
dan Hiro (figma-to-code, web craft, prototype); Figma dua arah:
Picasso authoring, Hiro konsumsi (dijaga test designer-wiring).
D97: semua persona dilarang emoji & em dash di output (prompt inti);
skill Picasso +typography-basics +design-language-basics (gaya, ikon
SVG pack, pairing font).
D93: klik kanan shape → "Attach to chat" — komponen desain jadi
context chat (chip + snapshot JSON, bisa dirujuk/diubah persona).
D94: delete project bersih total (design files, browser_visits,
workflow_runs, orphan delegation/checkpoint rows).
D92: interaksi ala Figma — resize 8 handle, auto-parent saat
drop/create, group/ungroup (Ctrl+G), copy/paste/duplicate, DnD
reparent di layers, upload image ke canvas + background image frame,
file menu custom + modal nama, chip Saved floating, ctrl+wheel zoom.
D91: file desain diikat per-project (dropdown hanya file project itu +
> legacy); toolbar tunggal (select file+Try it di ujung kanan sebelah
> chip Saved); delete page; props panel label-di-atas tanpa overflow.
> kontrak komponen design-to-code), eye toggle hidden, filter nama lintas
> halaman (breadcrumb), crosshair zoom-ke-shape, klik = select sinkron
> canvas.

> **Putusan ulang (D81, arahan user):** jalur connector Penpot self-host
> (instance + token + RPC) DIBERHENTIKAN — terlalu berat (requirement stack
> eksternal, token per user, schema ketat). Yang dipertahankan dari Penpot
> adalah REFERENSI: data model shapes + konsep editor. Implementasi Yuika
> sendiri: **canvas editor embedded zero-dep** (tab Design) + tools
> `design_*` — tanpa server eksternal, tanpa token, user & persona menggambar
> di file yang sama. Riwayat jalur lama: TASKS.md D79–D79c.

Selesai (2):
- [x] **Model + store + tools** (D81): pages → frame/rect/circle/text
      (parentId + z-order, fills/stroke/radius/text), JSON di
      workspace/design/, revn per mutasi; 7 tools design_* (list/create_file/
      add_page/add_shape/update_shape/delete_shape/get_file) dengan validasi
      English + ringkasan persona-friendly. Test design.test.ts 3/3 +
      designer-wiring 2/2.
- [x] **Canvas editor embedded** (D81): tab Design = editor canvas 2D
      murni (bukan iframe): render frame/rect/circle/text + grid, select +
      move + resize handles, toolbar create, props panel (fill/stroke/radius/
      text/opacity), zoom/pan, undo/redo, multi-page, autosave 1.5 dtk +
      guard revn (409 stale). Persona ↔ user melihat saling mengedit
      (polling 12-15 dtk).

- [x] **Prototype mode (D83)**: tombol "Try it" di tab Design menjalankan
      file desain sebagai prototype hidup — renderer DOM atas JSON yang sama;
      wiring on-click antar layar (interaction navigate, Figma-style, bisa
      diset user di panel props ATAU persona via design_update_shape);
      live sync: edit canvas → autosave → player re-render (~2.5 dtk poll);
      transisi layar + back history + switcher layar/halaman; hapus frame
      target otomatis membersihkan wiring.

SELESAI (D86, run nyata):
- [x] **Persona draw loop hidup**: Picasso (sesi nyata) membaca skill
design-canvas-basics lalu design_create_file + 4x design_add_shape;
artboard otomatis isScreen=true; user edit via route canvas (PUT guard
revn) terbaca balik oleh persona.
- [x] **P2-DSN-4**: Hiro (sesi nyata) design_list lalu design_get_file lalu
write_file code/demo/LoginScreen.tsx dengan mapping nama shape ke elemen
di header + token warna dari fills; regenerate setelah user edit
(#007cf7 ke #5865f2) diff 3+/3- persis perubahan desain.
- [x] **P2-DSN-6**: golden path otomatis (design-golden-path.test.ts)
hijau 2x berturut + run nyata dua arah terverifikasi lewat trace.

100% ketika: golden path jalan di project demo tanpa keluar platform.

## F4 · Persona training & QA — 83%

Arena latihan + bukti kualitas persona: skill lahir dari misi nyata,
dinilai buta, readiness terlihat di roster; QA persona menonton layar.
Basis hitung: 6.5/9 milestone (D77 blind test infrastruktur +0.5; gerbang numeriknya menunggu penguji manusia).

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

Sisa (1.5):
- [ ] **ROADMAP #9** Minimal 1 persona produksi lulus misi research nyata
      → skill `ready` → di-assign ke project nyata (bukti end-to-end
      nilai arena, bukan hanya demo).
- [~] **P1-PER-5** Blind test antar persona — infrastruktur lengkap D77
      (core blindtest + tab Blind test di Persona Studio: 5 prompt uji,
      jawaban anonim A/B/C, tebakan penguji, skor + gate ≥80%, reveal).
      Menunggu: run nyata dengan penguji manusia lulus gerbang 80%.
- [x] **D78** Scribe dokumen v1: docx zero-dep (ZIP + document.xml → Markdown,
      heading + tabel pipe), paging offset/nextOffset semua format, PERSONA.md
      scribe pahami nextOffset; test 11/11.

100% ketika: dua gerbang live selesai — blind test penguji manusia ≥80%
dan 1 persona produksi lulus misi riset nyata → skill ready → di-assign
ke project nyata (arena terbukti menghasilkan persona terbedakan dan
siap pakai). Keduanya hanya butuh provider live di studio Anda; semua
mekanika sudah terpasang dan teruji.

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
