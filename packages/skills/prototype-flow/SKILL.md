---
name: prototype-flow
description: Build throwaway prototypes that answer one design question fast, either about logic/state or about UI direction. Pick the right branch, keep it one-command runnable, capture the answer, then delete or absorb. Use when the user asks to prototype, sanity-check a state model, explore UI variations, or "try it quickly".
license: MIT
metadata:
  yui:
    category: design
    status: ready
    personas: [yui-coder]
    tags: [frontend, prototype, workflow]
---

# Prototype Flow

A prototype is throwaway code that answers a question. The question decides
the shape; getting it wrong wastes the whole prototype.

## Pick the branch

Identify the question being answered, from the user's prompt or surrounding
code; ask if genuinely ambiguous and the user is reachable.

1. "Does this logic / state model feel right?" -> LOGIC branch: a tiny
   interactive terminal app that pushes the state machine through cases that
   are hard to reason about on paper.
2. "What should this look like?" -> UI branch: several radically different
   variations of one screen on a single route, switchable via URL param and
   a floating bottom bar.

Default when ambiguous and user unreachable: match the surrounding code
(backend module -> logic; page or component -> UI) and state the assumption
at the top of the prototype.

## Rules for both branches

1. Throwaway from day one, clearly marked: name it so a casual reader sees
   it is a prototype; follow the project's routing/module conventions.
2. One command to run, using the existing task runner.
3. No persistence by default: state lives in memory. Persistence is what is
   being checked, not something to depend on.
4. Skip polish: no tests, no error handling beyond runnable, no abstractions.
5. Surface the state: after every action (logic) or variant switch (UI),
   print or render the full relevant state.
6. Delete or absorb when done: fold the validated decision into real code
   or delete the prototype; do not leave it rotting.

## UI branch specifics

- Radically different variations (layout, hierarchy, density), not minor
  restylings; 2-4 variations.
- One route, variant via query param (?v=1..n) + floating switcher bar.
- Each variation labeled with its hypothesis ("A: dense table-first",
  "B: card feed").

## LOGIC branch specifics

- Terminal/REPL-style driver over the real state module (import it, do not
  re-implement).
- Scripted scenarios for the nasty cases: race, retry, cancel mid-flight,
  double submit, boundary values.
- Print state transitions as they happen.

## When done

The answer is the only durable artifact. Capture it (task note, commit
message, or NOTES.md next to the prototype) with the question it answered
and the verdict. Then delete or absorb the code.
