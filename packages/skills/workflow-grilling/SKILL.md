---
name: workflow-grilling
description: Run a grilling session that spec-by-spec pins down recurring workflows worth automating - one round of pointed questions at a time, each with a recommended answer. Use when hunting for automation candidates or designing workflow specs with the user.
metadata:
  yui:
    category: planning
    status: ready
    personas: [yui-planner]
    tags: [workflow, discovery]
---

# Workflow Grilling (find and specify loops)

A loop is a recurring pattern in the user's work: weekly reports, inbox
triage, deployment ritual, onboarding a client. A workflow is the spec of
one loop, made executable. Adapted from the "loop-me" skill for Yuika:
workflow specs live with the project (docs/ or the workflow area) and are
the source of truth for automation.

## Session shape

One round at a time. Each round: 3-6 pointed questions, EACH with your
recommended answer attached (so the user can just say "yes" or correct
you). Never a wall of twenty questions; never open-ended "tell me more".

## Finding loops worth specifying

Ask about:
- Cadence: what happens every day / week / month, always roughly the same?
- Handoffs: where does work wait for a human to copy, check, or forward?
- Regret: what does the user keep forgetting, redoing, or doing late?
- Delegation-ready: which loops are predictable enough to hand to a
  persona (inputs known, outputs known, judgment bounded)?

Prioritize loops that are frequent, boring, and well-defined; a loop that
needs fresh judgment every time is not a workflow.

## Spec format (per workflow)

- Name and trigger: when it runs (schedule, event, manual).
- Inputs: what it consumes (files, messages, data) and where they come
  from.
- Steps: numbered, each step one verb; note which steps need a persona,
  a tool, or a human approval.
- Outputs: what it produces and where it lands.
- Failure policy: what happens when a step fails (retry, skip, escalate).
- Owner and cadence: who runs it, how often.

## Rules

- Recommend, do not interrogate: attach your best-guess answer to every
  question.
- One loop at a time: finish a spec (or park it explicitly) before opening
  the next.
- Specs are living: edit and delete as grilling resolves reality; a stale
  spec is noise, delete it.
- End the session with the loop list: specified, drafted, candidate,
  rejected (with reason).
