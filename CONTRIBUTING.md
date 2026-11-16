# Contributing to Yuika

Thanks for your interest. Yuika is an agentic persona studio: a host-run
workspace where role-based AI personas (planner, conductor, coder, scholar,
and friends) plan, delegate, and execute real work under sandboxing,
approvals, and budget controls. See the README for the feature tour.

## Ground rules

- **License**: contributions are licensed under the repository license
  (see `LICENSE`). By submitting, you agree your contribution is offered
  under that license.
- **Sign-off (DCO, no CLA)**: every commit must be signed off
  (`git commit -s`), certifying you wrote or have the right to submit the
  code. `git rebase --signoff` can fix existing branches.
- **Trademarks**: "Yuika", the Yuika logo, "Orin", and persona names and
  likenesses are project trademarks of the maintainer. Contributing does
  not grant trademark rights; forks that build on this code must use their
  own product name and branding for public distributions.

## Setup

```bash
git clone … && cd your-yui
npm install            # npm workspaces (Node 24+), no other global tools
cp .env.example .env   # provider trio is optional; the app boots unconfigured
npm run dev            # turbo: api :3211 + web :3000
```

Useful checks before opening a PR:

```bash
npm run typecheck      # all workspaces
npm test               # unit tests (vitest per workspace)
npm run e2e            # Playwright smoke (spins its own stack, ports 3291/3990)
```

Docker is optional; sandbox execution and the sandbox integration suites
fall back or skip cleanly without it.

## Conventions

- **Docs-driven development.** Every task updates `docs/TASKS.md` (task
  list), `docs/BATCHES.md` (change log per batch), and `docs/FEATURES.md`
  (feature board). A PR that changes behavior without touching docs will
  be asked to add them.
- **Language.** Code, UI copy, and error messages are English. Internal
  design docs may be Indonesian; keep new public-facing docs English.
- **No emoji in UI copy, docs tables, or README.**
- **Tests required** for behavior changes: unit tests next to the code
  (`__tests__/`), e2e for user-visible flows (`e2e/`). The e2e suite runs
  against a mock provider; no API keys needed.
- **Zero-dependency web client** (`apps/web` stays runtime-dep-light) and
  **workspace data is sacred**: never write outside the user's workspace
  directory; never pollute sample data into user workspaces.
- **Commits**: imperative subject line ("Add backup export", not "added"),
  keep commits small, one logical change each.

## Where to help

- `docs/TASKS.md` open items and `docs/ROADMAP-NEXT.md` for direction.
- Bugs reproductions against the staging instance are especially welcome:
  include steps, expected vs actual, and logs from the session's Logs tab.

## Reporting security issues

Do not open public issues for security problems. See `README.md` for the
responsible disclosure contact.
