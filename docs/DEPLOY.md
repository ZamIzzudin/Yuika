# Self-hosting Yuika Studio on a VPS

This guide deploys the Yuika Studio web app (the persona studio for agentic
AI) on a plain Linux VPS. No Dokploy, Kubernetes, or any platform is needed:
Docker Engine, a DNS record, and this repository.

Two things run in one compose project:

- **web** - the Next.js UI, served over HTTPS by Caddy
- **api** - the Fastify engine (sessions, projects, personas, tools), bound
  to the internal compose network only, never published

Accounts are NOT stored here. Sign-in happens against a centrally operated
Yuika Portal (account portal plus linked-device relay). As a studio operator
you receive two URLs from the portal operator:

- `YUI_PORTAL_URL` - the central portal: `https://yuika.notu.dev`
- `YUI_RELAY_URL` - the portal relay for linked devices: `wss://yuika-relay.notu.dev`

Want everything private on one box, portal included? The optional variant
`deploy/docker-compose.with-portal.yml` bundles the portal and relay too.

Already running Dokploy (or any Traefik edge) on the same VPS? Skip the Caddy
of this guide and use `docker-compose.traefik.yml` instead: see
[Sharing the VPS with Dokploy](#sharing-the-vps-with-dokploy) below.

## Server requirements

| Item       | Minimum                  | Comfortable           |
| ---------- | ------------------------ | --------------------- |
| CPU        | 1 vCPU                   | 2 vCPU                |
| RAM        | 1 GB (+ 2 GB swap for first build) | 2 GB       |
| Disk       | 10 GB                    | 20 GB                 |
| OS         | Ubuntu 22.04+ / Debian 12+ | same                 |
| Software   | Docker Engine 24+, Docker Compose v2, git | same |
| Ports      | 22 (SSH), 80, 443 open   | same                  |
| DNS        | one A record you control | same                  |

The 1 GB minimum works: steady-state memory is around 350 MB for the whole
stack. The catch is the first image build (Next.js + one native module);
with 1 GB RAM add 2 GB of swap first (step 2 covers it).

## Step 1 - Point DNS at the server

In your DNS provider, create one A record:

| Type | Name             | Value        |
| ---- | ---------------- | ------------ |
| A    | `studio` (or `@`) | your VPS IP |

Wait for propagation (`dig +short studio.yourdomain.example` must return the
VPS IP) before step 6, or the HTTPS certificate will fail to issue.

## Step 2 - Prepare the server

SSH in as root (or a sudo user). Add 2 GB swap if your VPS has 1 GB RAM:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Basic firewall:

```bash
apt update && apt install -y ufw
ufw allow OpenSSH && ufw allow 80 && ufw allow 443
ufw --force enable
```

## Step 3 - Install Docker

Official repository install (Ubuntu; Debian users replace `ubuntu` with
`debian` in the URL):

```bash
apt install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt update && apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
```

Check: `docker run --rm hello-world`.

## Step 4 - Get the code and configure

```bash
cd /opt && git clone https://github.com/ZamIzzudin/Yuika.git
cd Yuika
cp .env.example .env
nano .env
```

Fill in the `Production VPS` block at the bottom of `.env`:

```ini
STUDIO_DOMAIN=studio.yourdomain.example
YUI_PORTAL_URL=https://yuika.notu.dev
YUI_RELAY_URL=wss://yuika-relay.notu.dev
```

Also set the model provider credentials in the same file (`YUI_OPENAI_API_KEY`
at minimum; `YUI_PROVIDER_KIND` if you use Anthropic or Gemini). Keys live
only in `.env` on your server and are passed to the api container at runtime;
they are never baked into images.

No registration is needed: the portal accepts sign-in callbacks from any
self-hosted studio at `https://<host>/auth/callback` (open redirect policy).
If a specific portal runs in strict mode, its operator will ask you for your
callback URL first.

## Step 5 - Build and start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

First build takes several minutes. Follow the edge log until the certificate
is issued:

```bash
docker compose -f docker-compose.prod.yml logs -f caddy
```

Look for `certificate obtained successfully`. Then open
`https://studio.yourdomain.example`.

## Step 6 - First sign-in and lockdown check

1. The studio shows the sign-in gate. Click sign in; you are redirected to
   the portal, sign in (or create your account there), and land back in the
   studio.
2. Verify the API is closed to strangers:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  https://studio.yourdomain.example/api/personas
```

Expected: `401`. The production compose sets `YUI_AUTH_REQUIRED=1`, so the
API requires a token from the very first boot; there is no open window even
before the first user signs in.

## Sharing the VPS with Dokploy

When Dokploy already owns ports 80/443 on the server (its Traefik edge),
the studio must NOT bind them. Use the proxy-less variant instead of the
standalone one. Two ways to run it:

- **From the Dokploy UI (no SSH):** create a Docker Compose project, connect
  this repository, set the compose path to `docker-compose.traefik.yml`,
  paste the variables from step 4 into the project environment, deploy.
  Updates: click Redeploy (re-pulls the default branch).
- **From the CLI:**

```bash
cd /opt/Yuika
cp .env.example .env && nano .env          # same variables as step 4
docker compose -f docker-compose.traefik.yml up -d --build
```

Differences from the standalone stack:

- No Caddy. The web and api containers join Dokploy's `dokploy-network`
  (external, must exist - it does once Dokploy is installed) and carry
  Traefik labels. Dokploy's edge picks them up automatically and issues the
  certificate through its `letsencrypt` resolver. Nothing to click in the
  Dokploy UI.
- Routing at the edge: everything under `/api/*` goes to the api container
  (router `studio-api`, priority 100), the rest to the web container
  (router `studio-web`, priority 10). Same-origin, SSE-safe.
- No additional ports to open. Only the DNS record for `STUDIO_DOMAIN`
  pointing at the VPS is needed.

Verify Dokploy's network name before starting (`dokploy-network` is the
default):

```bash
docker network ls | grep dokploy
```

Updates use the same updater with the compose file switched:

```bash
YUI_COMPOSE_FILE=docker-compose.traefik.yml ./scripts/update.sh
```

Everything else (backup volume, reset, logs) works the same; just replace
`-f docker-compose.prod.yml` with `-f docker-compose.traefik.yml`.

## Day 2 operations

**Update to a new version:**

Releases are git tags (`v*`). Announcements go out through the portal news
page and the studio itself shows an update indicator in Settings once a
newer release exists. To apply an update, run the bundled updater:

```bash
cd /opt/Yuika && ./scripts/update.sh
```

It fetches the newest release tag, rebuilds the containers, and waits for
the API healthcheck. Expect a few minutes of build time and a few seconds
of downtime while containers restart; the yui-data volume is never touched.
Rollback is the same flow pointed at an older tag:

```bash
cd /opt/Yuika
git checkout v0.8.0                 # any previous release
docker compose -f docker-compose.prod.yml up -d --build
```

`./scripts/update.sh --main` tracks the main branch instead of release tags;
use it only if you accept less tested code. Note: local modifications to the
checkout are discarded on every update; configuration belongs in `.env`.

Check what you run at any time: `curl -s https://studio.yourdomain.example/api/meta`
returns the running version and (when a release exists) the latest.

**Logs:**

```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web
```

**Backup everything you own** (SQLite databases, workspace files, vault
keys, auth tokens; all inside the `yuika-data` volume):

```bash
docker run --rm -v yuika_yui-data:/data -v "$PWD:/backup" \
  alpine tar czf /backup/yuika-$(date +%F).tar.gz -C /data .
```

Restore is the same command reversed. Losing `vault.key` inside the volume
means losing every stored secret, so keep backups off the server.

## What runs where (and what stays off)

- Only ports 80/443 are open. The API, its SQLite files, and the workspace
  live inside the `yuika-data` volume on your VPS, unreachable from outside
  the compose network.
- Browser traffic is always HTTPS. Browser and API share one origin, so no
  CORS is involved.
- Agent tool availability on a server: file tools, research, MCP servers,
  and vault work as on desktop. Features that need host hardware are off by
  default: the live screen and its Chromium, and workshop containers (which
  would need the Docker socket mounted). The terminal tab falls back to a
  shell inside the api container, isolated from the host system.

## Troubleshooting

- **Certificate fails to issue** (`logs caddy` shows ACME errors): DNS not
  propagated yet, or port 80 blocked. Re-run `dig +short $STUDIO_DOMAIN`,
  check `ufw status`, then `docker compose -f docker-compose.prod.yml
  restart caddy`. Let's Encrypt limits retries to 5 per hour per domain.
- **First build dies with exit 137:** out of memory. Add the swap from step
  2, then build again.
- **Sign-in redirects then errors:** `YUI_PORTAL_URL` in `.env` is not the
  public https URL, or the portal you point to runs in strict mode and has
  not whitelisted your callback yet.
- **Streams (live events) feel frozen behind another proxy:** this stack
  already disables buffering at Caddy; if you put another proxy in front,
  make sure it does not buffer `/api/*` responses.
- **Reset everything:** `docker compose -f docker-compose.prod.yml down`,
  then `docker volume rm yuika_yui-data`. This deletes all studio data.
