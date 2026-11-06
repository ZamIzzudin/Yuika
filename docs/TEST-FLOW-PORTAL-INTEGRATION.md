# TEST FLOW — Integrasi Portal Nyata × Fitur Belum Teruji Manual

> Panduan menjalankan sendiri (manual) alur yang belum sempat dites user.
> Gerbang otomatis sudah HIJAU: `npx tsx scripts/portal-integration.mts`
> → **45/45 PASS** vs portal produksi (web :3100 + relay :3101), tanpa patch
> di kedua repo. Dokumen ini = versi KLIK/UI dari alur yang sama + fitur
> Batch 2 (Terminal, egress, MCP sandbox).

## 0. Persiapan (sekali)

```bash
# terminal 1 — portal WEB dulu (membuat data/portal.db)
cd d:/projects/yuika-portal && npm run dev -w @yuika-portal/web     # :3100

# terminal 2 — relay SETELAH web up
cd d:/projects/yuika-portal && npm run start -w @yuika-portal/relay # :3101

# terminal 3 — Yuika
cd d:/projects/your-yui && npm run dev                              # api :3211 + web
```

Smoke: `curl http://localhost:3101/healthz` → `{"ok":true,...}`.

Default env Yuika (`YUI_PORTAL_URL=http://localhost:3100`,
`YUI_RELAY_URL=ws://localhost:3101`) sudah cocok — cek `.env`.

---

## F1 · Pairing device host Yuika ↔ portal (alur nyata)

**Uji:** token dari web portal → Yuika Settings → Pair → device terdaftar +
aktivitas tercatat. (Gerbang otomatis S1/S10 setara; ini versi UI.)

1. Browser A `http://localhost:3100/account/register` → buat akun (auto-login).
2. Halaman **Devices** → kartu **Desktop** → *Link a device* → muncul **QR +
   token** (berlaku **120 detik**, sekali pakai).
3. Yuika (browser B): **Settings → Portal** → paste token → **Pair**.
4. **Ekspektasi:**
   - Yuika menampilkan status device aktif (badge/label portal).
   - Portal Devices: device Desktop terisi (bukan "not linked"), nama sesuai
     input Yuika.
   - *Recent activity* (refresh ≤15 dtk): event `auth_ok` / `host_online`.
5. Uji negatif (opsional): paste token ulang → **409 already used**; tunggu
   >120 dtk → **410 expired**; spam Pair >10×/menit → **429** (tunggu 60 dtk).

> Rate limit claim = 10 permintaan/menit/IP. Bila Pair terus 429 saat tes
> berulang: tunggu 1 menit atau restart proses web portal.

## F2 · Remote control via `/dev/remote` (relay produksi)

**Uji:** HP/browser kedua mengendalikan host lewat relay nyata :3101
(bukan SpecRelay double). E2E otomatis `remote.spec.ts` pakai double; alur
ini yang belum pernah jalan di relay produksi.

1. Pastikan F1 sukses (host Yuika sudah paired + host worker jalan).
2. Portal (browser A): Devices → kartu **Web** → *Link a device* → token.
3. Browser B (atau device lain di LAN): `http://localhost:3990/dev/remote`
   → paste token web → **Connect** → pilih host → **Join**.
4. **Ekspektasi:**
   - Status join OK; hostId/nama host muncul.
   - Kirim prompt (`send_prompt` E2E): streaming `message.delta` tampil di
     remote; jawaban final juga tampil di host.
   - Minta agent menulis file di luar `code/|docs|reports/` (mis.
     `notes/x.txt`) → **kartu approval** muncul di remote → *Approve* →
     host melanjutkan (kartu berubah `approved`).
   - Reload browser remote → **resume snapshot** (history + approval state).
   - Buka remote kedua (incognito) → kedua remote live (status 2 remote);
     box broadcast hanya terbuka pemiliknya.
5. Uji drop: matikan WiFi/mati koneksi host ±10 dtk → remote:
   `host_offline`; kirim data saat offline → soft `err 4104` (koneksi tetap);
   host kembali <60 dtk → `host_back` + session nyambung lagi (sticky).

## F3 · Terminal tab — shared user & agent (Batch 2)

**Uji:** satu sesi terminal untuk user DAN agent + approval perintah
berisiko. (e2e `terminal.spec.ts` T1-T3 hijau di jalur local-shell; di mesin
dengan Docker aktif otomatis pakai sandbox container.)

1. Yuika: buka project → tab **Terminal** → status `● ready`.
2. Ketik `node -v` + Enter → output versi muncul (lokal-echo + balasan).
3. Chat (project lead): *"Run node -v in the shared terminal."* → agent
   menjalankan tool `terminal` → **output muncul DI TAB YANG SAMA**, tanpa
   approval (node = aman).
4. Minta: *"Run npm publish --dry-run in the terminal."* → **kartu
   approval** muncul → *Approve once* → perintah jalan di tab.
5. Ekspektasi negatif: `npm publish`/`git push`/`curl`/`rm` SELALU minta
   approval; `npm install|ci|run|test`, `git status|commit`, `ls/cat/echo`
   bebas.

## F4 · Egress + MCP sandbox (butuh Docker Desktop — opsional)

**Uji:** npm install lewat allowlist proxy + MCP worker dalam container.
Env dev tanpa Docker → jalur ini hanya bisa diuji bila Docker aktif.

1. Docker Desktop running → Yuika otomatis `YUI_TERMINAL_MODE=auto` memakai
   container (Terminal tab status tetap `● ready`).
2. Egress allowlist per project: `<workspace>/.yuika/egress.json`:
   ```json
   { "allow": ["registry.npmjs.org", "github.com"] }
   ```
3. Di Terminal: `npm install left-pad` → sukses (registry diizinkan);
   `curl https://evil.example` → gagal (deny by default, bukan crash).
4. MCP worker sandbox: `mcp.json` per server `"sandbox": true` (atau
   `"auto"`) + `"egress": ["registry.npmjs.org"]` → restart API → server
   MCP jalan dalam container; Devices/audit tak terlibat.
5. Tanpa Docker + `"sandbox": true` → server MCP GAGAL (fail-closed, by
   design); `"auto"` → fallback stdio + peringatan di log.

---

## Hasil gerbang otomatis (2026-11-07)

`scripts/portal-integration.mts` — checklist `yuika-portal/docs/INTEGRATION.md`
§5 lengkap **45/45 PASS**: S1 auth/bad-sig 4003/unlinked 4001 · S2 cross-account
join 4003 (CP-1) · S3 join dhPub dua arah · S4 send_prompt→message.delta E2E ·
S5 broadcast 2 remote box per-pemilik · S6 list_hosts urut deviceId · S7 sticky
host_offline/err 4104/host_back/remote_joined · S8 bye 4105 + 4201 · S9 golden
vectors identik · S10 claim 201/409 used/409 clash/410 expired/429 Retry-After ·
bonus audit device_events. Regresi: `live-portal-smoke.mts` 8/8, e2e 7/7.

Catatan teknis (ketemu saat integrasi, bukan bug): field bye relay = `error`
(string beku tetap sesuai §4.7); issue token baru per account+kind
menghapus token lama (410 hanya tercapai tanpa re-issue); rate limit
fixed-window 10/mnt/IP dan request yang ditolak tidak dihitung.
