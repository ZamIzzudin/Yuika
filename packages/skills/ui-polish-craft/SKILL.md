---
name: ui-polish-craft
description: Polish details that make interfaces feel crafted, for both designing and implementing UI. Visual hierarchy, spacing rhythm, grouping, alignment, affordance, interaction states, motion restraint, optical adjustments. Use when a screen "feels off", when refining spacing/states/micro-interactions, when building or reviewing component details.
license: MIT
metadata:
  yui:
    category: design
    status: ready
    personas: [yui-designer, yui-coder]
    tags: [design, craft, frontend, polish]
---

# UI Polish and Craft

## Grouping and reading order

- Proximity beats decoration: things that belong together sit closer to each
  other than to other groups (spacing within a group is smaller than between
  groups).
- One primary reading path per screen. Alignment creates it; decoration
  destroys it.
- Every screen answers three questions instantly: where am I, what can I do,
  what just happened.
- Progressive disclosure: show the essential, tuck the rest. Settings behind
  an icon, advanced options behind a toggle, full text behind "more".

## Spacing rhythm

- Pick one base unit (4 or 8). All spacing values are multiples of it.
- Define a rhythm scale and name it (e.g. 4/8/12/16/24/32/48). Use steps,
  never arbitrary values like 18px.
- Vertical rhythm: related items 8-16 apart, sections 48-96 apart. The gap
  between sections must be clearly larger than gaps within a section.
- When a layout feels noisy, increase whitespace between groups before
  touching anything else.

## Padding and density (anti-cramped rules)

A cramped layout is almost always a padding bug, not a content bug. Concrete
floor values; when in doubt, add air:

- Content never touches an edge: screen/page margin at least 16 (mobile) or
  24 (desktop); inside cards and panels at least 16, preferably 24 for
  primary cards.
- Sibling padding must match: if three cards sit in a row, all three use the
  same internal padding. Unequal padding reads as sloppy before anything
  else is noticed.
- Two gaps per container, no more: inner gap (items inside a group) and
  outer gap (between groups). Example: items 8-12, groups 24-32.
- Text needs breathing room around it: icon-to-label 8, label-to-control 8,
  control-to-helper 4-6, block-to-block 16.
- Buttons and inputs keep min height 40 (touch 44-48) so tight padding never
  squeezes hit areas.
- Dense data tables are the ONE exception: rows may go tight (8 vertical),
  but then column padding grows (16 horizontal) so the eye still tracks.
- Checklist before shipping a screen: same padding for same role, nothing
  touching an edge, gap between groups > gap inside groups, no value outside
  the rhythm scale.

## Alignment and optical balance

- Align to a grid, then adjust for optics: icons often need 1-2px optical
  nudge to look centered; caps text needs less side padding than lowercase.
- Left edges form the strongest line in most UI. Protect it.
- Center-align only short standalone blocks (heroes, empty states), never
  long text.

## Hierarchy

- Three levels max per screen: primary (one), secondary (few), tertiary
  (rest, quiet).
- Build hierarchy with size and weight first, color second. Never rely on
  color alone.
- Labels above inputs (not placeholders), helper text below, error replaces
  helper in place.

## Interaction states (design them all)

For every interactive element: default, hover (or press), focus-visible,
active/selected, disabled, loading, error where relevant.
- Hover is a nudge (2-4% brightness, subtle shadow), not a redesign.
- Focus ring must be visible and consistent (2px, offset, accent).
- Disabled: reduced opacity (around 40-50%), no pointer changes, still
  readable, keep layout (no removal).
- Loading: button keeps its width/height, label swaps to spinner + text.

## Motion restraint

- Motion explains hierarchy or causality, never decorates.
- Durations: micro 100-200ms, transitions 200-400ms, anything above 500ms
  needs a reason.
- Enter: fade + small translate (4-8px). Exit: faster than enter.
- Stagger lists 30-50ms per item, cap total stagger near 300ms.
- Springs for direct manipulation (drag, sheets), ease-out for enter,
  ease-in for exit.
- Respect prefers-reduced-motion: swap transforms for fades or remove.
- Forbidden: bounce on every element, parallax abuse, spinners on static
  content, animating layout properties when transform works.

## Shadows, borders, radius

- Elevation ladder (e.g. 3 levels max) mapped to meaning: card, dropdown,
  modal. Do not invent a fourth.
- Shadow = soft, low-opacity, large blur; crisp shadows read cheap.
- One radius scale per product (e.g. sm 6 / md 10 / lg 16 / full). Radius on
  nested elements smaller than container radius.
- Border or shadow, rarely both, to separate surfaces.

## Icons

- One pack per product (see design-language-basics). Consistent stroke weight
  and grid size.
- Icon states match text states (muted when disabled).
- Icon-only buttons need aria-label and a tooltip; hit area >= 44px.

## Craft checklist

- [ ] Grouping obvious: within-group spacing < between-group spacing.
- [ ] All spacing from the scale, no arbitrary values.
- [ ] Every interactive element has all states designed.
- [ ] One primary action per screen, visually loudest.
- [ ] Motion subtle, purposeful, reduced-motion safe.
- [ ] Icons from one pack, aligned optically.
- [ ] Nothing "feels off" at 100% zoom: squint test passes.
