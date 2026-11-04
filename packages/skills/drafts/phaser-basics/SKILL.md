---
name: phaser-basics
description: Memulai atau memodifikasi game 2D dengan Phaser 3: scene lifecycle (preload/create/update), physics sprite, input keyboard, dan arcade physics.
metadata:
  yui:
    status: draft
    source: "Misi latihan riset dokumentasi Phaser (reports/riset-phaser-basics.md, code/phaser-demo/)"
---
# Dasar Phaser 3 — prosedur praktik (terverifikasi di misi riset, lihat code/phaser-demo/ dan reports/riset-phaser-basics.md)

## 1. Setup
- HTML + CDN Phaser 3.80.1: `<script src="https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js"></script>`
- Jalankan lewat server lokal (`python3 -m http.server 8000`), bukan `file://`.
- Konfigurasi minimum: `{ type: Phaser.AUTO, width, height, physics: { default: 'arcade', arcade: { gravity: { y: 400 } } }, scene: MyScene }` lalu `new Phaser.Game(config)`.

## 2. Scene lifecycle (urutan panggil otomatis)
- `preload()` — SEKALI di awal: muat aset (`this.load.image('key', 'path')`). Tanpa file aset: generate tekstur via `this.make.graphics({add:false})` + `generateTexture('key', w, h)`.
- `create()` — SEKALI setelah preload: bangun dunia (sprite, collider, tangkap referensi input).
- `update()` — TIAP FRAME (±60/dtk): polling input & logika gerak.
- Kesalahan umum: menaruh logika gerakan di `create` → tidak pernah dijalankan per-frame.

## 3. Sprite + physics arcade (di create)
- Pemain: `this.player = this.physics.add.sprite(x, y, 'key')` → otomatis punya `.body`. Tambahan: `setCollideWorldBounds(true)`.
- Lantai: `this.physics.add.staticImage(x, y, 'ground')` (benda statis, tak terkena gravitasi).
- Tabrakan WAJIB didaftarkan: `this.physics.add.collider(this.player, ground)` — tanpa ini benda saling menembus.

## 4. Input keyboard (di create, simpan referensi)
- Panah: `this.cursors = this.input.keyboard.createCursorKeys()` → objek {up, down, left, right, space, shift}.
- Huruf: `this.keys = this.input.keyboard.addKeys('W,A,D')`.
- Baca status di update: `if (this.cursors.left.isDown) ...`

## 5. Gerakan (di update) — pola set-velocity per frame
- Kiri/kanan: `setVelocityX(-200)` / `setVelocityX(200)`, else `setVelocityX(0)` (gerakan stop-start).
- Lompat: `if (jump && this.player.body.touching.down) setVelocityY(-430)` — guard `touching.down` mencegah lompat di udara.

## Jebakan terkonfirmasi (tutorial resmi + kode sumber v3.80.0)
- Koordinat sprite = TENGAH gambar (origin default 0.5, 0.5), bukan pojok kiri atas.
- `.body` hanya ada di physics game object (`physics.add.*`), bukan `add.image` biasa.
- Keyboard ghosting (hardware) dan ekstensi browser tertentu (Vimium memblokir tombol D) bisa merusak input.
- phaser.io/docs kini menonjolkan Phaser 4 — kunci versi 3 eksplisit (CDN/npm) saat bekerja dengan materi Phaser 3.

## Referensi
- Tutorial resmi parts 1–7: https://phaser.io/tutorials/making-your-first-phaser-3-game
- API keyboard (kode sumber): https://github.com/phaserjs/phaser/blob/v3.80.0/src/input/keyboard/KeyboardPlugin.js
