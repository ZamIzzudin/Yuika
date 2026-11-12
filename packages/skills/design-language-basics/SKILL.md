---
name: design-language-basics
description: "Choose a design style that fits the product (clean, creative, corporate, playful, luxury, tech-dark, brutalist) and replace emojis with real SVG icon pack icons (Phosphor, Lucide, Font Awesome, Material Symbols, Heroicons)."
version: 0.1.0
author: Yuika Team
license: MIT
platforms: [linux, macos, windows]
metadata:
  yui:
    tags: [design, style, icons, svg]
    category: design
    personas: [yui-designer]
---

# Design Language Basics

Two jobs: (1) pick a STYLE direction that fits the product, (2) build ICON
rules. Hard rule: designs and documents NEVER contain emojis.

## 1. Style directions

Pick ONE primary direction, then commit every token to it. How to decide:
audience (professional vs consumer), content density (dense leans
clean/corporate), brand tone (serious vs fun).

- clean/minimal: generous whitespace, 1 accent color, hairline borders,
  radius sm/md, restrained type (Inter). For tools, productivity, B2B.
  Default when unsure.
- creative/expressive: bold display type, oversized shapes, one gradient
  accent (2 hues max), tilted or overlapping elements. For portfolios,
  campaigns, landing pages.
- corporate/professional: navy/slate neutrals, strict grid, conservative
  radius, optional serif headings. For finance, legal, enterprise.
- playful/warm: radius lg and pills, pastel surfaces, illustration, bouncy
  spacing rhythm. For kids, food, community.
- luxury/elegant: near-black surfaces + gold or champagne accent, wide
  letter-spacing on labels, thin weights, few elements. For fashion,
  premium brands.
- tech/dark: dark surfaces in 3 levels, 1 neon accent, mono numerals, glow
  used sparingly. For dev tools, crypto, gaming.
- brutalist: raw 1-2px borders, hard shadows (no blur), stark contrast,
  grotesk or mono type. For statements, agency sites.

State the direction in ONE sentence before drawing anything, e.g.
"clean studio tool, quiet and precise".

## 2. Iconography (replaces emojis)

ANY symbol in a design comes from a real icon pack as SVG. Never an emoji
glyph, never a text decoration pretending to be an icon.

- Packs: Phosphor (6 weights, matches the Yuika web app), Lucide (clean
  strokes), Font Awesome (broadest coverage), Material Symbols (Google),
  Heroicons (Tailwind ecosystem).
- Pick ONE pack per product. Mixing packs looks broken: stroke width and
  corner radius differ between packs.
- Sizing follows the type scale (16/20/24px). Keep stroke consistent
  (1.5px default). Buttons pair icon + label; icon-only buttons need a
  title/aria-label.
- Canvas files (design_* tools): represent an icon as a small image shape
  (upload the SVG via project uploads) OR a labeled placeholder rect named
  after the icon, e.g. "icon: phosphor/magnifying-glass". The final SVG
  ships with the handoff.
- Handoff docs reference icons by pack + exact name:
  "phosphor/caret-right", "lucide/check". The coder installs the pack;
  never describe icons with words like "arrow emoji" or paste emoji.

## 3. From style to tokens

Translate the direction into tokens (see design-system-basics):
number of hues, radius set, border weight, shadow depth (none, hairline,
hard), motion speed (fast ~120ms for tools, slow ~240ms for luxury).

## Anti-patterns

- Mixing directions (dark-tech hero + pastel body).
- Emojis as icons, bullets, or decorations anywhere.
- Two or more icon packs on one screen.
- Style chosen by novelty instead of audience fit.
