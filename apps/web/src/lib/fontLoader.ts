// D102: Google Fonts loader untuk Design tab (canvas + prototype).
// Font dipilih runtime oleh Picasso/user, jadi tidak bisa lewat next/font;
// link CSS di-inject sekali per family, lalu document.fonts.load menunggu
// font siap sebelum repaint. Offline / CDN gagal -> fallback system font.
const injected = new Set<string>();
const loaded = new Set<string>();

function cssUrl(family: string, weights?: number[]): string {
  const w = [...new Set([400, 500, 600, 700, ...(weights ?? [])])]
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b)
    .join(";");
  const fam = family.trim().replace(/ /g, "+");
  return `https://fonts.googleapis.com/css2?family=${fam}:wght@${w}&display=block`;
}

/** Inject <link> Google Fonts utk family (sekali). */
function injectLink(family: string, weights?: number[]): void {
  if (injected.has(family) || typeof document === "undefined") return;
  injected.add(family);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = cssUrl(family, weights);
  link.dataset.gfont = family;
  document.head.appendChild(link);
}

/** Pastikan family termuat; resolve true bila font aktif (false = fallback). */
export async function ensureFont(family: string, weights?: number[]): Promise<boolean> {
  if (!family || loaded.has(family)) return true;
  injectLink(family, weights);
  try {
    const specs = [...new Set([400, 500, 600, 700, ...(weights ?? [])])].map(
      (w) => `${w} 16px "${family}"`,
    );;
    await Promise.all(specs.map((s) => document.fonts.load(s)));
    loaded.add(family);
    return true;
  } catch {
    return false;
  }
}

/** Kumpulkan semua fontFamily unik dari file desain (semua halaman). */
export function collectFontFamilies(file: { pages: { shapes: Record<string, { type: string; fontFamily?: string }> }[] }): string[] {
  const out = new Set<string>();
  for (const p of file.pages) {
    for (const s of Object.values(p.shapes)) {
      if (s.type === "text" && s.fontFamily) out.add(s.fontFamily);
    }
  }
  return [...out];
}
