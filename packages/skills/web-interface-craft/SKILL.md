---
name: web-interface-craft
description: Review and implement web UI against interface best practices - accessibility, interaction, forms, media, performance fundamentals. Use when auditing or building web pages/components, checking accessibility, or when a UI "needs review" before ship.
license: MIT
metadata:
  yui:
    category: design
    status: ready
    personas: [yui-coder]
    tags: [frontend, web, accessibility, review]
---

# Web Interface Craft

Review checklist for web UI code and behavior, distilled from Web Interface
Guidelines. Run it before ship and when asked to audit.

## Interaction and semantics

- Semantic elements first (button for actions, a for navigation, label tied
  to input); ARIA only where semantics cannot express the pattern.
- Every interactive element: keyboard reachable, visible focus, logical tab
  order; skip-link on long pages.
- Custom widgets (tabs, dialogs, menus) follow their ARIA pattern: roles,
  arrow-key navigation, focus trap in dialogs, Escape closes.
- Hit areas >= 24x24 minimum, 44x44 for primary touch targets.
- Never remove outline without a replacement focus style.

## Forms

- Label every input (labels above, placeholders as examples only).
- Required fields marked; constraints communicated before submit
  (helper text), errors inline after.
- Input types match content (email, tel, number); autocomplete attributes
  for common fields (name, email, address, one-time codes).
- Validation: inline on blur, summary on submit for long forms; preserve
  user input always; never clear a form on error.
- Submit disabled only when meaningfully blocked; show why next to it.

## Content and readability

- Heading hierarchy without skipped levels; one h1 per page.
- Line length 45-75 characters for body text; font sizes >= 16px for body;
  minimum 12px for captions.
- Contrast: text >= 4.5:1 (3:1 large); test real pairs including muted text
  and placeholders (placeholders still need contrast).
- Images have alt text (decorative: alt=""); video has captions; icons that
  carry meaning have accessible names.
- Text truncation: ellipsis + full text in title/tooltip or expandable.

## States and feedback

- Loading: skeletons for content areas, spinners only for actions; layout
  stays stable (no shift on load).
- Errors recoverable: what happened, why, the fix; retry where sensible.
- Optimistic UI only when failure is unlikely and rollback is smooth.
- Empty states explain and offer the next action.

## Motion

- 150-300ms for most transitions; no motion blocking interaction.
- Respect prefers-reduced-motion: reduce or remove non-essential animation.
- No autoplaying video with sound; pausable/carousel content under user
  control.

## Performance basics (UI-relevant)

- Images sized, lazy-loaded below the fold; no layout shift (width/height or
  aspect-ratio).
- Web fonts: font-display swap, preload primary families; avoid FOIT on body
  text.
- Interaction latency: respond within 100ms feel (optimistic states).

## Review protocol

1. Keyboard pass: tab through everything; can you reach and operate all?
2. Screen reader spot check (headings, forms, dialogs).
3. Mobile pass: 390px width, touch targets, no horizontal scroll.
4. Worst-case content: longest string, zero items, one item, error.
5. Checklist above; report findings as: blocker / should fix / nice to have.
