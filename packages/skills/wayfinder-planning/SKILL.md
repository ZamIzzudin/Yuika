---
name: wayfinder-planning
description: Plan a huge chunk of work (more than one session can hold) as a map of investigation tickets resolved one at a time until the destination is clear. Use when the project is too big to plan upfront and needs discovery-then-commit planning.
metadata:
  yui:
    category: planning
    status: ready
    personas: [yui-planner]
    tags: [planning, discovery]
---

# Wayfinder Planning (unknown territory, one ticket at a time)

For work too large to hold in one session, do not write a grand plan that
will be wrong in week two. Instead, fix the destination, map what is
unknown, and resolve the unknowns one at a time. Adapted from the
"wayfinder" skill for Yuika: tickets live in the project task list.

## The pattern

1. Fix the destination: one sentence describing done, in user-visible
   terms ("orders can be placed and tracked end to end").
2. Map the route as investigation tickets: each ticket asks ONE question
   whose answer changes the plan (which payment provider fits the
   constraints? does the data model survive 10k rows? which screen blocks
   the demo?).
3. Tickets are independent: picking any one up cold, with only its text,
   is enough to work it.
4. Resolve tickets one at a time (delegate to the right persona or run the
   investigation yourself). Each resolution writes its finding back to the
   ticket notes, and the answer either:
   - opens follow-up tickets (new unknowns),
   - converts into concrete work tickets (the path is now clear), or
   - closes the route (dead end recorded, with the reason).
5. When no unknown tickets remain between here and the destination, switch
   to normal planning (issue-breakdown) and commit.

## Ticket format

- Title: the question itself.
- Notes: why it matters (which decision it unblocks), what to investigate,
   and the finding once resolved.
- Resolution stamp: answered / converted / dead end + one-line summary.

## Rules

- Investigation tickets produce knowledge, not code. If a ticket starts
  building, re-scope it.
- Cap open investigation tickets (~5-8); more means the destination is
  still foggy, narrow scope instead.
- Time-box each investigation; an unanswerable ticket is also an answer
  (escalate the decision to the user with options).
- The map (destination + open + resolved tickets) is the planning
  artifact; keep it readable by a newcomer in one screen.
