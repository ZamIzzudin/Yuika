# syntax=docker/dockerfile:1
# P0-INF-5, image Yuika (web + api) untuk docker compose.
#
# Multi-stage, DUA target runtime dari satu file:
#   web : Next.js standalone (output:standalone, bundle minimal, tanpa devDeps)
#   api : Fastify + @yuika/core via tsx (core exports menunjuk src/*.ts, tsx
#         adalah runtime loader resmi sampai core punya build dist sendiri).
#
# Data user (sqlite + workspace) TIDAK di dalam image, volume /data
# (YUI_DB_PATH=/data/demo.db, YUI_WORKSPACE_DIR=/data/workspace) supaya
# upgrade image tidak memindahkan data.
#
# Base: bookworm (glibc), better-sqlite3 prebuilt binaries tersedia;
# alpine (musl) memaksa kompilasi dari source.

# ---------- stage 1: build web (standalone) ----------
FROM node:24-bookworm-slim AS build
WORKDIR /app

# Deps dulu (layer cache: package*.json jarang berubah vs source)
COPY package.json package-lock.json turbo.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/personas packages/personas
COPY packages/skills packages/skills
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci --no-audit --no-fund

# Source (di-copy setelah .dockerignore membuang .next/node_modules lokal)
COPY . .

# NEXT_PUBLIC_* di-inline ke bundle client SAAT BUILD, base URL api
# dari sudut pandang BROWSER pengguna (default: docker host di mesin sama).
ARG NEXT_PUBLIC_API_BASE=http://127.0.0.1:3211
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE \
    NEXT_OUTPUT_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1
RUN npx turbo run build --filter=@yuika/web --cache-dir=.turbo

# ---------- target: web (standalone) ----------
FROM node:24-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# Next standalone mereplikasi struktur monorepo: /app/{apps/web/server.js,
# node_modules, package.json, apps/web/.next/static, apps/web/public}
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# ---------- target: api (fastify + runtime @yuika/core) ----------
FROM node:24-bookworm-slim AS api
WORKDIR /app

# uv untuk server MCP berbasis uvx (git, time), binary tunggal, tanpa python image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Prod deps seluruh workspaces (npm workspaces tidak punya filter per-package
# untuk ci; v1: prune, catat di TASKS)
COPY package.json package-lock.json turbo.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/personas packages/personas
COPY packages/skills packages/skills
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --no-audit --no-fund

# Source runtime: core+contracts (TS, dimuat tsx), api, konfigurasi MCP,
# turbo.json WAJIB (resolveRepoRoot berjalan mencari file ini!)
COPY . .

# Data user di volume; api wajib dengar 0.0.0.0 (default 127.0.0.1 menolak
# port-forward container)
ENV YUI_API_HOST=0.0.0.0 \
    YUI_API_PORT=3211 \
    YUI_DB_PATH=/data/demo.db \
    YUI_WORKSPACE_DIR=/data/workspace \
    NODE_ENV=production
RUN mkdir -p /data/workspace
VOLUME /data

EXPOSE 3211
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3211/api/personas').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node_modules/.bin/tsx", "apps/api/src/server.ts"]
