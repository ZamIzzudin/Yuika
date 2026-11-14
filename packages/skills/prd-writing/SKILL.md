---
name: prd-writing
description: Synthesize the current conversation and project context into a PRD (problem, solution, seams, success criteria) published to project docs. Use when the user wants a PRD from the discussion, without re-interviewing them.
metadata:
  yui:
    category: planning
    status: ready
    personas: [yui-planner]
    tags: [product, planning, docs]
---

# PRD Writing (conversation to PRD)

Takes the current conversation context and project understanding and
produces a PRD. Do NOT interview the user again; synthesize what is already
known. Adapted from the "to-prd" skill for Yuika: the PRD lands in the
project docs (Files tab, docs/), and its sections can seed project tasks.

## Process

1. Review the conversation and the project workspace (docs, tasks, code
   structure if relevant). Use the project's vocabulary; respect existing
   decisions and constraints.
2. Sketch the seams where the feature will be tested (existing seams
   preferred; highest seam possible). Confirm the seams with the user in
   one short message before writing the full PRD.
3. Write the PRD from the template below, save it to docs/ in the project
   (e.g. docs/prd-<slug>.md), and summarize the decision points in chat.

## PRD template

- Problem statement: from the user's perspective, in their words.
- Goals and non-goals: what this PRD explicitly does not promise.
- Current state: how the product behaves today, with evidence.
- Proposed solution: the shape of the change; screens or flows sketched
  where helpful (point to a design file or Picasso task when one exists).
- Seams for testing: where the behavior will be verified, highest level
  first.
- Success criteria: measurable; how we will know it worked.
- Risks and open questions: what could break, what is still unknown, who
  owns each open question.
- Out of scope: adjacent ideas captured for later, not included now.

## Rules

- The PRD reflects what was actually said, not what would be convenient to
  build. Ambiguities become open questions, not silent decisions.
- No invented numbers: metrics, users, timelines come from the conversation
  or are marked as assumptions to validate.
- One PRD per feature slice; a PRD that needs three "parts" is three PRDs.
- When done, propose next steps: issue-breakdown skill turns the PRD into
  grabbable tasks.
