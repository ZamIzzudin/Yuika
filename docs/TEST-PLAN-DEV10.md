
### M16 (P0) — Delegation persist + schema MCP nyata + load (P0-DEL-1/MCP-2/QA-2)
1. Minta Conductor mendelegasikan tugas; saat berjalan, **restart dev server**,
   lalu buka lagi project.
  - ✅ Kartu delegasi tertutup jujur ("terputus — server direstart…"), bukan
     chip "working" zombie.
  - ✅ `curl http://localhost:3000/api/projects/<id>/delegations` → field `jobs`
     berisi baris job status `interrupted` + error "server direstart saat job
     berjalan" (audit lintas restart).
2. Delegasi normal selesai → job status `done` + `summary` terisi; delegation
   yang anaknya gagal (mis. matikan API key sementara) → job `error` + kartu
   parent tertutup dengan ringkasan gagal.
3. Tool MCP dengan argumen WAJIB (mis. tailscale device name): agent memanggil
   dengan argumen benar — schema asli kini sampai ke provider (tool-call lebih
   akurat); argumen salah ditolak "invalid args (json schema)".
4. (Otomatis) `load-light.test.ts` — 10 sesi paralel × 5 turn hijau di CI.

> **Fix dev-10 (laporan user):** klik Setujui pada approval pernah 404
> "request tidak dikenal / sudah selesai" padahal kartu baru muncul — akar:
> Next.js dev membundel @yui/core terpisah per route; map pending approval
> module-local jadi kosong di copy route approvals. Fix: map di-cache
> globalThis (pola bus emitter) + kegagalan resolve kini TAMPIL sebagai item
> error di chat (tidak diam). Regresi: `approval-hmr.test.ts`.

### M17 (P0) — Performa & realtime (fix dev-10: "task sederhana 30 menit")
1. Minta persona menulis file besar (landing page). Saat agent bekerja:
  - ✅ Muncul blok **💭 Berpikir…** yang STREAMING (bukan chat diam total) —
     pikiran model GLM kini terlihat; klik untuk kolaps/expand.
  - ✅ Kalau via delegasi: kartu delegasi menampilkan **feed live** (dot
     berdenyut: teks/pikiran/aktivitas tool anak) — bukan kartu statis
     sampai selesai.
2. Setelah beberapa iterasi menulis/membaca file, cek tab Trace:
  - ✅ Tabel trace update **realtime** (tanpa delay 3 dtk polling) — tab
     refetch saat event baru tiba.
3. Sesi panjang (banyak file): durasi per iterasi TIDAK memburuk linear —
     prompt lama "diet" (isi file lama diarsipkan di view, `+arsip n chars`).
     Verifikasi cepat: `curl /api/sessions/<id>/trace` → kolom token per turn
     stabil, tidak 30k+.
4. Total waktu tugas sederhana target: menit-an pertama terasa "hidup"
     (streaming reasoning), meskipun model berpikir lama — itu properti model
     (glm-5 reasoning besar), bukan UI/orkestrasi.
