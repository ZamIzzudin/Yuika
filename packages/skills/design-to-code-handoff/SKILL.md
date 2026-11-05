---
name: design-to-code-handoff
description: "Hand off design as working HTML/CSS mockups a coder can execute directly — one-file deliverables in code/, decisions documented in reports/."
version: 0.1.0
author: Yuika Team
license: MIT
platforms: [linux, macos, windows]
metadata:
  yui:
    tags: [design, handoff, html]
    category: design
    personas: [yui-designer]
---

# Design → Code Handoff

The deliverable is a **runnable mockup**, not a picture of one. A coder must open it
in a browser and start porting immediately.

## Steps

1. **Restate the goal** in one sentence, then list the screens/sections to build.
2. **Load the tokens** (design-system-basics). If missing, create them first —
   mockups without tokens are throwaways.
3. **One file per screen**: self-contained HTML with inline `<style>` using the
   tokens. Write to `code/` (via write_file) — browsers open it directly.
4. **Structure**: header / main / footer landmarks; real (or realistic) copy —
   never lorem ipsum; states for hover, focus-visible, and empty included.
5. **Responsive in two passes**: desktop first, then a ≤768px pass using only
   wrapping and stacking — no new components.
6. **Component inventory**: after each screen, list components with token usage
   (e.g. `.card = surface-raised + radius-md + space-3 padding`).
7. **Decisions memo** in `reports/`: mood sentence, palette/type choices, anything
   deferred — each with a one-line reason.
8. **Accessibility pass**: contrast, focus rings, text ≥14px, icon-only buttons
   get aria-labels.

## Anti-patterns

- Image attachments instead of HTML ("screenshot handoff").
- Pixel-perfect demands — hand off structure + tokens, not absolute positions.
- New design language per screen.
