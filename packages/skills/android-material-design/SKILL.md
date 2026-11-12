---
name: android-material-design
description: Design modern Android interfaces with Material 3 (Material You). Tonal color schemes from dynamic color, expressive type scale, shape system, elevated surfaces, Compose-friendly components. Use when designing for Android, applying Material 3, or when the user says "Material Design" or "Android style".
license: MIT
metadata:
  yui:
    status: ready
    personas: [yui-designer]
    tags: [design, mobile, android, material]
---

# Android Material 3 Design

Material 3 (Material You) is color-driven, tonal, and shape-expressive.
Design tokens map directly to Compose theme values (colorScheme, typography,
shapes), which keeps design and code aligned.

## Color

- Build a tonal palette from one or more seed colors: primary, secondary,
  tertiary each with tonal steps (0-100).
- Dynamic color (Android 12+): wallpaper-derived palettes; always provide a
  fallback brand scheme.
- Containers and on-colors: use container (tonal fill) + on-container (text)
  pairs instead of raw primary for chips, cards, filled buttons.
- Dark theme: dark surfaces with tonal primary shifts; keep brand hue,
  adjust tone. Test both.

## Typography

- M3 type roles, not arbitrary sizes: display, headline, title, body, label
  (each large/medium/small). Map your scale onto roles.
- Default family: Roboto; expressive brands may substitute (keep roles).

## Shape

- Shape scale: extra-small 4dp, small 8dp, medium 12dp, large 16dp,
  extra-large 28dp.
- Components bind to roles: buttons full/large, cards medium/large, sheets
  extra-large (top corners), text fields extra-small.
- Shape carries identity: one family, consistently applied.

## Components

- Buttons: filled (primary), tonal (secondary emphasis), outlined, text.
  One filled per view; FAB for the single key action (small 40dp, regular
  56dp, extended).
- Cards: elevated (shadow) or filled (tonal); avoid outline cards in M3.
- Lists: avatar/icon + text + trailing; dividers sparse; swipe-to-dismiss.
- Navigation: bottom navigation (3-5 destinations, M3 active indicator pill),
  navigation drawer or rail on tablets, top app bar (small or center-aligned).
- Chips: assist (action), filter (selection toggle), input (entry), suggestion.
- Snackbars for transient feedback; bottom sheets for focused tasks.
- Search: search bar expanding to search view (M3 pattern).

## Layout

- Edge-to-edge with insets respected (status bar, gesture nav).
- 16dp screen margins standard; 4dp baseline grid.
- Lazy columns/lists for scrolling content; pull-to-refresh where data
  changes.
- Large screens (tablet/foldable): list-detail panes, navigation rail,
  supported orientations.

## Interaction

- Ripple (state layer) on all interactive elements; hover/press states tonal.
- Predictive back gestures; swipe where content supports dismissal.
- Motion: M3 emphasized easing; container transform for navigation
  continuity.

## Avoid

- Mixing pre-M3 elements (app bars with elevation shadows everywhere,
  FAB speed dial abuse).
- More than one filled button per view.
- Hard-coded colors bypassing the tonal scheme.
- iOS patterns on Android (large centered titles, bottom-sheet-only modals,
  grouped inset lists).

## Deliverable checklist

For each screen: seed colors and tonal scheme (light + dark), type role
usage, shape role usage, component list with M3 names, and navigation
pattern.
