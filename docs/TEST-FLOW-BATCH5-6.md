# Test Flow Manual Besar — Batch 5 (Workflow) + Batch 6 (Workbench) + Portal Tertunda

>Tanggal: 2026-11-08 · Durasi est. 45–60 menit · Eksekusi manual oleh user dengan
>pendampingan asisten. Semua langkah punya kolom **Hasil** — isi saat test
>(OK / gagal + catatan). E2e otomatis sudah hijau (13/13); tujuan dokumen ini
>adalah verifikasi LIVE dengan provider nyata + pengalaman user sebenarnya.

## 0. Persiapan

1. **Stack Yuika** (repo ini):
   ```bash
   npm run dev
   ```
   Terima konfigurasi default. Catat port web (biasanya :3000) & API (:3211).
2. **Provider nyata** aktif di Settings → Provider (sudah tersimpan di DB dev).
3. **Portal stack** (untuk bagian P — opsional tapi disarankan):
   ```bash
   cd d:/projects/yuika-portal && npm run dev
   ```
   (portal :3100, relay :3101).
4. Siapkan 1 project baru untuk seluruh sesi test: **New project** dari
   sidebar → nama `Manual Batch56` → pilih persona lead default (conductor).

Lolos kriteria umum: tidak ada crash console web (F12), API log level info
bersih dari stack error, semua tombol memberi feedback ≤ 2 dtk.

---

## A. Workflow Engine — Batch 5 (FLOW-1..6)

### A1. Start run + board live (FLOW-1/2/5)
| # | Langkah | Ekspektasi | Hasil |
|---|---------|-----------|-------|
| 1 | Buka project → tab **Flow** | Kolom "Start run" tampil; template default 7 fase | |
| 2 | Isi brief: `Build a product landing page for a coffee brand.` → **Start run** | Run baru muncul; kolom fase Planning aktif (kartu step ber-spin), chip status running | |
| 3 | Tunggu fase planning selesai | Ringkasan step muncul di kartu (teks pendek) | |
| 4 | Klik kembali tab **Chat** → **Flow** | Board tetap ada (state tak hilang) | |

### A2. Gate approve (FLOW-3)
| # | Langkah | Ekspektasi | Hasil |
|---|---------|-----------|-------|
| 1 | Setelah fase planning selesai | Banner gate **Approve / Reject** + ringkasan fase | |
| 2 | Klik **Approve** | Fase berikut (research) mulai; banner hilang | |
| 3 | Coba **Reject** di gate fase research | Run berhenti → status failed/stopped, pesan jelas | |

### A3. Restart mid-run — resume (FLOW-3, acceptance batch)
| # | Langkah | Ekspektasi | Hasil |
|---|---------|-----------|-------|
| 1 | Start run BARU, approve gate pertama, saat fase research berjalan → **matikan API** (Ctrl+C di terminal `npm run dev`), jangan Stop run | — | |
| 2 | Nyalakan ulang `npm run dev` → buka tab Flow | Run muncul dengan status running/paused; fase done TETAP done (tidak diulang); gate yang belum diputus ditanyakan lagi | |
| 3 | Lanjutkan approve sampai selesai | Run done; semua fase hijau | |

### A4. Steering mid-run (FLOW-6)
| # | Langkah | Ekspektasi | Hasil |
|---|---------|-----------|-------|
| 1 | Run baru → saat gate planning tampil, isi **Steer**: `Use a warm brown palette.` → **Steer** | Input ter-reset; event muncul; instruksi dipakai fase BERIKUTNYA | |
| 2 | Klik **Pause** (saat gate) | Chip status paused LANGSUNG | |
| 3 | Approve gate sambil paused | Tetap paused; banner gate hilang | |
| 4 | **Resume** | Fase berikut jalan | |
| 5 | Di kartu step pending (mis. research), buka dropdown **Reassign** → pilih persona lain | Kartu menampilkan persona baru | |
| 6 | **Stop** run aktif | Status stopped; tidak ada proses nyasar | |

---

## B. Planner & Task Validator — Batch 5 (PM-1..3)

| # | Langkah | Ekspektasi | Hasil |
|---|---------|-----------|-------|
| 1 | Tab Config → Roster → pastikan `yui-planner` bisa dipilih; buka sesi chat dgn **Planner** | Persona planner aktif | |
| 2 | Kirim brief besar: `Plan a v2 release for our landing page builder: pricing page, docs site, and email templates. Produce a full task list.` | Planner menulis docs/PLAN.md + menambah task via todo_add dgn acceptance/depends_on/estimate/phase | |
| 3 | Tab **Task** | Task list detail (perluas kartu: acceptance, deps, assignee) | |
| 4 | Buka `GET http://127.0.0.1:3211/api/projects/<id>/tasks/validate` di browser | JSON: `ok: true`, `stats.phaseCoverage` 7 fase terisi ≥1, warnings minim | |
| 5 | (Negatif) Tambah task manual tanpa phase via REST → validate lagi | `ok: false` + error fase tidak ter-cover | |

> Catatan: kalau provider nyata tidak mengisi semua field, validator akan
>menunjukkan warning mana yang kurang — itu perilaku benar, bukan bug.

---

## C. Workbench Studio — Batch 6 (STU-1/7/4)

### C1. Tab shell (STU-1)
| # | Langkah | Ekspektasi | Hasil |
|---|---------|-----------|-------|
| 1 | Di tab Chat ketik draft (JANGAN kirim) `catatan penting` | — | |
| 2 | Klik tab **Files** | Desktop: dua kolom — chat kiri (draft masih ada), panel Files kanan | |
| 3 | Kembali **Chat** | Draft `catatan penting` MASIH ada, scroll position utuh | |
| 4 | Kecilkan window < 1024px → buka Files | Mobile: panel penuh; chat disembunyikan (bukan reload) | |

### C2. Docs tab (STU-7)
| # | Langkah | Ekspektasi | Hasil |
|---|---------|-----------|-------|
| 1 | Tab **Docs** | Panel kiri: Run reports (dari A) + Documents (.md project termasuk docs/PLAN.md planner) | |
| 2 | Klik salah satu Run report | Ter-render markdown: heading fase, checklist step, gate approved | |
| 3 | Klik docs/PLAN.md | Isi dokumen terbaca | |

### C3. Browser tab read-only (STU-4)
| # | Langkah | Ekspektasi | Hasil |
|---|---------|-----------|-------|
| 1 | Tab **Browser** → ketik `https://example.com` → **Open** | Halaman ter-render di iframe (read-only) | |
| 2 | Ketik `https://google.com` → Open | Error 403 rapi: domain tidak di allowlist | |
| 3 | Tambah allowlist: buat file `.yuika/browser.json` di ROOT FOLDER PROJECT (rootPath project, cek `GET /api/projects` → field `rootPath`; default di bawah `data/workspace/`) isi `{"allow":["google.com"]}` → Open lagi | Google terbaca (jika jaringan OK) | |
| 4 | Minta agent (chat scholar): `Fetch https://example.com and summarize` lalu kembali ke tab Browser → **History** | Entri `agent` muncul (web_fetch tercatat); klik → halaman sama terbuka | |
| 5 | F12 console | TIDAK ada error CSP/script dari halaman pihak ketiga | |

---

## D. Regresi cepat (batches lama, 5 menit)
- [ ] Terminal: echo-shell? (di dev = shell lokal) — ketik `node -v` → output tampil.
- [ ] File: upload PDF kecil → muncul di tree uploads/.
- [ ] Team: delegasi berlangsung → node anak tampil live.
- [ ] Settings → Provider smoke test masih hijau.

---

## P. Portal (tertunda dari batch 1 — WAJIB sebelum lanjut batch lain)
| # | Langkah | Ekspektasi | Hasil |
|---|---------|-----------|-------|
| P1 | Logout web → Sign in via portal (SSO) | Kembali ke app sbg user portal; Settings → Portal: web session online | |
| P2 | Portal → Account → Devices: pastikan `Yuika web (SSO)` listed | Device web auto-link tampil | |
| P3 | **Auto-link pasca-fix `20445fc`**: ulangi logout → SSO | Devices portal bertambah tepat 1 (tak duplikat) | |
| P4 | **CP-5 Unlink**: di portal, unlink device web ini | Web Yuika ter-kick ≤ 2 dtk: bye code 4001 permanen (tidak reconnect loop) | |
| P5 | Relogin SSO setelah unlink | Bisa masuk lagi (device baru) | |

---

## Pelaporan
Setiap kegagalan → catat: nomor langkah, screenshot, waktu, dan 20 baris log
API terakhir (`apps/api` console). Asisten akan memperbaiki + menambah
regression test sebelum batch berikutnya.
