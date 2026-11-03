# Skenario Test Mandiri — Studio Proyek P1

> Prasyarat: `npm run dev` (port 3000), `.env` terisi. Semua fitur di bawah sudah
> terverifikasi smoke live sesi dev 7 (65 test green). Durasi ±15 menit.

## A. Project & sesi ter-scope (PRJ-1/2/6)

1. Sidebar kiri → bagian **PROYEK** → **+** → nama `Landing Page` → **Buat**.
2. Pilih project itu → pilih persona **Conductor** → kirim:
   `Tulis file laporan singkat ke reports/hello.md`
3. ✅ Verifikasi: file muncul di `workspace/projects/<id>/reports/hello.md`
   (bukan di root `workspace/`). Badge project muncul di kanan header chat.
4. Klik badge project → drawer terbuka (roster + tasklist).

## B. Roster (PRJ-3) — siapa mengerjakan apa

1. Di drawer, bagian **Roster**: assign 3 persona:
   - Conductor — `Orkestrator` — **Bind MCP: filesystem**
   - Scholar — `Riset pasar`
   - Coder — `Implementer`
2. ✅ Chips `MCP:filesystem` muncul di baris Conductor (yang lain tidak).
3. ✅ Buka `workspace/projects/<id>/project.yaml` — roster tersimpan deklaratif
   (terbaca manusia, bisa diedit manual lalu refresh).

## C. Tasklist & TaskTree (PRJ-4/7)

1. Drawer bawah: tambah task `Riset kompetitor` (klik chip status untuk memutar
   `Belum → Kerja → Reviu → Selesai`).
2. Lewat agent (masih sesi Conductor di project):
   `Tambahkan task "Setup folder proyek" lalu tandai selesai`
3. ✅ Drawer auto-refresh saat agent memanggil `todo_*` (tanpa reload).
4. ✅ Buka `localhost:3000/api/projects/<id>/tree` — pohon dari replay event.
   Subtask dibuat via REST:
   ```bash
   curl -X POST localhost:3000/api/projects/<id>/tasks -H "Content-Type: application/json" \
     -d '{"title":"Contoh project","assignee":"yui-coder","parentId":"<id task induk>"}'
   ```
   → muncul nested di `/tree`.

## D. MCP trust gate (MCP-3) — panel sidebar bawah

1. Bagian **MCP**: server `filesystem` → **Untrust** → status jadi `untrusted`,
   titik indikator mati; refresh halaman → tetap untrusted (fail-closed).
2. **Trust** lagi → `14 tools`. (Kondisi awal bawaan: sudah trusted.)
3. Uji deny per-tool (opsional, via REST):
   ```bash
   curl -X PUT localhost:3000/api/mcp/servers -H "Content-Type: application/json" \
     -d '{"server":"filesystem","trusted":true,"denyTools":["move_file"]}'
   ```
4. ✅ Panel **Audit** (bawah panel MCP) menampilkan setiap panggilan tool MCP:
   nama tool, ok/gagal, alasan bila ditolak.

## E. Binding MCP project×persona (PRJ-5) — tes kunci

1. Pastikan `filesystem` **trusted** (langkah D), dan Conductor ter-bind
   `MCP:filesystem` di roster (langkah B).
2. Sesi Conductor di project, kirim:
   `Pakai tool MCP filesystem list_allowed_directories, sebutkan folder yang diizinkan. Singkat.`
3. ✅ Agent menjawab isi `reports/` — dan panel Audit menampilkan baris
   `filesystem.list_allowed_directories ok=true`.
4. **Negative test** (persona tanpa binding): buka sesi **Scholar** di project yang
   sama (roster Scholar tanpa binding), kirim instruksi serupa.
   ✅ Agent TIDAK punya tool filesystem — menjawab tanpa akses file sistem
   (tool MCP disembunyikan; bukti di `tool.call` event stream — tidak ada
   `mcp__filesystem__*`).
5. ✅ Sesi persona TANPA project (scope Workspace): tool MCP juga tidak tersedia.

## F. Bersih-bersih setelah test (opsional)

- Hapus project uji: saat ini via REST/sqlite belum ada endpoint delete —
  untuk demo, cukup biarkan atau arsipkan (PATCH `/api/projects/<id>` `{"status":"archived"}`).

## Checklist singkat

- [ ] A: file agent mendarat di `projects/<id>/` ✓
- [ ] B: roster 3 persona + chips binding ✓
- [ ] C: task agent ↔ drawer sinkron; `/tree` nested ✓
- [ ] D: untrust = putus; trust = 14 tools; audit terisi ✓
- [ ] E: persona ter-bind bisa; tanpa binding tidak bisa ✓
