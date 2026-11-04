---
name: project-planning-basics
description: "Turn a large brief into an executable, measurable plan: scope table, risk register with decision owners, and a dependency-ordered task list where every task has acceptance criteria and an assignee."
version: 0.1.0
author: Your-Yui Team
license: MIT
platforms: [linux, macos, windows]
metadata:
  yui:
    tags: [planning, pm, tasks, acceptance]
    category: planning
    personas: [yui-planner]
---

# Project Planning Basics

Deliver a plan an executor can follow without asking questions, not a wall of prose.

## Steps

1. **Frame the brief** — goal (one sentence), scope IN / scope OUT, constraints,
   and the definition of done for the whole engagement.
2. **Consult where uncertain** — unknowns with high impact get a structured consult
   (2–3 specialists, one sharp question each). Record who said what and the decision.
3. **Write the planning doc** (`docs/PLAN.md`): goal, scope table, decisions log
   (with source: user / consult / assumption), approach per phase, risk register
   (risk → impact → mitigation → decision owner).
4. **Build the task list** — each task: description, **acceptance criteria** (how to
   verify), **depends_on** (DAG, no cycles), assignee persona, parallel vs sequential.
   Size tasks to 1–3 agent-hours of work; split anything larger.
5. **Add verification tasks** — review and testing are real tasks with owners.
6. **Mark iteration boundaries** — what ships in run 1, what is deferred and why.

## Rules of thumb

- Every vague word in the brief becomes either a question to the user or a written
  assumption — never a silent guess.
- If a task has no acceptance criteria, it is not ready to be delegated.
- Prefer 30 small verifiable tasks over 10 epic ones.
