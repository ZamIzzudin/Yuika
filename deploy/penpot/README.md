# Penpot self-host untuk Yuika (F3 design-to-code)

Stack Penpot 2.18.x yang disusutkan untuk dipakai bersama connector host
(`YUI_PENPOT_URL` + `YUI_PENPOT_TOKEN`) dan tab Design (viewer share-link
ter-embed, P2-DSN-3).

## Menjalankan (sekali)

```bash
cd deploy/penpot
cp .env.example .env  # kalau belum ada; isi PENPOT_SECRET_KEY acak
docker compose up -d
# buka http://localhost:9001
```

Service: frontend (9001), backend, exporter (PNG/SVG headless),
admin-console, postgres 15, valkey 8.1. Tanpa mailpit: registrasi langsung
aktif (flag `disable-email-verification` + `registration` +
`login-with-password`).

## Embed (kenapa file nginx-security-headers.conf)

Image Penpot memasang `X-Frame-Options SAMEORIGIN` hardcoded, yang
memblokir iframe lintas origin. Override ini melepas header tersebut
(sementara; CSP bawaan jalan report-only). Untuk produksi (origin publik):
ganti override dengan CSP enforce `frame-ancestors https://<origin-studio>`
agar hanya studio yang boleh meng-embed.

## Membuat access token (untuk YUI_PENPOT_TOKEN)

1. Register/login di http://localhost:9001.
2. Avatar (kanan atas) → Settings → Access tokens → New token.
3. Salin token → set di host studio: `YUI_PENPOT_URL=http://localhost:9001`,
   `YUI_PENPOT_TOKEN=<token>` → restart host.
4. Verifikasi dari chat persona Designer: `penpot_status` (profil muncul),
   lalu `penpot_setup_project` sekali.

## Daya tarik arsitektur

- Persona Designer menulis desain headless (RPC `update-file`, protocol
  `changes` editor) — lihat skill `penpot-designer-basics`.
- Tab Design menampilkan viewer share-link; perubahan muncul realtime
  (viewer menyambung websocket yang sama dengan editor).
- Fase develop: `penpot_get_file` → struktur objek → generate komponen.
