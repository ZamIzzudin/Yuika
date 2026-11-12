---
name: figma-authoring
description: Author and push designs into Figma (via Figma MCP or Figma Agent) so the file is production-ready for handoff. File structure, frames and pages, variables and styles, components and variants, auto layout, naming, prototype wiring, handoff checklist. Use when the task says Figma, when a design must live in Figma, or when preparing a Figma file for developers.
license: MIT
metadata:
  yui:
    status: ready
    personas: [yui-designer]
    tags: [design, figma, handoff, mcp]
---

# Figma Authoring (design into Figma)

Two directions exist in Yuika: Picasso creates designs in Figma (this skill);
Hiro consumes Figma files into code (figma-to-code skill, used by the coder).
This skill is the creation side, via Figma MCP tools (or Figma Agent) when a
Figma connection is available. When no Figma connection exists, keep working
in the Yuika Design tab and say so; do not pretend to have pushed.

## Before creating anything

1. Confirm the connection: which Figma MCP tools are available (list them).
2. Ask or infer: new file or existing file? Which team/project folder?
3. Confirm direction (style pack, platform, breakpoints) using the design
   skills (design-taste, design-style-library) before touching Figma.

## File structure (the contract for handoff)

Pages, in order:
1. Cover: product name, version, date, owner, changelog stub.
2. Foundations: color variables, typography styles, spacing scale, radius,
   elevation, iconography note (pack + grid).
3. Components: the component library with variants.
4. Screens/Flows: full screens, grouped by flow, desktop and mobile sections
   separated (e.g. "Checkout / Desktop", "Checkout / Mobile 390").
5. Prototype/Notes: flow map, open questions, edge cases (empty, error,
  loading, long content).

Frame naming: [Flow] / [Screen] - [State or variant], e.g.
"Checkout / Payment - empty", "Checkout / Payment - error".
Component naming: Category/Component/Variant, e.g. "Button/Primary/Large",
"Input/Text/Error". Lowercase variants, capitalized categories.

## Foundations before screens

- Colors as variables (not paint fills): primitive scale + semantic aliases
  (primary, surface, text, danger...). Dark mode = mode on the same variables.
- Type as text styles per role (display/heading/title/body/label), families
  max 2 + 1 mono.
- Spacing: 4/8 based scale; use it, never eyeball gaps.
- Radius: sm/md/lg/full ladder.
- Number variables for spacing are ideal (design tokens in Figma).

## Components

- Build with auto layout everywhere: stacks for content, padding inside
  components, not spacer layers.
- Variants for state and size: default/hover/pressed/disabled/focus;
  small/medium/large. Boolean props for structural toggles (hasIcon).
- Constraints + layout inside components so instances resize predictably.
- Content slots: instance swap for icons, text properties for labels, so
  developers see the real content model.
- Components own their states. Screens never redraw states of a component.

## Screens

- Desktop frame 1440 wide (or product spec), mobile 390; content areas on
  grid (12 col desktop / 4 col mobile).
- Every screen ships with: default, empty, error, loading where the flow has
  data; long-content variant for lists and names.
- Real content only (see ux-microcopy); lorem ipsum is a bug.
- Mobile versions derive from desktop via mobile-adaptation skill, never
  redrawn from scratch with new decisions.

## Prototype wiring

- Connect the main happy path first; then the alternates (back, cancel,
  error recovery).
- Use realistic interactions: smart animate only when Figma structure
  matches (same layer names); otherwise dissolve/move-in.
- Prototype flows named after the user goal ("Buy a ticket", not "flow 3").

## Handoff checklist (file is done when)

- [ ] Foundations complete: variables + styles, dark mode if in scope.
- [ ] Components cover every repeated pattern with states as variants.
- [ ] Screens cover happy path + states + empty/error, desktop and mobile.
- [ ] Naming follows the contract (flows, states, variants).
- [ ] Prototype runs the happy path without dead ends.
- [ ] Cover page lists version and open questions.
- [ ] Announce to the team that the file is ready for Hiro (figma-to-code).
