---
name: design-taste
description: Anti-slop design process. Read the brief, infer the real design direction, state a one-line design read, then execute with discipline (no default aesthetics, no template look). Use when starting any visual design task, choosing a direction, or when the result must not look generic or AI-generated.
license: MIT
metadata:
  yui:
    status: ready
    personas: [yui-designer]
    tags: [design, process, taste]
---

# Design Taste: anti-slop process

Most AI design output looks generic because the model jumps to a default
aesthetic instead of reading the room. This skill forces inference before
pixels.

## 1. Brief inference (before anything)

Read these signals:
1. Product kind: SaaS landing, consumer app, dashboard, portfolio, editorial,
   e-commerce, internal tool.
2. Vibe words from the user: "minimalist", "bold", "premium", "playful",
   "Linear-style", "Apple-y", "brutalist". These are contracts, not hints.
3. References: links, screenshots, competitor names the user dropped.
4. Audience: B2B procurement vs design-conscious consumer vs recruiter.
   The audience picks the aesthetic, not your taste.
5. Existing brand assets: logo, color, type, photography. For redesigns these
   are starting material, not optional.
6. Quiet constraints: regulated industry, public sector, kids, accessibility
   first. These override aesthetic preference.

## 2. One-line design read (mandatory output)

Before designing, state:
"Reading this as: <product kind> for <audience>, with a <vibe> language,
leaning toward <style pack / design system>."

If the brief is ambiguous, ask ONE question. Do not guess between materially
different directions.

## 3. Anti-default discipline

Banned defaults (slop markers):
- Centered hero with gradient text and generic rounded card grid.
- Purple-blue gradient primary, Inter-everything, 24px radius on everything.
- Same card repeated 3 times with icon + title + line of text.
- Emoji as icons.
- Tailwind default palette untouched, no custom tokens.
- Every section same rhythm: title, subtitle, 3 columns.

Instead:
- Choose a real direction (see design-style-library skill) and commit.
- Vary section anatomy: split hero, asymmetric grid, editorial column, bento.
- One signature idea per screen, not five competing ideas.
- Density should match audience: B2B dense is fine, consumer airy is fine.

## 4. Execution discipline (hard rules)

- Hierarchy: one clear primary action per screen. Everything else is quieter.
- Spacing from one scale (4/8 base). Never eyeball gaps.
- Type: max 2 families + 1 mono. Scale with fixed ratio, defined sizes only.
- Color: semantic tokens only. One accent color doing the emphasizing.
- States: every interactive element needs hover/press/disabled/loading/error
  considered before ship.
- Dark/light: pick per brief; if consumer-facing, design dark mode from start.
- Real content beats lorem ipsum: realistic names, prices, dates, error text.
  Short strings expose fake hierarchy.

## 5. Pre-flight check (before calling it done)

- [ ] Does the design read as intentional in 5 seconds to a stranger?
- [ ] Is there exactly one primary action per screen?
- [ ] Can you name the style pack and why it fits, in one line?
- [ ] Worst-case content tested: long name, zero items, long email, one item.
- [ ] Touch targets >= 44px, text contrast >= 4.5:1.
- [ ] No banned defaults from section 3 present.
- [ ] Everything a developer needs exists: tokens, states, edge cases.

## 6. Redesign mode

When the task is a redesign:
1. Audit first: list what works (keep), what is broken (fix), what is missing
   (add). Do not redesign everything equally.
2. Preserve brand recognition unless asked for a rebrand.
3. Ship the smallest change that fixes the biggest complaint.
