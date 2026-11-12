# Skills Figma: pembagian peran Picasso vs Hiro

Folder ini menetapkan arsitektur Figma dua arah Yuika. Bahan pretrain ada di
`docs/skills-design/` (sumber referensi); hasil konversinya menjadi skill
BAWAAN (bundled) di `packages/skills/`, jadi user tidak perlu melatih manual.

## Dua arah Figma

```
Picasso (yui-designer)                    Hiro (yui-coder)
  skill: figma-authoring                    skill: figma-to-code
  "buat desain ke Figma"                    "ambil desain Figma jadi kode"
        |                                          ^
        +--> Figma file (via MCP)  --handoff--> ---+
        |                                          |
        +--> Design tab (canvas Yuika) --handoff---+
```

- Proyek TANPA desainer (belum ada UI): Picasso membuat desain, lalu
  meng-ekspor/mem-push ke Figma (jika MCP Figma tersedia) atau memakai
  Design tab bawaan; Hiro implement via `design-to-code-handoff`.
- Proyek yang SUDAH punya desain dari tim lain (file Figma bawaan):
  Picasso tidak wajib. Hiro memegang `figma-to-code`: membaca file Figma
  (MCP/export), mengekstrak tokens, dan mengeksekusi implementasi dengan
  fidelity loop. Desain adalah kontrak; tidak di-restyle sesuai selera.

## Skill bawaan per persona

### Picasso (packages/personas/yui-designer/skills.yaml - bundled)
| Skill | Fungsi |
| --- | --- |
| figma-authoring | Menulis desain ke Figma: struktur file, variables, components + variants, auto layout, prototype wiring, checklist handoff |
| design-style-library | Katalog 67 style pack (clean, shadcn, bento, brutalism, glassmorphism, dll) + aturan memilih |
| design-taste | Proses anti-slop: brief inference, design read satu baris, disiplin eksekusi |
| ui-polish-craft | Grouping, spacing rhythm, states, motion restraint, ikon (shared dgn Hiro) |
| color-systems | Palet OKLCH, token semantik, dark mode, contrast |
| apple-hig-design | Gaya native iOS (HIG) |
| android-material-design | Gaya native Android (Material 3) |
| mobile-adaptation | Desktop ke mobile 390 yang terasa native |
| ux-microcopy | Copy UI: label, error, empty state, tone |
| (sebelumnya) | design-system-basics, design-to-code-handoff, design-canvas-basics, typography-basics, design-language-basics |

### Hiro (packages/personas/yui-coder/skills.yaml - bundled)
| Skill | Fungsi |
| --- | --- |
| figma-to-code | Konsumsi file Figma jadi kode: token extraction, mapping komponen, fidelity QA loop |
| web-interface-craft | Checklist aksesibilitas + web UI best practices saat implement/review |
| prototype-flow | Prototipe sekali pakai utk menjawab satu pertanyaan (logic/UI branch) |
| ui-polish-craft | Detail craft saat implementasi (shared dgn Picasso) |
| (sebelumnya) | code-review-basics, yui-conventions, design-to-code-handoff |

## Aturan pembagian

1. Picasso TIDAK memegang `figma-to-code` (bukan konsumennya); Hiro TIDAK
   memegang `figma-authoring` (bukan penulisnya). Dijaga test
   `designer-wiring.test.ts` (D98).
2. Keduanya berbagi `design-to-code-handoff` (jalur Design tab internal)
   dan `ui-polish-craft`.
3. Koneksi Figma = MCP Figma (Dev Mode MCP / Figma Agent) yang dipasang
   lewat M&T tab per proyek; tanpa koneksi, persona bekerja di Design tab
   dan mengatakannya, tidak berpura-pura terhubung.

## Sumber bahan (docs/skills-design)

- 67 style pack typeui.sh -> dikonsolidasi jadi `design-style-library`
  (katalog: vibe, palette, fonts, radius, spacing per pack).
- apple-ui-designer -> `apple-hig-design`.
- mobile-android-design -> `android-material-design`.
- desktop-to-mobile -> `mobile-adaptation`.
- better-colors -> `color-systems`; better-ui + better-layout + emil-design-eng
  -> `ui-polish-craft`; design-taste-frontend + high-end-visual-design ->
  `design-taste`; ux-writing -> `ux-microcopy`.
- web-interface-guidelines -> `web-interface-craft` (Hiro);
  prototype -> `prototype-flow` (Hiro).
- Bahan implementasi web murni (web-artifacts-builder, frontend-design,
  imagegen-frontend-web, dst) diringkas ke dalam dua jalur di atas; file
  aslinya tetap di folder ini sebagai referensi manusia.
