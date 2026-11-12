---
name: typography-basics
description: "Pick and pair fonts that fit the project context (clean, editorial, tech, playful, luxury, dense data); type scale, licensing, fallback stacks, canvas-safe text."
version: 0.1.0
author: Yuika Team
license: MIT
platforms: [linux, macos, windows]
metadata:
  yui:
    tags: [design, typography, fonts]
    category: design
    personas: [yui-designer]
---

# Typography Basics

Goal: fonts that FIT the project context, not fonts that look fancy in
isolation. Decide mood first, font second.

## 1. Ask context first

Classify the project into ONE mood before picking any font:
clean/product, editorial/content, tech/dev, playful/consumer,
luxury/brand, dense/data, warm/handmade.

## 2. Pairing playbook (mood -> fonts)

Each row: display/heading font + body font + when it fits.

- clean/product: Inter / Inter (or the system-ui stack). Neutral "product UI"
  feel. Safest default for tools and B2B apps.
- editorial: Fraunces / Source Serif 4 (or Lora). Long reads, magazines, blogs.
- tech/dev: Space Grotesk / Inter + JetBrains Mono for code. Dev tools,
  dashboards, terminals.
- playful: Baloo 2 / Nunito. Kids, games, casual consumer apps.
- luxury: Playfair Display / Jost. Fashion, premium brands, portfolios.
- dense/data: IBM Plex Sans / IBM Plex Sans + IBM Plex Mono. Tables, prices,
  enterprise software.
- warm/handmade: Quicksand / Karla. Cafes, crafts, community projects.

Rules:

- Max 2 families, plus 1 mono if the product shows code or aligned numbers.
  More families add noise, not personality.
- A pairing needs CONTRAST: serif display + sans body, or geometric display +
  humanist body. Never two fonts that look almost the same.
- When in doubt: ONE family with multiple weights (400/500/600/700).

## 3. Type scale

- Base 14-16px. Scale 1.2 (compact UI) or 1.25 (roomy marketing).
- 5-6 stops maximum (e.g. 12, 14, 16, 20, 28, 40).
- Body text floor: 14px (accessibility). Line-height 1.4-1.6 for body,
  1.1-1.2 for display sizes.
- Build hierarchy with weight and size, never with color alone.

## 4. Practical constraints

- Web products: prefer the system stack or Google Fonts (OFL / Apache
  licenses). Check the license before embedding in a shipped app; some fonts
  are desktop-only.
- Always declare a fallback stack:
  `"Inter", system-ui, -apple-system, "Segoe UI", sans-serif`.
- Canvas files (design_* tools): the shape has ONE font field. Use the family
  name and note the exact stack + weights in the handoff doc.
- Aligned numbers (tables, prices, stats): tabular numerals
  (font-variant-numeric: tabular-nums) or a mono font.

## Anti-patterns

- Picking a font before the mood is stated.
- Display fonts for body text (readability collapses at small sizes).
- Three or more families on one screen.
- Fake bold (browser-synthesized weight); request the real weight files.
