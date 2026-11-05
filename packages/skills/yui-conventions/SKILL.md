---
name: yui-conventions
description: "Workspace conventions for Yui personas."
version: 0.1.0
author: Yuika Team
license: MIT
platforms: [linux, macos, windows]
metadata:
  yui:
    tags: [conventions, workspace]
    category: productivity
---

# Yui Workspace Conventions Skill

## Workspace layout

```
workspace/
└── reports/        # semua deliverable dokumen (markdown) di sini
```

## Conventions

1. **Paths**: always relative to the workspace root, forward slashes. Never write outside
   the workspace; `write_file` outside `reports/` requires user approval by policy.
2. **Language**: answer in the user's language (default Indonesian). Code, identifiers,
   and file contents stay in English.
3. **Tool references**: name tools exactly (`web_fetch`, `skill_view`, `delegate_task`).
4. **Honesty over confidence**: unknown → say unknown; unverifiable → mark it.
5. **Summaries over transcripts**: when reporting delegation results, summarize; never
   paste raw tool output walls.

## Verification

Any file you create is inside `workspace/reports/` and kebab-case named.
