# Art Direction — Maskot Orin × Rive (P1-PER-1)

> Spesifikasi tunggal untuk artist & engineer: memindahkan **Orin v8** (SVG rig di
> `apps/web/src/components/OrinPortrait.tsx` + `orinShapes.tsx`) ke **Rive** tan
> kehilangan satu pun perilaku. Sumber kebenaran visual: `docs/orin_v8_larger_star.html`
> (preview interaktif). Prinsip: **satu rig mata untuk semua bentuk** — identitas
> persona = BENTUK + WARNA, bukan wajah.

## 1. Prinsip karakter

- **Tenang & organik**: napas kecil (amplitudo ±1.25 unit), sway pelan; TIDAK ada gerakan cepat kecuali aksi singkat (giggle/hiccup/bounce klik).
- **Satu wajah, lima belas tubuh**: mata kapsul gelap + kilau ganda identik di semua bentuk; hanya siluet & warna yang berganti.
- **Hidup saat ditinggal**: aksi idle (melirik · giggle · senandung · penasaran · menguap) → tidur setelah 45 dtk; interaksi membangunkan.
- Emosi lewat **mata + FX kecil** ("…" · "?" · ♪ · z), bukan mulut/alis — menjaga siluet bersih.

## 2. Struktur file & artboard

**Satu file: `apps/web/public/rive/orin.riv`** — rekomendasi: **1 artboard + number input `shape` (0–14)**
yang menukar grup Body + warna (alternatif: 15 artboard dengan hirarki identik — hanya jika runtime swap terbukti berat; keputusan final saat review artist batch-1).

| Properti | Nilai |
|---|---|
| Artboard | `Orin` — **400×400**, origin pusat (200,200); safe-area FX atas kepala s.d. y≈90 |
| Unit | Vector (bukan bitmap) — render tajam dari 22 px (list) s.d. fullscreen |
| Warna badan | gradient radial 3-stop per bentuk (lihat §4) — fill `Body`, BUKAN root |
| Shadow | soft drop `dy 9 · blur 8 · hitam 28%` — ikut grup Body |

## 3. Hirarki bone & penamaan (WAJIB persis — kontrak runtime)

```
Root
├─ Body            (pivot: tengah)  — siluet bentuk aktif + warna; bintang: grup siluet diskalakan 1.18× (SKALA DI SINI, bukan Root/Face)
│  ├─ Halo         (lingkaran stroke 14, muncul saat speaking; r 134 + audioLevel·14)
│  └─ Face         (pivot: tengah) — parallax tatapan + offset fy per bentuk
│     ├─ EyeL / EyeR  (pivot: tengah mata) — kapsul rect rx=½w + ArcShape "^" (cross-fade happy) + Glint + GlintS
├─ Ring1 / Ring2   (pulsa listening; r 135→175, fade)
└─ FX              — Dots0-2 "…", Q0-1 "?", Note0-1 "♪♫", Z0-2 "z" (fade + melayang)
```

Penamaan **PascalCase** untuk bone, **snake_case** untuk input (di bawah). Tidak ada nama baru — runtime membinding by-name.

## 4. Warna & bentuk (SHAPE_ORDER = index `shape` 0–14)

| # | key | nama | warna | fy | gs | es | gr | bodyScale |
|---|-----|------|-------|----|----|----|----|-----------|
| 0 | orb | Bola | `#F2620F` | 0 | 1.00 | 1.00 | 1.00 | — |
| 1 | cloud | Awan | `#F5A00A` | 8 | 0.92 | 0.90 | 0.80 | — |
| 2 | blob | Telur | `#2B8CF0` | 0 | 1.00 | 1.00 | 1.00 | — |
| 3 | square | Kotak | `#12D1A0` | 0 | 1.05 | 1.00 | 0.90 | — |
| 4 | tri | Segitiga | `#F0278E` | 36 | 0.78 | 0.82 | 0.60 | — |
| 5 | pill | Kapsul | `#2BC4D8` | 0 | 1.22 | 1.00 | 1.10 | — |
| 6 | bean | Kacang | `#A653C8` | −20 | 0.95 | 0.90 | 0.80 | — |
| 7 | drop | Tetes | `#FF7662` | 30 | 0.80 | 0.85 | 0.60 | — |
| 8 | star | Bintang | `#8FDB6F` | 6 | 0.78 | 0.80 | 0.50 | **1.18** |
| 9 | flower | Bunga | `#C48DEB` | 0 | 1.00 | 1.00 | 0.90 | — |
| 10 | hex | Segi enam | `#A8D83E` | 0 | 1.00 | 1.00 | 0.85 | — |
| 11 | trap | Trapesium | `#E8503A` | 8 | 0.95 | 0.95 | 0.80 | — |
| 12 | diamond | Berlian | `#3A4FB0` | 0 | 0.86 | 0.90 | 0.65 | — |
| 13 | dome | Kubah | `#E6DC3A` | 6 | 1.05 | 0.95 | 0.90 | — |
| 14 | tube | Tabung | `#1F9A9A` | −18 | 0.82 | 1.00 | 0.65 | — |

(fy = offset wajah Y · gs = skala jarak mata · es = skala ukuran mata · gr = rentang tatapan — geometri path lengkap: `orinShapes.tsx`.)

- Gradient badan: stop 0% = warna→putih 48% · 52% = warna murni · 100% = warna→`#151728` 34% (fungsi `mixHex`).
- Mata: ink `#11121A`; kilau putih `#FFFFFF` (utama r≈4, sekunder r≈1.8).

**Pemetaan persona** (`PERSONA_SHAPE`): conductor=orb(0) · scholar=cloud(1) · scribe=blob(2) · coder=square(3) · designer=tri(4) · analyst=diamond(12) · operator=hex(10) · **planner=star(8)**.

## 5. State machine `Mascot` (input — WAJIB persis)

| Input | Tipe | Rentang | Makna |
|---|---|---|---|
| `mood` | number | 0–5 | 0 idle · 1 listening · 2 thinking · 3 speaking · 4 happy · 5 confused |
| `audioLevel` | number | 0–100 | level suara (halo & pulsing mata saat speaking; 0 jika tak ada suara) |
| `lookX` / `lookY` | number | −100…100 | tatapan parallax (di-smoothing di dalam runtime, koef. 0.84/0.66) |
| `shape` | number | 0–14 | bentuk aktif (tabel §4) |
| `sleep` | boolean | — | tidur (mata sipit 0.1, z melayang) — gerak kursor memicu `wake` |
| trigger `blink` | fire | — | kedip manual (auto-random 2.5–5.8 dtk, 22% ganda; kurva 0.08+0.92·sin) |
| trigger `nod` | fire | — | anggukan (reservasi voice P3) |
| trigger `giggle` / `hum` / `look` / `tilt` / `yawn` / `hiccup` | fire | — | aksi idle (durasi: 1.5 / 3.6 / 2.6 / 2.2 / 2.4 / 0.5 dtk) |
| trigger `wake` | fire | — | animasi bangun (0.7 dtk) |

**Mapping dari sistem** (sudah berlaku di SVG): PersonaState 7→mood 6 —
`idle→0 · thinking→2 · working→3 (halo) · awaiting_input→1 · done/celebrating→4 (+bounce) · error→5`.

## 6. Keyframe mood (baseline — artist boleh menghaluskan, TIDAK mengubah identitas)

| mood | mata (w×h) | gap | badan | khas |
|---|---|---|---|---|
| idle | 30×68 | 34 | napas ±1.25 | blink acak |
| listening | 31×78 | 36 | by −7 · sy 1.035 | ring pulsa · mata besar |
| thinking | 28×55 | 34 | rot −3 | tilt 11 · tatapan melayang sin |
| speaking | 30×68 | 34 | by −3 | **halo** + goyang audioLevel |
| happy | 30×56 | **43** | by −12 · rot 2.5 | mata "^" (arc) + kilau off |
| confused | 28×56 | 34 | rot 7 | tilt 18 |

Squash-stretch: `sy` dari mood + audio; **bola (shape 0) wajib skala SERAGAM** (tetap bulat); bentuk lain `sx = 1+(1−sy)·0.62`.

## 7. Pipeline produksi

1. **Artist batch-1** (P1-PER-2): Conductor (orb) + Scholar (cloud) + Scribe (blob) — bangun rig dari spec ini; referensi interaktif `docs/orin_v8_larger_star.html` (semua nilai tinggal disalin).
2. **Review silang**: jalankan `orin.riv` vs SVG berdampingan — checklist §8.
3. **Batch-2**: sisa persona terpakai (coder/designer/analyst/operator/planner) — hanya tambah geometri Body + swatch.
4. **Runtime** (P1-PER-3 ✅ 2026-11): `components/rive/RiveStage.tsx` (`useRive({ src: "/rive/orin.riv", stateMachine: "Mascot" })`); **fallback tetap OrinPortrait SVG** (aset belum ada / load gagal / prefers-reduced-motion) — SVG tidak dihapus. Halaman QA `/dev/rive` = checklist kontrak input + trigger untuk review aset; drop `orin.riv` ke `apps/web/public/rive/` dan semua portrait otomatis pindah ke Rive.
5. **QA**: blind test persona (P1-PER-5) — ≥80% penguji menebak persona dari output.

## 8. Acceptance criteria (definition of done P1-PER-2/3)

- [ ] 15 bentuk tampil benar via input `shape`; bintang terlihat 1.18× tanpa wajah ikut membesar
- [ ] 6 mood bertransisi tanpa patah (smoothing ≈ 7.2/s) — termasuk arc "^" happy
- [ ] `lookX/lookY` diikuti wajah (parallax), BADAN tidak bergeser
- [ ] `audioLevel` menggerakkan halo + pulsing mata saat `mood=3`
- [ ] blink acak + aksi idle (`sleep` setelah 45 dtk idle, `wake` saat interaksi)
- [ ] Render tajam di 22 px (list persona) & 180 px (orbit) — tanpa raster
- [ ] Ukuran `.riv` ≤ 300 KB (vektor murni, tanpa bitmap)
- [ ] Fallback SVG bekerja (matikan jaringan/unduh riv gagal → portrait tetap hidup)

## 9. Di luar scope v1

Mulut/alis (emosi cukup via mata+FX) · fisik rambut/ekor · partikel selain FX teks · suara Orin (P3 voice) · warna custom user (identitas = bentuk).
