---
name: ux-microcopy
description: Write effective microcopy for interfaces - buttons, errors, empty states, loading, success, tooltips, onboarding, voice and tone. Use when writing or reviewing UI text, or when a design needs realistic labels instead of placeholder text.
license: MIT
metadata:
  yui:
    category: design
    status: ready
    personas: [yui-designer]
    tags: [design, writing, ux]
---

# UX Microcopy

Words are part of the interface. Realistic, specific copy during design also
exposes fake hierarchy (a button that cannot be labeled clearly is the wrong
button).

## Core principles

- Clarity beats cleverness; cleverness only where the brand earns it.
- Say what the system does and what happens next, not how it works inside.
- Short is a result of rewriting, not of deleting information the user needs.
- One idea per sentence. Front-load the key word.
- Consistent terms: the same object keeps the same name everywhere (settings
  is always Settings, never Preferences).

## Button labels

- Verb + object: "Save changes", "Create project", "Send invoice". Not "OK",
  "Yes", "Submit" alone.
- Match consequence: destructive buttons name the damage ("Delete project").
- Sentence case. No periods.
- Disabled buttons: if the reason is not obvious, show it next to the button
  ("Add payment method to enable payouts").

## Error messages

- What happened + why + how to fix: "Upload failed. The file is larger than
  10 MB. Compress it or pick a smaller file."
- Human, not blame: "We could not find that order number" not "You entered
  an invalid order".
- No error codes to users (keep them in logs); no jargon (stack traces,
  "exception in module").
- Field errors inline, next to the field, on blur or submit; summarize at
  top for long forms.

## Empty states

- Explain the absence + the action: "No reports yet. Create your first
  report to see insights here."
- Never dead-end. Distinguish "nothing yet" (invite action) from "no
  results" (offer to clear filters) from "no access" (explain permission).
- Illustration optional; copy mandatory.

## Loading and progress

- Under 1s: no indicator. 1-5s: inline spinner near the trigger. Longer:
  progress with steps if estimable.
- Skeletons for content areas; keep layout stable (no jump when loaded).
- Button loading: keep size, "Saving..." replaces label, block re-click.

## Success messages

- Confirm what changed + next step: "Project created. Invite teammates to
  start collaborating."
- Toasts for passive confirmation; inline confirmation for forms.
- Do not celebrate routine actions (no confetti for saving settings).

## Tooltips and hints

- Tooltip: short label or clarification for an icon or term, not hidden
  documentation.
- Helper text below inputs: constraints before typing ("6-20 characters"),
  not after failing.
- Placeholders are examples, never labels.

## Onboarding

- Show value before asking work: first-run screens lead with outcome.
- Ask in context, not upfront (request notification permission when the
  user creates the alert, not at launch).
- Progressive: 3 steps that work beat 7 steps that lose people.

## Voice and tone

Voice is stable (helpful, direct, human); tone adapts to context:
- Success: warm, brief.
- Errors: calm, accountable, solution-first.
- Empty or loading: patient, guiding.
- Destructive confirmations: neutral, explicit, no extra cheer.

Rules of thumb: second person ("your projects"), active voice, contractions
if the brand allows, no exclamation marks in serious flows, no guilt ("You
forgot to...") and no fake urgency ("Act now!").
