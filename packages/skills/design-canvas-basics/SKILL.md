---
name: design-canvas-basics
description: "Draw design files in the studio's embedded canvas (design_* tools): frames, shapes, and text as JSON the user views and edits live in the Design tab - no external app needed."
version: 0.1.0
author: Yuika Team
license: MIT
metadata:
  yui:
    category: design
    personas: [yui-designer]
    status: ready
---

Skill untuk persona Designer: menggambar desain langsung di canvas studio
built-in (tab Design). Model terinspirasi Penpot (pages → frame/rect/circle/
text) tapi tersimpan sebagai file JSON host, tanpa server eksternal, tanpa
token. User melihat hasil live dan bisa ikut mengedit; perubahan user juga
terbaca kembali lewat `design_get_file`.

## Alur standar

1. `design_create_file {name}` → simpan `fileId` + `pageId` halaman pertama.
2. Buat **frame artboard** per layar (mis. 390x844 mobile) di level halaman.
3. Tambah anak-anak frame: `design_add_shape` dengan `parentId` = id frame.
   **Koordinat anak relatif ke frame induk**; koordinat root relatif kanvas.
4. Iterasi kecil-kecil (5-10 shape per panggilan), lalu laporkan fileId +
   halaman; user memantau di tab Design (refresh otomatis).
5. Baca balik (termasuk hasil edit user): `design_get_file {fileId}`.

## Bentuk shape

- `frame`: artboard/container. Anak-anak di-anchor via `parentId`. Labelnya
  tampil di atas frame di editor.
- `rect`: blok, tombol, input, divider. Pakai `radius` untuk sudut membulat.
- `circle`: avatar, ikon bulat, indikator.
- `text`: label/heading/body. Field wajib: `text`, `fontSize`, `color`.

Semua warna format `#rrggbb` (hex 6 digit). `fill` = warna isi,
`strokeColor`+`strokeWidth` = garis tepi, `opacity` 0..1.

## Contoh: kartu login mobile

```
design_create_file { name: "Login - Mobile" }
  → fileId, pageId p1

design_add_shape { fileId, pageId: p1, shape: { type: frame, name: "Artboard 390",
  x: 0, y: 0, width: 390, height: 844, fill: "#101014" } }
  → id f1

design_add_shape { fileId, pageId: p1, parentId: f1, shape: { type: frame,
  name: "Card", x: 24, y: 200, width: 342, height: 420, fill: "#1a1a20",
  radius: 16 } }

design_add_shape { fileId, pageId: p1, parentId: f1, shape: { type: text,
  name: "Heading", x: 48, y: 240, width: 294, height: 32, text: "Welcome back",
  fontSize: 24, fontWeight: 600, color: "#f4f4f5" } }

design_add_shape { fileId, pageId: p1, parentId: f1, shape: { type: rect,
  name: "Button Sign in", x: 48, y: 520, width: 294, height: 48,
  fill: "#007cf7", radius: 10 } }

design_add_shape { fileId, pageId: p1, parentId: f1, shape: { type: text,
  name: "Button label", x: 48, y: 536, width: 294, height: 20,
  text: "Sign in", fontSize: 15, fontWeight: 600, color: "#ffffff",
  align: "center" } }
```

## Disiplin kualitas

- **Kontras**: teks di atas fill gelap pakai `#f4f4f5`; di atas fill terang
  pakai `#18181b`. Uji mental: masih terbaca di layar kecil.
- **Spacing scale konsisten**: 4/8/12/16/24/32/48. Padding kartu min 24.
- **Satu aksen** untuk tombol/CTA; sisanya monokrom.
- **Penamaan jelas** semua shape (name = komponen, bukan default); ini yang
  dibaca Coder saat generate komponen.
- Teks minimum fontSize 12 (body 14-16, heading 20-32).
- Jangan menumpuk shape tak terlihat; kalau ada revisi pakai
  `design_update_shape`/`design_delete_shape`, bukan menimbun duplikat.

## Iterasi & handoff

- Revisi kecil: `design_update_shape { patch }` (hanya field yang berubah).
- Hapus: `design_delete_shape` (frame menghapus semua anaknya).
- Halaman per layar/flow berbeda: `design_add_page`.
- Handoff ke Coder: sebut fileId; Coder membaca `design_get_file` untuk
  struktur (nama, tipe, posisi, ukuran, warna) lalu generate komponen.

## Prototyping (wiring on-click)

Satu frame root per halaman = satu **layar prototype**. Frame root baru
otomatis ditandai `isScreen: true` (uncheck "Screen (prototype)" di panel
props, atau patch `isScreen: false`, untuk menyembunyikannya dari player).
Shape lepas di level halaman (bukan frame) TIDAK pernah jadi layar. Tombol
"Try it" di tab Design menjalankan prototype; user melihat perubahan desain
live ~2.5 dtk.

Wire navigasi antar layar lewat update patch `interaction`:

```
design_update_shape { fileId, pageId, id: tombol-login,
  patch: { interaction: { action: "navigate", target: <id frame root / id halaman> } } }
```

Aturan: target harus frame ROOT di halaman yang sama atau id halaman lain
dalam file yang sama; null menghapus wiring. Gunakan untuk flow multi-layar
(mis. "Sign in" → Dashboard). Semua tombol penting sebaiknya ter-wire agar
prototype terasa hidup. Ringkasan `design_get_file` menampilkan wiring
sebagai `onClick: navigate:<target>` dan penanda `isScreen` per frame root.

## Font bank (Google Fonts, D102)

Text shape menerima `fontFamily` (field opsional; tanpa itu = system sans).
Pilih HANYA dari bank di bawah (validasi menolak nama lain); pasangkan
sesuai role: display/h1 dari keluarga serif atau display, body sans,
label/data mono. Style pack design-style-library menyebut font - pakai
nama yang sama (brand font non-Google otomatis disubstitusi).

- sans: Inter, Geist, Plus Jakarta Sans, Manrope, Sora, DM Sans, Outfit, Figtree, Urbanist, Lexend, Work Sans, Montserrat, Poppins, Nunito, Rubik, Karla, Mulish, Barlow, Archivo, Libre Franklin, Public Sans, Open Sans, Roboto, Lato, Jost, Epilogue, Space Grotesk, Chakra Petch, Darker Grotesque, IBM Plex Sans, Noto Sans, Raleway, Quicksand, Ubuntu
- serif: Playfair Display, Lora, Merriweather, Bitter, Source Serif 4, Libre Baskerville, Crimson Text, EB Garamond, Cormorant Garamond, Fraunces, Instrument Serif, DM Serif Display, Noto Serif Display, Gelasio, STIX Two Text, IBM Plex Serif, PT Serif
- mono: JetBrains Mono, IBM Plex Mono, Space Mono, Fira Code, Source Code Pro, Roboto Mono, Geist Mono, PT Mono, Anonymous Pro, Inconsolata, Ubuntu Mono, Overpass Mono
- display: Archivo Black, Anton, Bebas Neue, Oswald, Abril Fatface, Limelight, Bangers, Germania One, Audiowide, Press Start 2P, VT323, Silkscreen, New Rocker, Macondo, Fascinate
- handwriting: Caveat, Pacifico, Kalam, Patrick Hand, Dancing Script, Delius Swash Caps, Delicious Handrawn

Contoh:

```
design_add_shape { fileId, pageId, parentId: frame, shape:
  { type: "text", text: "Ringkasan", x: 24, y: 24, width: 320, height: 40,
    fontSize: 28, fontWeight: 700, fontFamily: "Space Grotesk", color: "#f4f4f5" } }
```

## Icon bank (SVG, D103)

Shape `icon` menggambar ikon SVG vektor (Phosphor regular) - JANGAN pakai
emoji atau karakter unicode sebagai ikon. Ukuran = width/height shape
(persegi), warna = fill shape. Nama kebab-case dari katalog:

- navigation (23): house, house-simple, house-line, compass, magnifying-glass, map-pin, sidebar-simple, navigation-arrow, arrow-left, arrow-right, arrow-up, arrow-down, arrow-up-right, arrow-down-right, arrow-square-out, arrow-clockwise, arrow-counter-clockwise, caret-up, caret-down, caret-left, caret-right, corners-out, arrows-out
- actions (44): plus, minus, x, check, check-circle, prohibit, trash, trash-simple, pencil-simple, pencil-line, eraser, paint-brush, paint-bucket, scissors, copy, clipboard, clipboard-text, download-simple, upload-simple, share-network, lock, lock-open, eye, eye-slash, funnel, sliders-horizontal, gear, wrench, hammer, magic-wand, sparkle, lightning, fire, rocket, flag, star, heart, bookmark-simple, push-pin, bell, bell-slash, dots-three, dots-three-vertical, dots-six-vertical
- media (15): play, pause, stop, skip-back, skip-forward, speaker-high, speaker-slash, microphone, camera, video-camera, image, images, film-slate, music-note, headphones
- objects (50): file, file-text, files, folder, folder-open, folder-simple, archive, note, notebook, book, books, bookmark, calendar, calendar-check, printer, tag, package, shopping-cart, shopping-bag, storefront, wallet, bank, money, currency-dollar, receipt, chart-bar, chart-line, chart-line-up, chart-pie, graph, table, database, cloud, cloud-arrow-up, cloud-arrow-down, hard-drives, cpu, hard-drive, terminal, code, code-simple, git-branch, git-merge, git-commit, bug, test-tube, flask, atom, lightbulb, key
- people (16): user, users, user-circle, user-plus, handshake, chats, chat-circle, chat-teardrop, envelope, phone, phone-call, device-mobile, desktop, device-tablet, wifi-high, cell-signal-high
- status (16): info, warning, warning-circle, xcircle, question, thumbs-up, thumbs-down, smiley, smiley-sad, seal-check, shield-check, shield-warning, spinner-gap, hourglass, clock, timer
- text (14): text-aa, text-b, text-italic, list, list-bullets, list-checks, text-align-left, text-align-center, text-align-right, paragraph, quotes, hash, at, link
- nature (14): sun, moon, moon-stars, cloud-sun, cloud-rain, cloud-lightning, snowflake, drop, leaf, tree, flower, plant, dog, cat
- misc (29): coffee, fork-knife, airplane, airplane-takeoff, car, bicycle, globe, globe-hemisphere-west, buildings, toolbox, first-aid-kit, pill, stethoscope, graduation-cap, medal, trophy, crown, diamond, gift, balloon, confetti, puzzle-piece, target, crosshair, crosshair-simple, binoculars, anchor, trend-up, trend-down

Contoh:

```
design_add_shape { fileId, pageId, parentId: frame, shape:
  { type: "icon", icon: "chart-line-up", x: 24, y: 96, width: 24, height: 24,
    fill: "#22c55e" } }
```

Idealnya ikon dipasangkan label teks (ikon 20-24px + label 14px, gap 8),
bukan berdiri sendiri kecuali memang konvensi (tombol ikon).
