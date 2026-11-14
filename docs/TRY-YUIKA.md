# Nyoba Yuika Tanpa Ngoding (Docker)

Panduan buat yang mau nyoba Yuika tanpa clone repo atau pasang Node. Cukup
Docker, narik image dari GitHub Container Registry, jalan.

Butuh waktu download pertama sekitar 1-2 menit (image ~400MB) tergantung
koneksi. Semua data Yuika (sesi chat, project, desain) disimpan di volume
Docker di mesin sendiri, bukan di cloud.

## 1. Prasyarat

- Docker 24+ (Docker Desktop di Windows/Mac, atau docker engine + compose v2
  di Linux). Cek: `docker compose version`.
- Browser modern.
- API key model OpenAI-compatible (OpenAI, Groq, OpenRouter, dan lain
  sebagainya). Gratis tidak wajib, tapi tanpa key persona tidak bisa bicara.

Tidak perlu akun GitHub atau token apa pun: image Yuika public.

## 2. Jalankan

```bash
mkdir yuika && cd yuika
curl -O https://raw.githubusercontent.com/ZamIzzudin/Yuika/main/deploy/docker-compose.ghcr.yml
docker compose -f docker-compose.ghcr.yml up -d
```

Windows PowerShell (kalau tidak punya curl):

```powershell
mkdir yuika; cd yuika
Invoke-WebRequest https://raw.githubusercontent.com/ZamIzzudin/Yuika/main/deploy/docker-compose.ghcr.yml -Outfile docker-compose.ghcr.yml
docker compose -f docker-compose.ghcr.yml up -d
```

Tunggu sampai `docker compose -f docker-compose.ghcr.yml ps` menunjukkan dua
service `healthy`/`running` (sekitar 30 detik), lalu buka:

    http://localhost:3000

## 3. Setup pertama kali di browser

1. Daftar akun lokal: klik sign in, pilih register (akun ini hanya hidup di
   mesin sendiri, tidak dikirim ke mana pun).
2. Buka Settings (ikon gear), tab Provider:
   - Provider kind: `openai-compat` (atau `anthropic` / `gemini`).
   - Base URL + API key sesuai layanan Anda.
   - Model: misal `gpt-4o` atau model di layanan Anda.
3. Save, lalu pilih persona (misal Hiro si coder) dan mulai chat.

Kalau lupa langkahnya, Yuika menampilkan onboarding di halaman depan.

## 4. Update versi

```bash
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

Data aman: upgrade image tidak menyentuh volume.

## 5. Hapus total

```bash
docker compose -f docker-compose.ghcr.yml down
docker volume rm yuika_yuika-data
```

## Yang perlu diketahui (batasan mode ini)

- Akses dari mesin yang sama. Web di-build dengan alamat API
  `http://127.0.0.1:3211`, jadi buka dari browser di mesin yang menjalankan
  Docker. Mau diakses dari HP, LAN, atau domain publik dengan HTTPS? Itu
  jalur deploy penuh: `docs/DEPLOY.md` (build sendiri + Caddy reverse
  proxy).
- Live browser sharing persona butuh Chromium sidecar / setup ekstra;
  di mode cepat ini fitur lain (chat, project, terminal sandbox, design
  canvas, skill studio) jalan normal.
- Apple Silicon (M1/M2/M3): image amd64, Docker Desktop menjalankannya via
  Rosetta (aktif default). Cukup lancar untuk mencoba.
- Terminal sandbox dan workshop container butuh akses docker socket; tanpa
  itu persona tetap bisa ngobrol, riset, dan mendesain.

## Versi tertentu

Tag image: `latest` (mengikuti main), `v0.8.1` (rilis), `sha-abc1234`
(commit tertentu). Ganti `:latest` di file compose bila ingin mengunci.
Daftar versi: github.com/ZamIzzudin/Yuika/pkgs/container/yuika-api
