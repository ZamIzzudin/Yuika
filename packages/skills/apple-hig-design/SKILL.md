---
name: apple-hig-design
description: Design unmistakably Apple-like, iOS-native mobile interfaces. SF-style typography hierarchy, translucency, system components, safe areas, sheets and gestures. Use when designing for iOS, when the product must feel native on Apple platforms, or when the user says "Apple-like" or "iOS style".
license: MIT
metadata:
  yui:
    category: design
    status: ready
    personas: [yui-designer]
    tags: [design, mobile, ios, apple]
---

# Apple-style UI (iOS HIG)

Philosophy: native over custom, subtle over expressive, calm and confident.
"Feels obvious" beats "looks fancy". Avoid trendy gimmicks; everything should
feel inevitable to an iOS user.

## Visual style

- System-first typography (SF Pro family): hierarchy from size and weight,
  not color. Large titles, then clear steps down.
- Neutral palette: white / off-white backgrounds, system grays, accent color
  used sparingly (links, key actions, selection).
- Depth via translucency and blur (nav bars, sheets), not heavy shadows.
- No harsh borders; group with spacing and background fills (grouped lists).

## Layout

- Safe-area aware by default (top notch, home indicator).
- Vertical scroll is the primary navigation pattern.
- Comfortable touch targets (44pt), one-handed reach for primary actions.
- Cards allowed but light and system-like; avoid dense dashboards.

## Components

- Buttons: system styles (filled, tinted, plain). One filled primary per
  screen. Destructive actions red, text style.
- Lists: inset grouped style; separators or spacing, not both; chevrons for
  navigation rows; swipe actions where expected.
- Navigation: standard nav bar, large title on scroll, back always available;
  tab bar (max 5) for top-level sections.
- Modals: bottom sheets preferred, drag-to-dismiss; alerts (centered) only
  for critical confirmations; action sheets for destructive choices.
- Inputs: system fields, labels above, keyboard types matched to content,
  inline validation on blur.
- Search: search field in nav bar, results replace content, scope bar when
  needed.

## Interaction and motion

- Natural easing, system-like springs for direct manipulation.
- Motion explains hierarchy (push/pop, sheet up/down), never decorates.
- Haptics for significant moments only (success, selection wheel).

## What to avoid

- Over-designed custom components, heavy gradients, neon colors.
- Harsh borders and outlines.
- Dense cluttered information layouts.
- Non-standard navigation (hamburger menus, custom back behavior).
- Adding what is not needed: if in doubt, remove.

## Decision rules

- If something feels unnecessary, remove it.
- Clarity and familiarity are the highest priorities.
- When in doubt, follow iOS system defaults.
- Every screen should feel like it belongs in a first-party Apple app:
  calm, confident, native, inevitable.

## Deliverable checklist

For each screen: state the design intent (one line), layout structure,
typography usage, interaction and motion behavior, and the iOS-native
reasoning for key decisions.
