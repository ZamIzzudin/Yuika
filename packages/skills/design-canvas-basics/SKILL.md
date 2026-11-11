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
text) tapi tersimpan sebagai file JSON host — tanpa server eksternal, tanpa
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
design_create_file { name: "Login — Mobile" }
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
- **Penamaan jelas** semua shape (name = komponen, bukan default) — ini yang
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
