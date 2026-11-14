---
name: mobile-adaptation
description: Adapt a desktop design into a native-feeling mobile version (390px baseline). Stacking order, content area, type scaling, touch targets, navigation transforms, section-by-section patterns. Use when creating a mobile version of a desktop design, or porting web frames to mobile.
license: MIT
metadata:
  yui:
    category: design
    status: ready
    personas: [yui-designer]
    tags: [design, mobile, responsive]
---

# Desktop to Mobile Adaptation

The mobile version must feel natively designed for mobile, not like a shrunk
desktop. Preserve brand, content, and visual language exactly; transform only
structure, sizing, and interaction patterns.

## Canvas setup

- Target width 390px (iPhone baseline); honor other widths if named.
- Height grows with content; never crop or hide content to fit an arbitrary
  height.
- Name the new frame "[original name] - Mobile 390"; never modify the
  original desktop frame.

## Step 1: read and map the desktop design

1. Read the full structure: sections, order, grids, text styles, spacing
   values.
2. Identify section types: hero, nav, feature grid, pricing, testimonials,
   gallery, footer, forms, tables.
3. Note the spacing system (base unit, section paddings) and type scale;
   mobile values are derived from these, never invented.
4. If the source is a single small component rather than a screen, stop and
   say so.

## Step 2: global transformation rules

Layout:
- Multi-column grids stack into one column; order = desktop reading order
  (left to right, top to bottom).
- Content area: 390 - 2 x 20px margins = 350px (16px margins if the desktop
  system uses a 4px base).
- Section vertical padding: reduce desktop values by 40-50% (120 -> 64,
  96 -> 56, 64 -> 40); keep rhythm proportional.
- Gaps between stacked items: 16-24px, from the desktop spacing scale.
- Every stacked section uses vertical auto-layout so the frame stays editable.

Typography:
- Scale headings down 30-40%, keep body nearly intact:
  64-72 -> 36-40; 48-56 -> 30-32; 32-40 -> 24-28; 24 -> 20.
  Body 16-18 stays 16 (never below 15); captions stay, minimum 12.
- Line-height: headings 1.1-1.2, body 1.5-1.6.
- Keep all copy: do not shorten text. If a heading wraps to 4+ lines, flag it
  in the report instead of rewriting.
- Left-align long text blocks even if desktop centers them; centered is fine
  for short heroes and section titles.

Touch:
- Every interactive element: minimum 44x44px hit area.
- Primary CTAs in stacked sections go full width (350px), height 48-56px;
  secondary buttons may stay intrinsic.
- Adjacent tap targets: minimum 8px apart.

Imagery:
- Full-bleed images may span 390px; contained images stay in the 350px area.
- Preserve aspect ratios; wide crops (21:9) become 4:3 or 1:1 focused on the
  subject.
- Decorative elements that crowd small screens: scale down or remove, and
  list every removal in the report.

## Step 3: section patterns

- Nav: collapse to logo + hamburger (or bottom tab bar if the product is
  app-like); keep primary CTA visible if simple.
- Hero: stack, headline, sub, one CTA full width; secondary CTA as text
  button below.
- Feature/card grids: single column, or 2 columns only if cards are simple
  (icon + title + one line); horizontal swipe for galleries.
- Tables: transform into stacked cards (row = card, columns become labeled
  rows) or horizontal scroll with first column pinned.
- Forms: one column, labels above inputs, submit full width and sticky bottom
  if long.
- Footer: collapse to logo + essential links stacked + legal line.
- Testimonials: single column, or horizontal swipe cards.

## Step 4: report

Deliver with the frame: decisions on removals, table transforms, navigation
choice, anything flagged (4+ line headings, dropped decoration), and the
mapping of section order.
