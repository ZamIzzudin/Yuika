---
name: web-research
description: "Structured web research loop with source cross-checking."
version: 0.1.0
author: Your-Yui Team
license: MIT
platforms: [linux, macos, windows]
metadata:
  yui:
    tags: [research, web, citations]
    category: research
    personas: [yui-scholar]
---

# Web Research Skill

## When to Use

Any task that needs facts from the web: comparisons, "what is the current X", library/
framework research, verifying claims.

## Procedure

1. **Plan queries first**: write 2–4 candidate URLs or search targets BEFORE fetching.
   Prefer official docs and primary sources over blog aggregators.
2. **Fetch** each target with `web_fetch` (or an MCP fetch tool if available). Note the
   HTTP status; a failed fetch is a finding, not a reason to guess.
3. **Extract**: per source, pull only the claims relevant to the goal. Keep numbers and
   version/date labels attached to their source URL.
4. **Cross-check**: for each load-bearing claim, find a second independent source.
   Mark claims that remain single-sourced as *(single source)*.
5. **Summarize** as bullet memos: `- claim — source URL`. End with a **Caveats** section
   (contradictions, stale data, paywalled sources).

## Pitfalls

- Trusting SEO content farms or pages that quote each other (not independent).
- Dropping the source URL — an unsourced claim is worthless to the team.
- Fetching 10 pages hoping something emerges — plan first, fetch second.

## Verification

Every factual line in your summary carries a URL; caveats listed; nothing invented.
