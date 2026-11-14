<div align="center">

<img src="docs/assets/logo.png" width="130" alt="Yuika logo" />

# Yuika

**Studio Persona for Agentic AI**

[![CI](https://github.com/ZamIzzudin/Yuika/actions/workflows/ci.yml/badge.svg)](https://github.com/ZamIzzudin/Yuika/actions/workflows/ci.yml)

Most agent tools give you one generic assistant. Yuika gives you a **studio**:
a self-hosted workspace where you design personas, train them into capable
specialists, direct them on real projects, and trust them with full
visibility. Personas live as characters with their own identity, skill set,
model route, and growth history, and they work alone or as a team under your
supervision.

> The name combines *yui* (dream) and *ka* (excellence): an excellent dream.

</div>

---

## The studio loop

Everything in Yuika follows one loop:

1. **Design.** Compose a persona in the character studio: its character,
   skills, and model route. Start from a bundled specialist (Coder, Scholar,
   Scribe, Designer, Analyst, Operator, Planner) or the maestro Conductor.
2. **Train.** Send the persona on training missions. It researches or studies
   files you provide, then distills what it learned into a skill draft. You
   review, edit, accept, or reject; accepted skills are immediately usable by
   every persona.
3. **Direct.** Put personas to work in your projects through a chat-first
   workspace. The Conductor splits work and delegates to child personas with
   isolated sessions, live progress, and steering mid-run.
4. **Trust.** Risky tool calls (running code, writing files) require explicit
   approval with a deadline. Execution runs in a disposable sandbox (no
   network, capped resources, read-only filesystem, hard timeout). Every turn
   is traced, and token usage is metered per turn, per persona, per model
   from provider-reported numbers only.

## Feature reference

Everything Yuika ships today, in one place. No hidden features: if it is
listed here it exists in the app; if it is in the app it is listed here.

### Workspace and projects

Your work lives in **projects**. Each project is an isolated workspace with
its own files, sessions, design files, browser history, workflow runs, roster
and sandbox containers.

- **Dashboard** per project: activity feed, live session tiles, roster.
- **Task board** (TeamTree): break work into tasks, assign them to personas,
  track state per task.
- **Files**: tree, editor, revisions with diff, search; `read_file`,
  `write_file`, `list_files`, `search_files` tools for personas.
- **Uploads**: bring your own material (size capped, type checked) for study,
  training or design.
- **Project deletion is a sweep**: design files, browser visits, workflow
  runs, orphan delegation rows and docker containers/volumes owned by the
  project are all removed together.

### Personas

A persona is a **character**, not a prompt template: identity (PERSONA.md),
toolsets, delegation rules, skills, model route, growth history and a
portrait of the Orin mascot family. Nine specialists ship built in:

| Id | Name | Role |
| --- | --- | --- |
| `yui-planner` | Rommel | breaks goals into plans and tasks |
| `yui-conductor` | Maestro | the maestro: delegates and conducts teams |
| `yui-scribe` | Poe | documents, notes, reports; reads docx/pdf |
| `yui-analyst` | Nighty | analysis and data work |
| `yui-scholar` | Pierre | research and study |
| `yui-coder` | Hiro | codes, runs commands, ships |
| `yui-sherlock` | Watson | QA: watches and checks other personas |
| `yui-designer` | Picasso | draws on the design canvas |
| `yui-operator` | Neo | operates the screen and tools |

- Every persona has a **model route** (its own model choice) and a skill
  loadout you can tune per persona.
- **Rename** any persona: display name changes everywhere (prompt, picker,
  roster, growth) while the internal id stays stable.
- **Growth history**: milestone events per persona, visible in the studio.
- Pretrain packs are bundled for all personas (PM toolkit, PRD writing,
  research, copywriting, xlsx/dataviz, LLM product engineering, and more).
- House style is enforced in the core prompt: no emoji, no em dashes.

### Persona Forge (custom personas)

Build your own persona, standalone by construction (no hidden base).

- Pick a name, description and **native functions** from 47 tools in 8
categories (files, terminal, browser, design, web, skills, vault, QA).
- Custom personas are executors, not orchestrators: `delegate_task`,
`consult` and MCP tools are excluded, delegation is locked.
- **Share as a file**: export any custom persona to a `.persona.json` file,
import it elsewhere. Imports are fully revalidated, tampered files are
rejected.

### Chat sessions

- Live streaming chat (SSE) with any persona in a project.
- **Steering**: redirect or reassign a persona mid-run.
- Sessions survive restarts: events replay from the ledger, long histories
compress automatically (slim context), and `session_search` lets personas
quote older sessions.
- **Trace**: per-turn event timeline (tool calls, timings, tokens) in the
Logs tab.
- Right-click a design component to **attach it to chat** as context.

### Delegation (teams)

- Ask the Conductor and it splits work, then spawns **child personas with
isolated sessions** of their own.
- Live delegation cards stream progress; pause, resume or steer each child.
- Isolation is guaranteed and tested: a child never sees its parent's
secrets or unrelated sessions.

### Workflow runs

- Multi-step workflows from a template plus your brief (chat-driven).
- Steps, **gates** and approvals render live on a workflow board; each run
is steerable and fully traced.

### Approvals and trust

- Risky tool calls (commands, file writes, takeovers) require **explicit
approval with a deadline**; approvals persist across restarts and can be
answered from any paired device (mobile included).
- `request_login` asks you to fill a login through the vault; `request_takeover`
asks you to hand over the shared screen for a manual step (login, captcha).

### Execution: sandbox, terminal, workshop

- **Sandbox**: commands run in disposable Docker containers with no network,
capped CPU/RAM, read-only filesystem and a hard timeout. Fork bombs die
there. Without Docker, execution falls back to local `node` with a clear
warning.
- **Egress allowlist**: a container that legitimately needs network (for
example `npm install`) goes through the host-side proxy, which only
forwards allowlisted hosts (default: npm registry). Configure per project
in `.yuika/egress.json`.
- **Terminal**: every session can open a real terminal in its own container;
commands are logged.
- **Workshop**: a persistent container per project (volume survives,
sleeps and wakes quickly) for long-running work; orphaned workshop
containers are swept automatically.

### Research and the live browser

- **Research stack** behind `web_search` and `web_fetch`: DuckDuckGo,
SearXNG, GitHub, Hacker News, news, social, StackExchange, Wikipedia,
docsites and market lookups; robots.txt respected, results cached, rate
budgeted.
- **Live browser** (headless Chrome): `browser_open`, `browser_snapshot`,
`browser_click`, `browser_type`, `browser_scroll`, `browser_press`. Snapshots
are read-only text, so browsing never needs approval unless it acts.

### Screen watch and QA

- The host screen can be **leased and watched**: live view in the studio,
picture-in-picture, or 1fps watch from the desktop app via the relay.
- **Watson (QA)** can watch another persona's screen (`qa_watch`,
`qa_snapshot`, `qa_check`) and file non-blocking QA reports.

### Design studio (embedded canvas)

A zero-dependency 2D canvas editor built into the web app. You and Picasso
draw in the same file.

- Pages, frames, shapes (rect, circle, text), fills, stroke, radius,
opacity, z-order, nested components, multi-page.
- Figma-grade interactions: 8-handle resize, drag-and-drop reparent,
group/ungroup, copy/paste/duplicate, ctrl+wheel zoom, rulers, smart guides,
layers tree with rename and visibility.
- **Font bank** (90+ Google Fonts) and **icon bank** (221 Phosphor SVG
icons, 9 categories) in the properties panel.
- **Prototype mode ("Try it")**: run the file as a live prototype with
screen-to-screen wiring; edits sync live.
- Export the current page as PNG or all pages as ZIP.
- Personas read designs through staged fetches (large files answer an index
of frames first, then windows or subtrees), so a 2704px design never
truncates.
- **Design-to-code**: Hiro reads a design file and generates components with
matching structure and color tokens; regenerate picks up your edits.
- Poe can patch copywriting directly inside a design file.

### Training dungeons and skills

- **Dungeon**: send a persona on a training mission (mission.yaml: goal,
resources, acceptance criteria, target skill). The runner studies material
or the web in a sandbox, then proposes a **skill draft**; you accept, edit
or reject it.
- **Skill lifecycle**: draft, tested, ready. Only ready skills gate a persona
as project-ready in the roster.
- **Skill library** (agentskills.io-compatible SKILL.md): browse by
category, equip per persona; personas can `skills_list`, `skill_view` and
`skill_propose` new skills themselves.

### Vault and memory

- **Vault**: encrypted secret store (site logins, API keys). Personas ask
with `vault_request`; fills happen without the secret entering the prompt,
and everything is redacted from logs. `secret_http` performs authenticated
HTTP calls server-side without leaking keys.
- **Memory**: personas keep persistent notes (`memory_append`), a user
profile (user.md) and domain memory; a nudge system resurfaces the right
memory at the right time.

### MCP servers

- Install servers from a **catalog** (first-party: Tailscale status,
Cloudflare quick tunnels, Codemagic builds) or point `mcp.json` at any
server (filesystem, git, memory, time, fetch, context7,
sequential-thinking by default).
- Every server is **trusted on first use** and every MCP call lands in an
**audit log**.
- Cloudflare quick tunnels let a persona publish a local dev server to a
public URL in one call.

### Metering, budgets, models

- Token usage metered **per turn, per persona, per model, per project**
from provider-reported numbers only (never estimated).
- Spend budget per workspace, checked before a turn starts (in-flight holds
counted); usage ledger visible in Settings.
- **Providers**: OpenAI-compatible, Anthropic or Gemini; per-persona model
routes, a model price table, and a one-click **smoke test** per provider.

### Accounts, remote control, companion apps

- **Sign-in**: local accounts for private installs, or "Sign in with Yuika
Portal" SSO (OAuth-style with PKCE). The studio itself keeps no passwords.
- **Portal** ([yuika.notu.dev](https://yuika.notu.dev), self-hostable):
accounts, device pairing (QR, 120 seconds, single use), the **relay** that
carries end-to-end encrypted traffic between your devices, and **host
backups storage**.
- **Mobile** (Yuika-Mobile, React Native): your pocket remote. Chat with
resume, answer approvals from anywhere, watch screens, browse projects and
files, Mission Control mini (live delegations across projects), persona
picker with portraits, push notifications (approval requests).
- **Desktop** (Yuika-Desktop, Tauri 2): the host shell. Onboards into a
local engine (packaged node + sqlite) or connects to a remote host; welcome
wizard with provider setup (skippable, everything configurable in-app),
factory reset, and **auto-update** with one-click install and restart.

### Backups and operations

- **Backup**: one click builds a full bundle of the workspace (files,
databases, vault key, tokens; files over 8 MB skipped, 256 MB total) and
wraps it into a **self-contained restore script** (`yuika-restore.mjs`:
run it on the target host, confirm, done). Backup and restore live on
the host itself; keep the file somewhere private, it is plaintext.
- **Update**: `scripts/update.sh` pulls the newest release tag, rebuilds,
waits for the healthcheck; the in-app Settings panel shows the running
version and links the latest release. Prebuilt images on GHCR for a
no-clone try-out (`docs/TRY-YUIKA.md`).
- **Reset**: full workspace reset with a documented runbook
(`docs/PLAN-RESET-DATA.md`).

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
> No clone at all? Prebuilt images live on GHCR - the three-command quick
> start is in [`docs/TRY-YUIKA.md`](docs/TRY-YUIKA.md) (Indonesian).

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

The desktop shell (Tauri) lives in its own repository,
[ZamIzzudin/Yuika-Desktop](https://github.com/ZamIzzudin/Yuika-Desktop):
it is a thin client that onboards into a local studio stack or a hosted
one. Releases there are desktop installers only; releases here are server
releases and drive the in-app update indicator (`GET /api/meta`).

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

## Deployment

Yuika Studio is self-hostable in two ways. Both need a Linux server, one
DNS record pointing at it, and the public URL of a Yuika Portal (accounts
live there; the studio keeps no passwords).

Which compose file to use:

| File | What it is for |
| --- | --- |
| `docker-compose.prod.yml` | Option A: any plain VPS, the studio brings its own Caddy edge on ports 80/443 with automatic HTTPS |
| `deploy/docker-compose.ghcr.yml` | No-repo try-out: pulls prebuilt images from GHCR, laptop-local |
| `docker-compose.traefik.yml` | Option B: the server already runs Dokploy (or any Traefik) on ports 80/443; deploy via the Dokploy UI or CLI, no host ports taken |
| `deploy/docker-compose.with-portal.yml` | Optional: one private VPS running studio, portal, and relay together |
| `docker-compose.yml` + `docker-compose.smoke.yml` | Development only: local stack and isolated smoke tests. Not for servers |

Configure the same variables in both options:

- `STUDIO_DOMAIN` - the studio host, e.g. `studio.notu.dev`
- `YUI_PORTAL_URL` - the central portal: `https://yuika.notu.dev`
- `YUI_RELAY_URL` - the portal relay for linked devices: `wss://yuika-relay.notu.dev`
- `YUI_OPENAI_API_KEY` (+ `YUI_MODEL`, or `YUI_PROVIDER_KIND` for
  Anthropic/Gemini) - the api container refuses to boot without a provider

Sign-in needs no registration: the portal accepts callbacks from any
self-hosted studio at `https://<host>/auth/callback` by default.

### Option A - plain Docker on any VPS

For a server with nothing else on ports 80/443. One compose project: a Caddy
edge with automatic HTTPS, the web UI, and the api (never published).

```bash
cd /opt && git clone https://github.com/ZamIzzudin/Yuika.git && cd Yuika
cp .env.example .env && nano .env          # fill the variables above
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f caddy   # wait for the certificate
```

Minimum specs: 1 vCPU, 1 GB RAM (add 2 GB swap for the first build), 10 GB
disk, Docker 24+ with Compose v2. Full walk-through with DNS, swap, and
firewall steps: [docs/DEPLOY.md](docs/DEPLOY.md).

### Option B - Dokploy on the same server

When Dokploy (or any Traefik edge) already owns ports 80/443, the studio
deploys without SSH and without touching those ports. In Dokploy: create a
**Docker Compose** project, connect this repository, set the compose path to
`docker-compose.traefik.yml`, paste the variables above into the project
environment, deploy. The web and api containers register themselves with
Dokploy's Traefik via labels; the certificate is issued automatically.
Nothing to attach in the UI. The same file also works from the CLI:

```bash
docker network ls | grep dokploy             # network must exist (default name)
docker compose -f docker-compose.traefik.yml up -d --build
```

### Verify the deployment

```bash
curl -s https://studio.notu.dev/api/meta            # {"version":"0.8.0",...}
curl -s -o /dev/null -w '%{http_code}\n' \
  https://studio.notu.dev/api/personas              # 401 (locked, good)
```

Open the studio, click **Sign in with Yuika Portal**, approve on the portal,
and you are in. The API requires a token from the first boot
(`YUI_AUTH_REQUIRED=1`), so strangers never get an open window.

### Updating to a new version

Releases are git tags (`v*`). The Settings panel in the app shows the
running version and links the latest release when one is newer.

- Option A: `cd /opt/Yuika && ./scripts/update.sh` - fetches the newest
  release tag, rebuilds, waits for the healthcheck, prints the running
  version. Add `--main` to track development instead of releases.
- Option B (Dokploy UI): click **Redeploy** on the compose project; it
  re-pulls the default branch. From the CLI, the updater works with
  `YUI_COMPOSE_FILE=docker-compose.traefik.yml ./scripts/update.sh`.

Rollback is the same flow on an older tag:
`git checkout v0.8.0 && docker compose -f docker-compose.prod.yml up -d --build`.
Updates never touch user data; expect a few seconds of downtime.

### Backups

Everything user-owned (SQLite databases, workspace files, vault key, auth
tokens) lives in the `yuika-data` volume:

```bash
docker run --rm -v yuika_yui-data:/data -v "$PWD:/backup" \
  alpine tar czf /backup/yuika-$(date +%F).tar.gz -C /data .
```

Losing the vault key inside means losing every stored secret, so keep
backups off the server.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| Certificate fails to issue (ACME errors in logs) | DNS record not propagated (`dig +short $STUDIO_DOMAIN`) or port 80 blocked (`ufw status`). Let's Encrypt allows 5 retries per hour; do not spam restarts |
| First build dies with `exit 137` | Out of memory. Add the 2 GB swap (DEPLOY.md step 2), build again |
| api container restarts forever | Provider env missing in `.env` (`YUI_OPENAI_API_KEY`, `YUI_MODEL`), or `YUI_PORTAL_URL`/`YUI_RELAY_URL` unset. Check `docker compose logs api` |
| Sign-in redirects then errors | `YUI_PORTAL_URL` is not the public https URL, or that portal runs strict mode (ask its operator to whitelist the callback) |
| Studio domain 404 behind Traefik | Labels not picked up: `docker network ls | grep dokploy`, check the network name, then `docker logs <traefik-container> | grep studio` |
| Live event stream feels frozen | Only when another proxy sits in front: disable response buffering for `/api/*` |
| Want a total reset | `docker compose -f docker-compose.prod.yml down && docker volume rm yuika_yui-data` (deletes all studio data) |

Fully private single-box variant (portal included):
`deploy/docker-compose.with-portal.yml`. Complete guide with DNS, swap,
firewall, and day-2 operations: [docs/DEPLOY.md](docs/DEPLOY.md).

## License

UNLICENSED, proprietary, all rights reserved. See [LICENSE](LICENSE).
