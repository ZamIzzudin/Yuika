---
name: color-systems
description: Build and use color systems with OKLCH and semantic tokens. Generate perceptually uniform scales, handle light/dark themes, contrast, gamut, one-meaning-per-color. Use when creating or auditing a palette, picking a primary color, defining tokens, designing dark mode, or checking contrast.
license: MIT
metadata:
  yui:
    category: design
    status: ready
    personas: [yui-designer]
    tags: [design, color, tokens]
---

# Color Systems (OKLCH and semantic tokens)

## Why OKLCH

OKLCH (lightness, chroma, hue) is perceptually uniform:
- Equal L steps look equally bright (HSL lightness varies wildly by hue).
- Hue stays constant across a scale (HSL blue drifts to purple).
- Chroma is an absolute colorfulness measure, independent of lightness.

Not every OKLCH value is displayable in sRGB; high-chroma values at some hues
clip. Clamp chroma down until in gamut.

## Semantic tokens first

Raw values never appear in components. Layers:
1. Primitive scale: slate-50..950 style ladders (from OKLCH).
2. Semantic tokens: surface, surface-raised, text, text-muted, line,
   primary, primary-hover, success, warning, danger.
3. Component tokens: btn-primary-bg, input-border... referencing semantic.

One meaning per color:
- primary = the one interactive accent (brand/actions).
- success/warning/danger = status only, never decoration.
- Text colors: 2-3 levels max (strong, body, muted).

## Building a scale

Given a seed color (OKLCH or converted from hex):
- Keep hue constant. Steps of L around 0.45 (dark) to 0.97 (near-white).
- Chroma peaks near mid-lightness; reduce toward both ends.
- 10-11 steps: enough for UI without decision fatigue.
- Check adjacent steps are distinguishable (delta L >= 0.04).

Dark mode is not an inversion:
- Surfaces: dark surfaces are low-chroma, slightly hue-tinted near the
  primary, not pure black; raised surfaces are lighter, not darker.
- Text: near-white (L 0.93-0.96), never pure white on pure black.
- Accent: often raise lightness of primary in dark mode (brand stays
  recognizable, contrast returns).
- Shadows read poorly on dark: use lighter surfaces + borders instead.

## Contrast

- Body text: >= 4.5:1; large text (>= 24px or 19px bold) >= 3:1.
- UI components and graphics: >= 3:1 against adjacent surfaces.
- Disabled text: exempt from 4.5:1 but still readable (aim 3:1).
- Test pairs: text on surface, text on primary (buttons), border on surface,
  icon on tinted background.
- Fix contrast by moving OKLCH L, not by changing hue.

## Applying color

- Primary action: one accent color, used for the main CTA and key state.
  If everything is accented, nothing is.
- Tinted backgrounds: 8-12% opacity of a hue, or low-chroma high-L equivalent,
  for selected/hover/empty states.
- Gradients: only when the brand says so; subtle, same-hue ramps.
- Data viz: categorical hues separated in OKLCH hue and L, tested with the
  two most common color-blindness types; never rely on hue alone (add shape
  or label).
- Light and dark themes ship together; tokens swap, structure stays.

## Palette audit checklist

- [ ] All component colors come from semantic tokens.
- [ ] One meaning per color; primary does the emphasizing.
- [ ] Contrast pairs verified (text, borders, icons, states).
- [ ] Scale steps distinguishable; no clipped out-of-gamut colors.
- [ ] Dark mode designed, not inverted; raised surfaces lighter.
- [ ] Color never the only signal (state has icon/text too).
