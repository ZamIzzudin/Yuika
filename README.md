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
