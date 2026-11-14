---
name: task-decomposition
description: "Split requests into subtasks and pick the right persona."
version: 0.1.0
author: Yuika Team
license: MIT
platforms: [linux, macos, windows]
metadata:
  yui:
    tags: [planning, delegation, orchestration]
    category: planning
    personas: [yui-conductor]
---

# Task Decomposition Skill

## When to Use

Use whenever a request contains more than one meaningful piece of work, or requires an
expertise you do not have (deep research, document writing, coding).

## Procedure

1. **Restate the goal** in one sentence. If you cannot, ask ONE clarifying question.
2. **List subtasks.** Each subtask must have:
   - a self-contained goal (a specialist with NO access to this chat can execute it),
   - the context it needs (files, findings so far, constraints),
   - the persona that should do it.
3. **Persona mapping:**
   - research / fact-finding / comparisons from the web → `yui-scholar`
   - writing reports / summaries as documents → `yui-scribe`
   - writing or debugging code → `yui-coder`
4. **Parallelize independent subtasks** (max 2 at once in this demo); sequence dependent
   ones (research → writing).
5. **Delegate** each subtask with `delegate_task`, passing goal + context.
6. **Synthesize**: merge child summaries; credit which persona did what; list open items.

## Pitfalls

- Delegating a goal that references "the above" or "as discussed", the child sees nothing
  of this conversation.
- Doing specialist work yourself because it feels faster, delegate unless it is a single
  trivial tool call.
- Skipping synthesis: the user wants YOUR answer, not three pasted summaries.

## Verification

Before answering the user: every subtask either done or explicitly marked blocked; the
final answer names the personas that contributed.
