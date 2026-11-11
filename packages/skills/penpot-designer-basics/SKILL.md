# penpot-designer-basics

Skill untuk persona Designer: menggambar desain di Penpot secara headless
lewat tools `penpot_*` (protocol `changes`, jalur v0 sesuai
docs/refs/penpot.md).

## Kapan skill ini dipakai

Saat fase design dari sebuah project: user minta mockup/wireframe/visual,
kamu memproduksinya sebagai file Penpot asli (bukan gambar), user memantau
live di tab Design (viewer share-link ter-embed, update realtime).

## Alur kerja

1. `penpot_status` — pastikan host terhubung (profile muncul = OK).
2. Sekali per host: `penpot_setup_project` (pilih team pertama + buat
   project "Yuika Designs" sebagai default).
3. `penpot_create_file {name: "<Project> — <Layar>"}` → simpan `fileId`,
   `page.id`, dan `viewerUrl` dari hasilnya; bagikan viewerUrl ke user.
4. Gambar lewat `penpot_update_file {changes}` (lihat format di bawah);
   kirim dalam batch kecil (5-20 objek per panggilan), bukan ratusan
   sekaligus. Setelah setiap batch, `revn` baru dikembalikan dan otomatis
   dipakai panggilan berikutnya (cache host).
5. Verifikasi dengan `penpot_get_file` (daftar objek + posisi) bila ragu.

## Format changes (protocol editor Penpot)

Array of change objects. Yang paling sering dipakai:

### add-obj — tambah shape/frame/text

```json
{
  "type": "add-obj",
  "pageId": "<page id dari penpot_create_file>",
  "frameId": "<frame id (uuid); untuk objek level page = id page root>",
  "id": "<uuid objek>",
  "obj": {
    "id": "<uuid sama dengan id change>",
    "name": "Hero Section",
    "type": "frame",
    "x": 0, "y": 0, "width": 1440, "height": 320,
    "fills": [{ "fillColor": "#007cf7", "fillOpacity": 1, "style": "solid" }],
    "parentId": "<page id untuk level page, atau id frame untuk anak>"
  }
}
```

- `type` shape: `frame`, `rect`, `text`, `circle`, `path`, `image`.
- Semua id = UUID v4 unik (generate sendiri, satu objek satu id).
- `text` butuh tambahan: `"content": {"type":"root","children":[{"type":"paragraph-set","children":[{"type":"paragraph","children":[{"type":"text","text":"Judul Halaman"}]}]}]}`,
  `"fillColor": "#1a1a1a"`, `"fontSize": "32"`.
- `parentId`/`frameId`: objek di dalam frame → id frame; objek level page →
  id page (root).
- Border: `"strokeWidth": 1, "strokeColor": "#d4d4d4", "strokeAlignment": "inner"`,
  `"strokeStyle": "solid"`.
- Sudut membulat: `"rx": 8, "ry": 8`.

### mod-obj — ubah properti objek yang sudah ada

```json
{ "type": "mod-obj", "id": "<uuid objek>", "operations": [
  { "type": "set", "attr": "width", "val": 720 },
  { "type": "set", "attr": "fills", "val": [{ "fillColor": "#22c55e", "fillOpacity": 1, "style": "solid" }] }
] }
```

`attr` = nama properti (`x`, `y`, `width`, `height`, `name`, `fills`,
`hidden`, `locked`, ...). `operations` bisa beberapa sekaligus per objek.

### del-obj — hapus

```json
{ "type": "del-obj", "id": "<uuid objek>" }
```

### mov-objects — pindah parent/urutan

```json
{ "type": "mov-objects", "parentId": "<frame tujuan>", "shapes": ["<uuid>"], "index": 0 }
```

## Disiplin desain

- Mulai dari frame canvas per layar (desktop 1440x900, mobile 390x844),
  beri nama layar (`Home — Desktop`).
- Susun hirarki: frame → anak (header, hero, card). Gunakan grid 8px.
- Warna dari design tokens project bila ada; kalau tidak, pakai palet netral
  + satu aksen, tulis pilihan warna di laporan agar bisa dijadikan token.
- Setiap selesai satu layar: sebutkan di chat progress + revn terakhir,
  supaya user tahu kapan refresh tab Design.
- Jangan pernah mengarang id objek yang belum dibuat; `penpot_get_file`
  dulu kalau butuh id yang ada.

## Batasan v0 (jangan diklaim bisa)

- Upload gambar/asset media headless belum didukung (pakai shape + warna).
- Design tokens library (set-tokens) belum; warna cukup konsisten manual.
- Kalau update ditolak (`revn` mismatch): `penpot_get_file` sekali untuk
  refresh cache, lalu ulangi batch terakhir.
