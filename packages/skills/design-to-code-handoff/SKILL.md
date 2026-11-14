---
name: design-to-code-handoff
description: "Hand off design through the studio canvas: designer draws with design_* tools, coder reads design_get_file and generates components from the shape structure - canvas file is the single source of truth."
version: 0.2.0
author: Yuika Team
license: MIT
platforms: [linux, macos, windows]
metadata:
  yui:
    tags: [design, handoff, canvas]
    category: design
    personas: [yui-designer, yui-coder]
    status: ready
---

# Design → Code Handoff (canvas studio)

The design lives in the **studio canvas** (tab Design), not in HTML mockups or
screenshots. The `.json` design file is the single source of truth: Picasso
draws it with `design_*` tools, the user can edit it live, and the coder reads
the same file to generate components. No duplicate medium.

## Designer side (Picasso)

1. Draw in the canvas (`design_create_file` → frame artboard per screen →
   children with clear component names). Follow `design-canvas-basics`.
2. **Names are the contract**: `Button Sign in`, `Card`, `Input Email` — the
   coder maps names to components, so no `Rectangle 14`.
3. One page per screen/flow state. Announce `fileId` + page names in the
   handoff note so the coder can find them via `design_list`.
4. HTML mockups are NOT the default handoff anymore. Produce one only when the
   user explicitly asks for a runnable mockup.

## Coder side (Hiro)

1. Start from the design, not from imagination: `design_list` → find the file →
   `design_get_file {fileId}`. Shapes come grouped per frame, children ordered
   top-to-bottom with `x/y` relative to their parent frame.
2. **Reading LARGE designs in stages (IMPORTANT)**: one tool response is
   capped (~20k chars). For a big file (long landing page, many screens),
   `design_get_file {fileId}` returns a FRAME INDEX instead of all shapes —
   every root frame and level-2 section with `absY`/`height`/`shapes` count.
   Then read in slices, never re-fetch the whole thing:
   - By vertical window: `design_get_file {fileId, pageId, yMin, yMax}` with a
     600-800px Y window picked from the index (`absY`..`absY+height`). Avoid
     windows that straddle two sections, or you pay for both.
   - By component: `design_get_file {fileId, pageId, shapeId}` returns one
     subtree plus its `ancestorChain` — ideal when the design is properly
     grouped (Card/Button/Navbar as frames).
   - If a slice answers `still too large`, halve the window. A slice repeats
     the page context frames; shapes outside the window are simply absent,
     so read the next window — do NOT assume the design ends where the
     response ends.
3. **Map structure to components**:
   - `frame` → section/container (`<section>`, `.card`, screen wrapper).
   - `rect` + radius → button, input, surface; `fill` = background color.
   - `circle` → avatar, icon holder, indicator.
   - `text` → label/heading/body with `fontSize`/`fontWeight`/`color`/`align`.
   - `name` of each shape = intended component name — honor it.
4. **Derive tokens, not literals**: collect repeated colors → CSS variables
   (`--accent`, `--surface`, `--text`); snap coordinates to the 4/8 spacing
   scale instead of copying raw px blindly (18 → 16, 22 → 24).
5. **Derive layout from geometry**: child y-steps = vertical rhythm; equal x
   margins = padding; centered widths = max-width + margin auto. Prefer flex
   from stacking patterns over absolute positioning.
6. Build into `code/` (via `write_file`), verify, and when done state which
   `fileId`/page you implemented so the user can compare side-by-side in the
   Design tab.
7. **Flat long designs**: if the index shows ONE root frame with 100+ direct
   children (no level-2 sections), the design was drawn without grouping -
   report it back so the designer regroups it into section frames; meanwhile
   read with tighter yMin/yMax windows (400-600px).

## Anti-patterns

- Screenshot handoff ("here is a picture of the design").
- Re-deriving the design in HTML before reading the file (mockup detour).
- Copying raw pixel positions wholesale — hand off structure + tokens.
- Ignoring shape names, or renaming components away from the designer's names.
