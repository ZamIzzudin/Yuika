# Your-Yui Design System (DS-1)

> **Satu sumber kebenaran desain UI.** Semua layar & fitur baru WAJIB dibangun
> dari komponen global `apps/web/src/components/ui/*` + utility Tailwind
> semantik. Dilarang menulis CSS kustom / kelas BEM baru / warna hex manual.
> Alasan keberadaan (feedback user dev-10): tanpa sistem, tiap fitur lahir
> dengan gaya sendiri → sulit ditelusuri, tidak konsisten, sulit diperbaiki
> manual.

**Status migrasi**: Tailwind v4 aktif; CSS lama (`globals.css` bagian bawah)
tetap hidup untuk layar yang belum dimigrasi — hapus bertahap (§7). Layar
**referensi implementasi**: `components/DungeonView.tsx`.

---

## 1. Prinsip

1. **Token semantik, bukan nilai mentah** — tidak pernah `#007cf7`, `text-[13px]`,
   `rounded-[14px]`. Selalu `bg-accent`, `text-body`, `rounded-card`. Nilai hidup
   di `:root` (`--yui-*`) dan dialias Tailwind di `@theme`.
2. **Komponen dulu** — tombol → `<Button>`, status kecil → `<Chip>`, blok
   bertepi → `<Card>`, popup → `<Modal>`, label+input → `<Field>`. Jika butuh
   varian baru yang dipakai ≥2 tempat → tambah ke `ui/`, bukan inline.
3. **Kecil, rapat, sunyi** — teks 12–14px, border nyaris tak terlihat sampai
   hover, satu aksen biru (hue 210). Monokrom + status berwarna hanya sebagai
   *makna* (ok/warn/danger), bukan dekorasi.
4. **Aksi utama satu per layar** — `variant="primary"` untuk SATU tombol
   terpenting; sisanya `secondary`/`ghost`.
5. **Bahasa Indonesia** — label, placeholder, hint, komentar kode.

## 2. Token (jalur `--yui-*` → utility Tailwind)

| Utility Tailwind | Token | Nilai | Kapan dipakai |
|---|---|---|---|
| `bg-canvas` | `--yui-bg-canvas` | `#1a1a1a` | latar app |
| `bg-frame` | `--yui-bg-frame` | `#0d0d0d` | sidebar kiri |
| `bg-surface` / `bg-raised` / `bg-inset` | surface | `#212121/#242424/#101010` | kartu / kartu mengambang / sumur kode |
| `bg-control` | `--yui-bg-control` | `#212121` | input, tombol secondary |
| `border-line` / `border-line-strong` | border | rgba 3.5%/4.5% | tepi default / tepi hover-terlihat |
| `bg-hover` | `--yui-hover` | rgba 6% | latar hover baris/menu |
| `text-primary` / `text-secondary` / `text-muted` / `text-dim` | teks | putih→`#6a6a6a` | judul / isi / meta / hint |
| `text-accent` / `text-accent-text` / `bg-accent` / `bg-accent-soft` | aksen | `#007cf7` | aksi utama, state aktif |
| `text-success` `bg-success-soft` / `text-warn` `bg-warn-soft` / `text-danger` `bg-danger-soft` | status | hijau/oranye/merah | ✓ selesai / ◐ berjalan / gagal |
| `glass-panel` (utility) | glass | blur 24px | modal, dropdown |
| `text-caption` / `text-body` / `text-lead` / `text-title` / `text-display` | skala | 12/13/14/16/18px | meta / default UI / teks panel / judul seksi / judul halaman |
| `rounded-sm2` `rounded-md2` `rounded-lg2` `rounded-card` `rounded-xl2` `rounded-bubble` `rounded-pill` | radius | 6/8/12/14/20/22/999px | pakai `md2` untuk input, `card` untuk kartu, `pill` untuk chip/tombol |
| `ease-[var(--ease-out-yui)]` `duration-[var(--yui-dur-fast)]` | gerak | 120ms | transisi hover/state |

Font: `font-sans` (Inter) & `font-mono` sudah diset — kode/filename selalu
`font-mono`.

**Anti-pola**: `text-white` untuk teks biasa (pakai `text-primary`), warna abu
Tailwind bawaan (`text-neutral-400` dll. — tidak ada di tema), `shadow-lg`
(pakai `shadow-card`/`shadow-pop`).

## 3. Inventaris komponen global (`components/ui/`)

Impor selalu dari barrel: `import { Button, Chip, Card } from "@/components/ui";`

### 3.1 `Button`
| Prop | Opsi | Keterangan |
|---|---|---|
| `variant` | `primary` · `secondary` *(default)* · `ghost` · `danger` | primary = 1 aksi utama; ghost = aksi sunyi dalam kartu; danger = destruktif |
| `size` | `sm` · `md` *(default)* | sm = dalam baris daftar / toolbar |
| `active` | boolean | state terpilih/toggle → aksen |

```tsx
<Button variant="primary" onClick={run}>Jalankan</Button>
<Button size="sm" active={on} onClick={() => toggle()}>{on ? "Terpasang ✓" : "Pasang"}</Button>
```
Untuk elemen non-button: `buttonClass({ variant: "primary" })`.

### 3.2 `Chip` / `ChipToggle` / `Dot`
`Chip` non-interaktif (status/kategori): `tone` = `accent|ok|warn|danger|info|muted`.
`ChipToggle` bisa diklik (`active`, `onSelect`), `Dot` titik status (`pulse` saat live).
```tsx
<Chip tone="ok">✓ selesai</Chip>
<Chip tone="warn">draf</Chip>
<ChipToggle active={mode === "research"} onClick={() => setMode("research")}>🔍 Riset</ChipToggle>
<Dot tone="warn" pulse />
```

### 3.3 `Card` / `CardHead`
Permukaan konten. `variant`: `surface` (default) · `raised` (mengambang) · `inset` (tenggelam, untuk kode/terminal). `CardHead` = baris judul + aksi.
```tsx
<Card variant="raised" className="flex flex-col gap-2 p-3">…</Card>
<CardHead title="Anggaran" actions={<Button size="sm">Reset</Button>} />
```
Layout dalam kartu: `className="flex flex-col gap-2 p-3"` — bukan wrapper div sendiri.

### 3.4 `Modal`
Popup glass: ESC & klik overlay menutup otomatis. `wide` untuk form besar.
```tsx
<Modal open={formOpen} onClose={() => setFormOpen(false)} title="Buat latihan baru" wide>…</Modal>
```
DILARANG bikin overlay/scrim manual (`.settings-overlay` legacy — migrasi bertahap).

### 3.5 `Field` / `TextInput` / `TextArea` / `Select`
`Field` = label + kontrol + hint (semantik + fokus aksen otomatis).
```tsx
<Field label="Nama skill target" hint="identifier unik">
  <TextInput value={name} onChange={(e) => setName(e.target.value)} />
</Field>
<Field label="Kriteria lulus — satu per baris" className="col-span-2">
  <TextArea rows={3} … />
</Field>
```
Grid form standar: `grid grid-cols-2 gap-3`, field lebar penuh `col-span-2`.

### 3.6 `TabList`
Tab aria lengkap; konten diganti pemanggil.
```tsx
<TabList value={view} onChange={setView} tabs={[{ id: "misi", label: "Misi" }, { id: "mapping", label: "Mapping Skill" }]} />
```

### 3.7 `EmptyState` / `MetaRow` / `SectionTitle`
`EmptyState` WAJIB untuk list/tabel kosong (bukan `<p className="dim">`).
`MetaRow` = baris meta kecil bawah kartu; `SectionTitle` = judul seksi uppercase.
```tsx
<EmptyState icon="✦" title="Belum ada skill" hint="Latih persona di tab Misi." />
<MetaRow>{date} · <Chip tone="ok">✓ selesai</Chip> · {summary}</MetaRow>
<SectionTitle>Latihan Anda (3)</SectionTitle>
```

## 4. Pola susunan (layout)

- **Halaman penuh**: `mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6`.
- **Baris daftar**: `<Card className="flex items-center gap-3 px-3 py-2">` — avatar/fokus kiri, teks `flex-1 min-w-0` (`truncate`), aksi kanan.
- **Baris pemilik + meta**: nama `text-body text-primary`, meta `MetaRow`.
- **Form dalam modal**: `flex flex-col gap-4`; grup input `grid grid-cols-2 gap-3`.
- **Pesan error inline**: `rounded-md2 border border-danger/30 bg-danger-soft px-3 py-1.5 text-caption text-danger`.

## 5. Do / Don't

| ✔ Do | ✘ Don't |
|---|---|
| `<Button variant="primary">` untuk 1 aksi utama | banyak tombol primary sekaligus |
| `<Chip tone="ok"><Check …/> selesai</Chip>` | emoji status dalam teks biasa berwarna manual |
| `text-muted` untuk meta | `text-[#979797]` / opacity hack |
| `EmptyState` untuk kosong | paragraf abu polos |
| `gap-*` untuk jarak | margin kiri-kanan manual |
| `font-mono` untuk path/kode/filename | font sans untuk kode |
| ikon Phosphor `<Icon size={13} />` | emoji / SVG buatan sendiri |

## 5b. Ikon — Phosphor (`@phosphor-icons/react`)

SATU set ikon untuk seluruh app: **Phosphor** (weight `regular` default; `bold`/`fill`
hanya untuk penekanan). Dilarang emoji sebagai ikon dan SVG inline buatan
sendiri (portret persona & Orin = seni, bukan ikon — tetap).

- **Ukuran**: 11–13 (inline teks/chip) · 15–16 (tombol) · 20–22 (empty state/hero).
- **`aria-hidden`** pada ikon dekoratif; tombol ikon murni WAJIB `aria-label`.
- Peta ikon yang sudah dipakai (konsistenkan!):

| Ikon | Phosphor | Dipakai untuk |
|---|---|---|
| Kirim | `PaperPlaneTilt` | composer chat |
| Stop turn | `Stop` | batalkan turn |
| Berpikir | `Brain` | blok reasoning 💭 |
| Auto-approve | `Lightning` | chip mode cepat |
| Catatan memori | `PencilSimple` | learn nudge |
| Kompresi konteks | `ArrowsInLineVertical` | chip 🗜 |
| Usulan skill | `Wrench` | chip skill |
| Tutup | `X` · sukses `Check` · gagal `X` | modal, smoke, status |
| Berjalan | `CircleNotch` | status running |
| Mundur | `ArrowLeft` | tombol kembali |
| Dungeon | `Sword` · riset `MagnifyingGlass` · bahan `Books` · unggah `UploadSimple` · hapus `Trash` · waktu `Clock` · kosong `Sparkle`/`Leaf` | menu ⚔ |
| Peringatan | `Warning` · larangan `Prohibit` | budget warn/block |

## 6. Checklist fitur / page baru (wajib lulus sebelum commit)

- [ ] Semua tombol `<Button>`; semua input `<Field>`+`TextInput/TextArea/Select`.
- [ ] Semua warna/teks/radius via utility semantik §2 — nol hex, nol px manual.
- [ ] Popup via `<Modal>`; list kosong via `<EmptyState>`; status via `<Chip>`.
- [ ] Semua ikon Phosphor (§5b) — tanpa emoji/SVG inline.
- [ ] Teks & placeholder bahasa Indonesia; komentar kode menjelaskan *kenapa*.
- [ ] Aksesibilitas dasar: `aria-label` untuk tombol ikon, `aria-pressed` untuk toggle.
- [ ] Tidak menambah kelas CSS di `globals.css`.

## 7. Peta migrasi CSS lama → Tailwind (progress)

| File | Status |
|---|---|
| **SEMUA komponen sudah migrasi** — UI 100% ui/* + Tailwind semantik + Phosphor | ✅ |
| `DungeonView` · `ChatView` · `SettingsModal` · `page.tsx` shell | ✅ batch 1–2 (referensi DS) |
| `SkillsTab` · `ProjectPanel` · `PersonaPicker` | ✅ batch 3 |
| `TaskDrawer` · `FileTab` · `McpPanel` · `TeamTree` · `TracePanel` · `Markdown` | ✅ batch 4 |
| `OrinPortrait.tsx` / `orinShapes.tsx` / `PersonaPortrait.tsx` / `Skeleton.tsx` | ✅ tetap (SVG art / sederhana) |

**globals.css final (~440 baris)**: hanya `@theme` token alias, `@keyframes` animasi,
4 `@utility` (`glass-panel`/`msg-in`/`caret-blink`/`typing-dot`), `.chat-empty`
(portrait), scrollbar & reset. **Nol kelas komponen legacy** — menambah kelas baru
WAJIB lewat `@utility` (utility dipakai ≥3 tempat) atau komponen `ui/*`.

Aturan transisi: file yang belum dimigrasi tetap pakai kelas CSS lama (jangan
campur dua gaya dalam satu file); setelah sebuah file bersih, hapus kelas
CSS-nya dari `globals.css` di commit yang sama.

## 8. Catatan teknis

- Tailwind v4 via `@tailwindcss/postcss` (`postcss.config.mjs`); theme alias di
  `@theme` dalam `globals.css`; sumber eksplisit `@source "../../src/**/*.{ts,tsx,mdx}"`
  (auto-detection gagal di Windows karena EPERM junction AppData).
- `npm run build` di mesin dev Windows gagal karena file-tracing Next.js kena
  EPERM junction yang sama — issue lingkungan, bukan kode; CI (Linux) bersih.
  Verifikasi visual via `npm run dev`.
