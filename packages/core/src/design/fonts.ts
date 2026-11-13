// @yuika/core, D102: font bank (Google Fonts) untuk Design tab.
// Picasso & user memilih fontFamily dari bank ini; web me-load via Google
// Fonts CDN saat runtime (tanpa npm dep, tanpa build step). Bank dikurasi
// agar MENUTUPI semua font yang dirujuk design-style-library (test menjaga)
// + pilihan umum per kategori.

export type FontCategory = "sans" | "serif" | "mono" | "display" | "handwriting";

export interface FontBankEntry {
  family: string;
  category: FontCategory;
  weights: number[];
  vibe: string;
}

export const FONT_BANK: FontBankEntry[] = [
  // --- sans (UI workhorses) ---
  { family: "Inter", category: "sans", weights: [400, 500, 600, 700], vibe: "neutral UI default, dense and legible" },
  { family: "Geist", category: "sans", weights: [400, 500, 600, 700], vibe: "modern tech, Vercel-like crispness" },
  { family: "Plus Jakarta Sans", category: "sans", weights: [400, 500, 600, 700, 800], vibe: "friendly geometric, startup landing pages" },
  { family: "Manrope", category: "sans", weights: [400, 500, 600, 700, 800], vibe: "soft geometric, clean dashboards" },
  { family: "Sora", category: "sans", weights: [400, 500, 600, 700], vibe: "techy, slightly wide, AI products" },
  { family: "DM Sans", category: "sans", weights: [400, 500, 700], vibe: "low-contrast geometric, calm SaaS" },
  { family: "Outfit", category: "sans", weights: [400, 500, 600, 700], vibe: "round geometric, modern marketing" },
  { family: "Figtree", category: "sans", weights: [400, 500, 600, 700], vibe: "friendly grotesque, approachable apps" },
  { family: "Urbanist", category: "sans", weights: [400, 500, 600, 700], vibe: "tall geometric, editorial-lite" },
  { family: "Lexend", category: "sans", weights: [400, 500, 600, 700], vibe: "reading-optimized, accessibility first" },
  { family: "Work Sans", category: "sans", weights: [400, 500, 600, 700], vibe: "honest grotesque, docs and tools" },
  { family: "Montserrat", category: "sans", weights: [400, 500, 600, 700, 800], vibe: "classic geometric headers" },
  { family: "Poppins", category: "sans", weights: [400, 500, 600, 700], vibe: "round friendly, consumer apps" },
  { family: "Nunito", category: "sans", weights: [400, 600, 700, 800], vibe: "soft rounded, playful but tidy" },
  { family: "Rubik", category: "sans", weights: [400, 500, 600, 700], vibe: "slightly rounded, energetic" },
  { family: "Karla", category: "sans", weights: [400, 500, 700], vibe: "quirky grotesque, indie products" },
  { family: "Mulish", category: "sans", weights: [400, 600, 700, 800], vibe: "minimal neutral, content sites" },
  { family: "Barlow", category: "sans", weights: [400, 500, 600, 700], vibe: "condensed-friendly, sporty utilitarian" },
  { family: "Archivo", category: "sans", weights: [400, 500, 600, 700], vibe: "grotesque with tall x-height" },
  { family: "Libre Franklin", category: "sans", weights: [400, 500, 600, 700], vibe: "franklin gothic revival, newsy" },
  { family: "Public Sans", category: "sans", weights: [400, 500, 600, 700], vibe: "government-grade neutral (USWDS)" },
  { family: "Open Sans", category: "sans", weights: [400, 500, 600, 700], vibe: "humanist default, everywhere-safe" },
  { family: "Roboto", category: "sans", weights: [400, 500, 700], vibe: "Android system feel, Material" },
  { family: "Lato", category: "sans", weights: [400, 700], vibe: "warm humanist, business friendly" },
  { family: "Jost", category: "sans", weights: [400, 500, 600, 700], vibe: "Futura-like geometric" },
  { family: "Epilogue", category: "sans", weights: [400, 500, 700, 800], vibe: "versatile grotesque, editorial UI" },
  { family: "Space Grotesk", category: "sans", weights: [400, 500, 600, 700], vibe: "techy with quirks, dev tools" },
  { family: "Chakra Petch", category: "sans", weights: [400, 500, 600, 700], vibe: "sci-fi angular, HUDs and esports" },
  { family: "Darker Grotesque", category: "sans", weights: [400, 500, 600, 700, 800, 900], vibe: "tall condensed display-sans" },
  { family: "IBM Plex Sans", category: "sans", weights: [400, 500, 600, 700], vibe: "engineering corporate, Plex family" },
  { family: "Noto Sans", category: "sans", weights: [400, 500, 600, 700], vibe: "universal coverage fallback" },
  { family: "Raleway", category: "sans", weights: [400, 500, 600, 700], vibe: "elegant thin-capable sans" },
  { family: "Quicksand", category: "sans", weights: [400, 500, 600, 700], vibe: "very round, kids and wellness" },
  { family: "Ubuntu", category: "sans", weights: [400, 500, 700], vibe: "Canonical humanist, OS feel" },
  // --- serif ---
  { family: "Playfair Display", category: "serif", weights: [400, 500, 600, 700, 800], vibe: "high-contrast editorial luxury" },
  { family: "Lora", category: "serif", weights: [400, 500, 600, 700], vibe: "warm readable body serif" },
  { family: "Merriweather", category: "serif", weights: [400, 700, 900], vibe: "sturdy screen serif, long reads" },
  { family: "Bitter", category: "serif", weights: [400, 500, 600, 700], vibe: "slab-ish serif, sturdy UI text" },
  { family: "Source Serif 4", category: "serif", weights: [400, 600, 700], vibe: "Adobe source serif, professional" },
  { family: "Libre Baskerville", category: "serif", weights: [400, 700], vibe: "bookish classic" },
  { family: "Crimson Text", category: "serif", weights: [400, 600, 700], vibe: "literary, old-style" },
  { family: "EB Garamond", category: "serif", weights: [400, 500, 600, 700], vibe: "renaissance classic" },
  { family: "Cormorant Garamond", category: "serif", weights: [400, 500, 600, 700], vibe: "delicate large-display serif" },
  { family: "Fraunces", category: "serif", weights: [400, 600, 700, 900], vibe: "wonky display serif, characterful" },
  { family: "Instrument Serif", category: "serif", weights: [400], vibe: "tight elegant display serif" },
  { family: "DM Serif Display", category: "serif", weights: [400], vibe: "chunky elegant headlines" },
  { family: "Noto Serif Display", category: "serif", weights: [400, 600, 700], vibe: "expressive serif display" },
  { family: "Gelasio", category: "serif", weights: [400, 500, 600, 700], vibe: "Georgia-compatible metric swap" },
  { family: "STIX Two Text", category: "serif", weights: [400, 500, 600, 700], vibe: "scientific/math publishing serif" },
  { family: "IBM Plex Serif", category: "serif", weights: [400, 500, 600], vibe: "engineering serif, Plex family" },
  { family: "PT Serif", category: "serif", weights: [400, 700], vibe: "compact utilitarian serif" },
  // --- mono ---
  { family: "JetBrains Mono", category: "mono", weights: [400, 500, 600, 700, 800], vibe: "coding standard, tall x-height" },
  { family: "IBM Plex Mono", category: "mono", weights: [400, 500, 600, 700], vibe: "engineering labels and data" },
  { family: "Space Mono", category: "mono", weights: [400, 700], vibe: "retro-futurist mono" },
  { family: "Fira Code", category: "mono", weights: [400, 500, 600, 700], vibe: "ligature-friendly coding" },
  { family: "Source Code Pro", category: "mono", weights: [400, 500, 600, 700], vibe: "Adobe coding standard" },
  { family: "Roboto Mono", category: "mono", weights: [400, 500, 700], vibe: "Material mono" },
  { family: "Geist Mono", category: "mono", weights: [400, 500, 600, 700], vibe: "crisp modern mono, techy UI" },
  { family: "PT Mono", category: "mono", weights: [400, 700], vibe: "compact utilitarian mono" },
  { family: "Anonymous Pro", category: "mono", weights: [400, 700], vibe: "terminal classic" },
  { family: "Inconsolata", category: "mono", weights: [400, 500, 600, 700], vibe: "narrow efficient terminal" },
  { family: "Ubuntu Mono", category: "mono", weights: [400, 700], vibe: "round terminal friendly" },
  { family: "Overpass Mono", category: "mono", weights: [400, 600, 700], vibe: "signage-derived mono" },
  // --- display ---
  { family: "Archivo Black", category: "display", weights: [400], vibe: "heavy poster impact" },
  { family: "Anton", category: "display", weights: [400], vibe: "ultra condensed shout" },
  { family: "Bebas Neue", category: "display", weights: [400], vibe: "all-caps athletic poster" },
  { family: "Oswald", category: "display", weights: [400, 500, 600, 700], vibe: "condensed headline workhorse" },
  { family: "Abril Fatface", category: "display", weights: [400], vibe: "fat didone, editorial punch" },
  { family: "Limelight", category: "display", weights: [400], vibe: "art deco marquee" },
  { family: "Bangers", category: "display", weights: [400], vibe: "comic exclamation" },
  { family: "Germania One", category: "display", weights: [400], vibe: "blackletter-adjacent poster" },
  { family: "Audiowide", category: "display", weights: [400], vibe: "synthwave tech" },
  { family: "Press Start 2P", category: "display", weights: [400], vibe: "8-bit pixel arcade" },
  { family: "VT323", category: "display", weights: [400], vibe: "CRT terminal pixel" },
  { family: "Silkscreen", category: "display", weights: [400, 700], vibe: "tiny pixel UI" },
  { family: "New Rocker", category: "display", weights: [400], vibe: "metal band poster" },
  { family: "Macondo", category: "display", weights: [400], vibe: "hand-painted sign swing" },
  { family: "Fascinate", category: "display", weights: [400], vibe: "retro neon outline" },
  // --- handwriting ---
  { family: "Caveat", category: "handwriting", weights: [400, 500, 600, 700], vibe: "casual marker note" },
  { family: "Pacifico", category: "handwriting", weights: [400], vibe: "surf retro script" },
  { family: "Kalam", category: "handwriting", weights: [300, 400, 700], vibe: "pen notebook scribble" },
  { family: "Patrick Hand", category: "handwriting", weights: [400], vibe: "clean classroom hand" },
  { family: "Dancing Script", category: "handwriting", weights: [400, 500, 600, 700], vibe: "bouncy formal script" },
  { family: "Delius Swash Caps", category: "handwriting", weights: [400], vibe: "soft swash comic lettering" },
  { family: "Delicious Handrawn", category: "handwriting", weights: [400], vibe: "wonky hand-drawn display" },
];

/** Font yang dirujuk design-style-library tapi BUKAN Google Fonts (brand
 * font) - di-swap ke pengganti saat dipakai di canvas. */
export const FONT_SUBSTITUTES: Record<string, string> = {
  "Anthropic Sans": "Inter",
  "Google Sans": "Inter",
  "Cossette Texte": "Libre Franklin",
};

const BY_FAMILY = new Map(FONT_BANK.map((f) => [f.family, f]));

export function isBankFont(family: string): boolean {
  return BY_FAMILY.has(family);
}

/** Validasi fontFamily shape teks (semua pesan error ENGLISH). */
export function validateFontFamily(v: unknown): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new Error("fontFamily must be a string");
  const sub = FONT_SUBSTITUTES[v];
  if (sub) return sub;
  if (!BY_FAMILY.has(v)) {
    throw new Error(
      `fontFamily "${v}" is not in the Google Fonts bank; pick from bank categories: sans, serif, mono, display, handwriting (see design-canvas-basics skill)`,
    );
  }
  return v;
}
