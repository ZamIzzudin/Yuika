---
name: figma-to-code
description: Implement code from an existing Figma design (read via Figma MCP or provided exports) with high fidelity. Extract variables and styles, map components, replicate spacing/type/color exactly, handle states and edge cases, run a fidelity QA loop. Use when the task references a Figma file, "implement the Figma design", or a design handed over by another team.
license: MIT
metadata:
  yui:
    status: ready
    personas: [yui-coder]
    tags: [figma, frontend, handoff, implementation]
---

# Figma to Code (design into working software)

This skill is the consumption side of the Yuika Figma flow: another team (or
Picasso via figma-authoring) produced a Figma file; your job is faithful
execution. The design is the contract. When a Figma connection is available,
read the file directly (Figma MCP); otherwise work from exports/screenshots
and say which details are unverifiable.

## Step 1: intake

1. Locate the source: Figma file/frame link, MCP access, or exports in the
   project workspace.
2. Read the foundations first: color variables, text styles, spacing and
   radius values. These become your tokens; do not eyeball them from
   screenshots.
3. Read the component library: variants, states, auto layout structure
   (padding, gaps, direction), content slots.
4. List the screens and states in scope (default, empty, error, loading,
   long content). Missing states go on a question list, not invented
   silently.

## Step 2: map to code

- Tokens first: colors and typography from Figma variables become theme
  tokens (CSS variables / RN theme / Tailwind config). Semantic names, not
  raw hex scattered in components.
- Component mapping: each Figma component instance becomes one code
  component; variants become props. Figma auto layout padding/gap maps to
  padding/gap (or RN style props) 1:1.
- Spacing: absolute pixel values from Figma are truth (4px grid); snap only
  obviously-off values (e.g. 15 -> 16) and note the snap.
- Typography: map Figma text styles to theme type roles (font family, size,
  weight, line-height, letter-spacing). One role = one style entry.
- Icons: same pack and sizes as in Figma; if Figma used flattened vectors,
   extract or find the source icon and say which pack/name it came from.
- Images: use the same crops/ratios; note where a placeholder stands in.

## Step 3: implement

- Build foundations (tokens), then primitive components, then screens.
- Structure screens from Figma hierarchy: frames become containers/views;
  keep the tree recognizable.
- Interactive states from variants (hover/press/disabled/focus/error) are
  required, not optional polish.
- Responsive: desktop and mobile frames both exist if the design provided
  them; if only one breakpoint exists, ask before inventing the other.
- Accessibility from the design baseline: reading order, contrast, alt text
  for images, labels for icon buttons (see web-interface-craft).

## Step 4: fidelity QA loop

For each screen, compare code output against the Figma frame:
1. Screenshot the implementation next to the frame.
2. Check: spacing rhythm, alignment, type sizes and weights, colors, radius,
   iconography, state coverage, content (real strings, not lorem).
3. Fix deltas, re-verify. List any intentional deviations with reasons.

## Rules

- The design is the source of truth; deviations require a stated reason
  (platform convention, accessibility, technical constraint).
- Ambiguities (missing state, unclear behavior) go to the question list and
  get asked, not guessed.
- Never restyle to personal taste during implementation.
- Keep the question list and deviation list in the task notes so the next
  reviewer sees the reasoning.

## Done when

- [ ] Tokens extracted from variables/styles, not eyeballed.
- [ ] Every component with variants has matching props and states.
- [ ] Every in-scope screen implemented and compared in the QA loop.
- [ ] Empty/error/loading/long-content states handled per file.
- [ ] Deviations documented with reasons; open questions asked and answered.
