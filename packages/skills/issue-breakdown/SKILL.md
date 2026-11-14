---
name: issue-breakdown
description: Break a plan, spec, or PRD into independently grabbable tasks using tracer-bullet vertical slices, tracked in the project task list. Use when turning an approved plan into executable work items.
metadata:
  yui:
    category: planning
    status: ready
    personas: [yui-planner]
    tags: [product, planning, tasks]
---

# Issue Breakdown (plan to grabbable tasks)

A plan is executable when each task can be picked up by one persona (or one
pair) and finished without waiting on another task in flight. Adapted from
the "to-issues" skill for Yuika: tasks land in the project task list.

## Tracer-bullet slices first

Before listing everything, find the thinnest end-to-end slice that proves
the plan works: real input, real processing, real output, walking through
every layer, ugly but complete. Ship that slice as the first task block.
Depth-first beats breadth-first: a working skeleton exposes unknowns that a
component checklist hides.

## Breakdown rules

1. One task = one deliverable, finishable in one sitting. If a task needs
   "and then", it is two tasks.
2. Vertical slices over horizontal layers. Not "build the API, then the
   UI"; instead "list items end to end", "create item end to end".
3. Every task states: goal (one line), context (what to read first),
   acceptance (how to tell it is done), and the seam where it is verified.
4. Dependencies explicit: a task that cannot start until another finishes
   says so; nothing hides an implicit "actually I need the schema first".
5. Spikes get their own time-boxed task with a question as the
   deliverable, not "research" as a permanent resident.
6. Edge-case and polish tasks (empty states, errors, long content, dark
   mode) are written down now, not "later".

## Publishing

- Tasks go to the project task list (title + notes with acceptance).
- Titles are verbs: "Add", "Fix", "Support"; outcome-focused, not
  file-focused.
- The breakdown note itself (why this order, what was cut) goes to docs/
  so the reasoning survives the board.

## Smell test

- Any task that only makes sense after reading three other tasks: re-slice.
- More than ~8 tasks and no tracer bullet landed yet: cut scope, ship the
  skeleton.
- "Integration" or "polish everything" mega-task at the end: dissolve it
  into the slices it belongs to.
