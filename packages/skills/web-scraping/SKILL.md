---
name: web-scraping
description: Search, scrape, and extract structured data from web pages using Yuika research tools (search providers, fetch, cache) or a scraping CLI in the workshop when available. Use when asked to scrape a page, grab content from a URL, extract tables/lists, or monitor a page.
metadata:
  yui:
    category: research
    status: ready
    personas: [yui-scholar]
    tags: [research, scraping]
---

# Web Scraping (structured extraction)

Getting structured data out of web pages, on top of Yuika research tools
(search, fetch with robots/caching awareness). Adapted from the
"just-scrape" skill (ScrapeGraph AI CLI); if a scraping CLI is installed in
the project workshop, prefer it for heavy crawling.

## Choosing the path

- One page, mostly text: research fetch on the URL; extract from the HTML.
- Search + read: research search (multi-provider), fetch the top primary
  results; record which provider found what.
- Many pages / site crawl / JS-heavy page: a CLI in the workshop
  (curl + a parser, playwright, or a scraping framework) after asking the
  user for approval to install; state why it is needed.
- Monitoring a page over time: save the extracted snapshot + timestamp in
  the project docs; diff on the next run.

## Extraction discipline

1. Inspect the real markup first (fetch raw HTML) before writing selectors;
   do not assume class names.
2. Prefer semantic anchors: headings, tables, list structure, JSON-LD,
   <script type="application/json"> payloads. Many "scraping" jobs are
   really "find the embedded JSON" jobs.
3. Extract to a schema BEFORE pulling bulk data: define the fields
   (title, price, date, url, note), validate 3 sample rows against the page
   with the user or your own re-read, then batch.
4. Keep the source: store page URL + fetch date next to every dataset;
   citations survive page changes.
5. Respect robots.txt and the research cache; rate-limit; identify
   yourself; stop at signs of blocking (429/403) and say so instead of
   hammering.

## Output

- Structured data as CSV/JSON in the project workspace (Files tab), plus a
  short extraction note: source, schema, row count, anomalies, and anything
  that failed to parse.
- If the goal is research findings rather than data, hand off to the
  source-research skill (primary sources, cited notes).

## Anti-patterns

- Scraping a page when an official API or a download button exists.
- Hardcoded fragile selectors without a fallback anchor.
- Bulk extraction before validating the schema on samples.
- Dropping the source URL and date from extracted rows.
