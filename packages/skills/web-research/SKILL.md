---
name: web-research
description: "Structured web research loop with source cross-checking."
version: 0.1.0
author: Yuika Team
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

1. **Search before fetching**: run `web_search` with 2–4 candidate queries (different
   angles: official term, local-language term, "news"/"price"/"discussion" intent).
   Results come tagged with `source` (news, market, social, wikipedia, github, …) and
   partial failures are listed in `errors`, refine the query instead of retrying.
2. **Pick targets**: choose 2–4 authoritative results (official docs, primary sources,
   named outlets) over blog aggregators. Prefer primary sources for numbers and dates.
3. **Fetch** each target with `web_fetch` (Readability markdown, robots-aware). Note the
   HTTP status; a failed fetch is a finding, not a reason to guess.
4. **Extract**: per source, pull only the claims relevant to the goal. Keep numbers,
   version/date labels, and timestamps attached to their source URL.
5. **Cross-check**: for each load-bearing claim, find a second independent source.
   Mark claims that remain single-sourced as _(single source)_.
6. **Summarize** as bullet memos: `- claim, source URL`. End with a **Caveats** section
   (contradictions, stale data, paywalled sources, delayed market quotes).

## Pitfalls

- Guessing or hand-constructing URLs instead of using `web_search`, most "blocked"
  research failures are just this.
- Trusting SEO content farms or pages that quote each other (not independent).
- Dropping the source URL, an unsourced claim is worthless to the team.
- Fetching 10 pages hoping something emerges, search, pick, then fetch.
- Treating delayed stock quotes (source `market:stooq`) as realtime.

## Verification

Every factual line in your summary carries a URL; caveats listed; nothing invented.
