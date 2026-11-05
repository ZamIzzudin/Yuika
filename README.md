<div align="center">

<img src="docs/assets/logo.png" width="130" alt="Yuika logo" />

# Yuika

**A multi-project agent OS with skill-based personas you can train.**

[![CI](https://github.com/ZamIzzudin/Yuika/actions/workflows/ci.yml/badge.svg)](https://github.com/ZamIzzudin/Yuika/actions/workflows/ci.yml)

Yuika is a self-hosted workspace where AI personas do real work: researching,
writing, coding, and planning, alone or as a team. Every persona has its own
identity, skill set, model route, and growth history. You steer them from a
single chat-first workspace with full visibility: approvals, traces, budgets,
and metering are all inspectable.

> The name combines *yui* (dream) and *ka* (excellence): an excellent dream.

</div>

---

## Why Yuika

- **Personas, not generic bots.** Pick a partner from the character studio:
  Coder, Scholar, Scribe, Designer, Analyst, Operator, Planner, or the maestro
  Conductor. Each bundles its own prompt, tools, and learned skills.
- **Skills that grow.** When a persona does something well, it can distill the
  experience into a reusable skill. You review, edit, accept, or reject.
  Accepted skills are immediately usable by every persona.
- **Team delegation.** The Conductor splits work and delegates to child
  personas with isolated sessions, live progress, and steering mid-run.
- **You stay in control.** Risky tool calls (running code, writing files)
  require explicit approval with a deadline, and everything is logged per turn.
- **Sandboxed execution.** `node` runs inside a disposable Docker container:
  no network, capped resources, read-only filesystem, hard timeout.
- **Honest metering.** Token usage per turn, per persona, per model, taken
  only from provider-reported numbers. No estimates.

## Getting started

### Prerequisites

- **Node.js 24+** and npm (the repo uses npm workspaces)
- **Docker** (optional but recommended) enables the execution sandbox.
  Without it, `node` falls back to local execution with a clear warning.
- Any **OpenAI-compatible API key** (OpenAI, GLM, OpenRouter, or local
  gateways), configurable per provider kind in Settings.

### Install and run

```bash
git clone https://github.com/ZamIzzudin/Yuika.git
cd Yuika
npm install
```

Copy the environment template and put your key in `.env`:

```bash
cp .env.example .env
# then edit .env:
#   YUI_OPENAI_BASE_URL=https://api.openai.com/v1
#   YUI_OPENAI_API_KEY=sk-...
#   YUI_MODEL=gpt-4o
```

Start the dev stack (Next.js web app plus Fastify API, wired by turbo):

```bash
npm run dev
```

Open **http://localhost:3000**, pick a persona from the orbit, and start
talking. Everything else (provider, models, budgets, MCP servers) can be
tuned later from the in-app Settings.

> Prefer Docker end-to-end? `docker compose up` builds both apps with
> production settings; `docker-compose.smoke.yml` runs a tiny self-check stack.

### Try these first

1. **Chat with the Coder** and ask it to write and run a small Node script.
   You will see the approval card, then the sandboxed output.
2. **Delegate research.** Ask the Conductor to have the Scholar summarize a
   topic, then watch the delegation card stream progress.
3. **Train a skill.** In the Persona page, create a training mission and let
   a persona study material you upload.
4. **Inspect everything.** Open the Logs tab for a per-turn trace, or
   Settings, Metering for token usage.

## Monorepo layout

```
Yuika/
├── apps/
│   ├── web/            Next.js: chat, persona studio, approvals, panels
│   └── api/            Fastify: REST owner of the agent runtime
├── packages/
│   ├── contracts/      zod schemas: events, REST, personas (source of truth)
│   ├── core/           agent loop, tools, delegation, sandbox, MCP, metering
│   ├── personas/       persona data: prompt, toolsets, delegation rules
│   └── skills/         seed skills (agentskills.io-compatible SKILL.md)
├── e2e/                Playwright specs (smoke, persona studio, mascot)
├── mcp-servers/        first-party MCP servers (e.g. tailscale)
├── docs/               plan, tasks, design system, art direction
└── mcp.json            MCP server registry
```

## Development

```bash
npm run dev          # web + api dev servers (turbo)
npm run build        # production build
npm test             # unit tests across all packages
npm run e2e          # Playwright e2e (starts its own stack)
```

Core guarantees are pinned by tests: contract invariants, delegation
isolation, approval persistence, sandbox integration (opt-in with
`YUI_SANDBOX_IT=1`), and a deterministic smoke demo against a mock provider.

## License

UNLICENSED, proprietary, all rights reserved. See [LICENSE](LICENSE).
