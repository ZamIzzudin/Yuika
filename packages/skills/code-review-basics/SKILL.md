---
name: code-review-basics
description: "Checklist-based code review before merging changes."
version: 0.1.0
author: Yuika Team
license: MIT
platforms: [linux, macos, windows]
metadata:
  yui:
    tags: [code-review, quality, software-development]
    category: qa
    personas: [yui-coder]
---

# Code Review Basics Skill

## When to Use

Before finishing any code change, or when reviewing someone else's diff.

## Procedure

For each change, walk this checklist in order:

1. **Intent**, does the change do what the task asked? Nothing more?
2. **Feedback loop**, is there a command that goes red on the bug and green on the fix?
   If not, build it first (`run_command`, allowlist: `node`, `ls`, `echo`).
3. **Correctness**, edge cases: empty input, unicode paths, async errors swallowed.
4. **Minimal diff**, no unrelated formatting, no dead code, no "while I'm here" refactors.
5. **Names & structure**, does a new function exceed ~50 lines or nesting > 3? Split it.
6. **Security**, path escapes (resolve inside workspace), injection into commands,
   secrets printed into output.

## Pitfalls

- Reviewing style instead of correctness.
- Fixing symptoms when the root cause is elsewhere, reproduce FIRST.
- Claiming "works" without having run anything.

## Verification

Checklist walked out loud (briefly); verification command output shown or absence
explained.
