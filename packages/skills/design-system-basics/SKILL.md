---
name: design-system-basics
description: "Build a compact design system (tokens: color/type/space/radius) that translates directly to CSS variables — monochrome plus one accent."
version: 0.1.0
author: Your-Yui Team
license: MIT
platforms: [linux, macos, windows]
metadata:
  yui:
    tags: [design, tokens, css]
    category: design
    personas: [yui-designer]
---

# Design System Basics

Deliver a **compact** design system, not an encyclopedia. The output must be usable
by a coder within minutes.

## Steps

1. **Collect constraints first** — read existing files (read_file) for fonts, colors,
   and layout already in use. Consistency with existing work beats novelty.
2. **Pick the mood in one sentence** (e.g. "calm studio tool, quiet and precise").
   Every later decision must trace back to this sentence.
3. **Tokens** — write exactly these groups, as CSS custom properties:
   - Color: surface levels (3), text levels (3), 1 accent, 3 status (ok/warn/err).
     Prefer one accent hue; grayscale for everything else.
   - Type: base size (≥14px), scale (sm/base/md/lg), line-height, one mono.
   - Space: 4px scale (2/3/4/5/6 → 8/12/16/20/24px).
   - Radius: sm/md/pill + border width (hairline).
4. **Name tokens semantically** (`--surface-raised`, not `--gray-7`) so theme swaps
   stay possible.
5. **Check contrast** — text on surface ≥ 4.5:1. If a token fails, darken text level
   or lighten surface; do not add a new token.
6. **Emit as a block** the coder can paste: `:root { … }` with a comment per group.
7. **Document exceptions** (anything the tokens cannot express) in ≤3 bullets.

## Anti-patterns

- More than one accent hue without a stated reason.
- Tokens nobody consumes ("future-proof" scales).
- Separate spec doc + separate implementation — the CSS block IS the spec.
