# Runbook alpha (G-ALPHA)

Operasional harian selama alpha internal. Ditulis untuk host staging
(notu.dev) tapi berlaku juga untuk host self-host mana pun.

## Layanan & titik kontrol

| Layanan | URL | Cek sehat |
| --- | --- | --- |
| Studio web | https://studio.notu.dev | buka halaman, konstelasi persona muncul |
| Studio api | https://studio.notu.dev/api/meta | `{"version":"…","latest":…}` |
| Portal | https://yuika.notu.dev | login page muncul |
| Relay | wss://yuika-relay.notu.dev/ws | portal Devices: host tampil online saat desktop jalan |
| Kunci api terkunci? | `curl -s -o /dev/null -w '%{http_code}' https://studio.notu.dev/api/personas` | **401 = benar** (200 = bahaya: auth mati) |

## Rutinitas harian

1. **Health sweep** (5 menit): tabel di atas + `docker compose ps` di VPS
   (semua `Up`, restart count tidak naik).
2. **Log error** (5 menit): `docker compose logs api --since 24h | grep -i
   error` - yang wajar: provider 429/timeout, approval timeout. Yang perlu
   lapor: unhandled exception, sqlite corruption, container restart loop.
3. **Metering vs tagihan** (mingguan): `node scripts/usage-report.mjs
   <db-path>` bandingkan total per model dengan tagihan provider;
   target selisih < 2% (angka hanya dari usage laporan provider).
4. **Backup**: Settings -> Backup -> unduh `yuika-restore.mjs`, simpan di
   tempat privat (host-only; portal TIDAK menyimpan backup). Coba restore
   sekali di folder kosong sebelum benar-benar butuh.

## Prosedur

### Update versi
`./scripts/update.sh` (atau Redeploy di Dokploy). Healthcheck otomatis;
kalau gagal, rollback: `git checkout <tag lama> && docker compose -f
docker-compose.prod.yml up -d --build`. Data user tidak tersentuh.

### Reset data host
Lihat `docs/PLAN-RESET-DATA.md` (scope penuh/work, konfirmasi bertingkat).

### Smoke staging (G-ALPHA)
Dari laptop dengan Playwright terpasang:

```bash
# akun khusus smoke di portal (atau biarkan kosong: spec mendaftarkan
# akun sekali-pakai otomatis)
STAGING_URL=https://studio.notu.dev \
STAGING_EMAIL=… STAGING_PASSWORD=… \
npx playwright test -c playwright.staging.config.ts
```

Skenario: meta publik, api terkunci 401, SSO portal (login -> Accept),
buat project, satu turn persona (biaya satu turn kecil), jawaban masuk,
project dihapus (bersih). Hijau = gerbang staging terpenuhi untuk hari itu.

### Sandbox no-escape
Lihat `docs/SANDBOX-CHECKLIST.md` (matrix vektor + cara run gated suite).

### Load (persiapan beta)
```bash
# stack lokal khusus (mock provider, tanpa biaya):
YUI_API_PORT=3391 … lihat docs/TEST-PLAN di scripts/load-test.mjs --help
node scripts/load-test.mjs --url http://127.0.0.1:3391 --sessions 100
```
Target beta: 100 sesi paralel, p95 turn-start < 2 dtk.

## Known issues (alpha)

| Gejala | Status | Kerja sementara |
| --- | --- | --- |
| Studio cloud bisa tertinggal versi dari repo | by design (deploy manual) | cek `/api/meta` vs tag rilis terakhir |
| `npm audit` dev-deps toolchain 6 advisory | waivered (lihat `docs/PUB-AUDIT.md`) | tidak ikut ter-ship ke produksi |
| Blind test persona dihapus | by design (F4 closed) | kualitas persona via dungeon + QA watch |
| Relay putus sesaat saat redeploy | by design | remote auto-reconnect; approval pending di-replay saat join |

Tambahkan baris baru di sini setiap kali isu alpha ditemukan; jangan
biarkan isu hidup hanya di memori.

## Cara lapor (alpha internal)

1. Repro terkecil + langkah, screenshot kalau UI.
2. Lampirkan trace: di app, tab Logs sesi terkait (copy JSON) atau
   `docker compose logs api --since 1h`.
3. Sensitive (key, data pribadi) JANGAN ditempel; host meredaksi log,
   tapi raw paste tetap tanggung jawab pelapor.
4. Kanal: issue repo internal / grup internal; label `alpha`.

## Definisi "alpha hijau"

- [ ] Smoke staging hijau 7 hari berturut (log run tersimpan)
- [ ] Sandbox escape suite hijau di host staging (output dilampirkan)
- [ ] Metering < 2% vs tagihan dua siklus tagihan
- [ ] 10 pengguna internal aktif 1 minggu, nol data loss
- [ ] Runbook ini di-update tiap isu baru
