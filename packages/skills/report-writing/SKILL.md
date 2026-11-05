---
name: report-writing
description: "Write clear markdown reports to the reports directory."
version: 0.1.0
author: Yuika Team
license: MIT
platforms: [linux, macos, windows]
metadata:
  yui:
    tags: [writing, reports, markdown]
    category: productivity
    personas: [yui-scribe]
---

# Report Writing Skill

## When to Use

Whenever the deliverable is a document (comparison, briefing, summary, recommendation).

## Procedure

1. Identify reader + decision. If unknown, state your assumption at the top of the report.
2. Structure (adapt, don't force):
   - `# Title`
   - **Ringkasan Eksekutif** — 3–5 bullet, jawaban langsung.
   - **Isi** — section per sub-topic; tabel untuk perbandingan.
   - **Rekomendasi** — konkret, bisa dieksekusi.
   - **Sumber & Catatan** — daftar URL / asumsi.
3. Write the file with `write_file` to `reports/<topik>-<tanggal>.md` (kebab-case).
4. Re-read your draft once; cut 20% of the words.

## Pitfalls

- Wall-of-text: no reader decisions without headings and tables.
- Inventing numbers to fill a table — mark `[perlu verifikasi]` instead.
- Filenames with spaces or mixed case — always kebab-case.

## Verification

File exists under `reports/`; executive summary answers the original question; every
number has a source or a verification marker.
