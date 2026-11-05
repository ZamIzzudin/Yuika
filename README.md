# Yuika 🎀

> Platform AI agent multi-platform (cloud · web · mobile · desktop) dengan **persona per
> keahlian**, MCP, skills learning-loop, dan delegation. Status: **minggu demo internal**.
>
> **Yuika** — "yui" (mimpi / 唯華) + "ka" (unggul / 香): *mimpi yang unggul*.
> Nama pendek "Yui" tetap dipakai untuk sang persona maestro (`Maestro Yui`).

## Dokumen

| Dokumen | Isi |
|---|---|
| [`docs/PLAN.md`](./docs/PLAN.md) | Blueprint lengkap: visi, arsitektur, keputusan D1–D13, roadmap fase |
| [`docs/DEMO-WEEK-1.md`](./docs/DEMO-WEEK-1.md) | Rencana eksekusi demo internal 1 minggu (3 dev, harian) |
| [`docs/TASKS.md`](./docs/TASKS.md) | **Checklist delegasi & roadmap sampai siap testing** (sumber kebenaran progres) |

## Struktur

```
yuika/
├── packages/
│   ├── contracts/      # ★ zod: event catalog + REST + persona manifest (SINGLE SOURCE OF TRUTH)
│   ├── core/           # agent loop, registry, tools, personas/skills loader, delegation, MCP, approval
│   ├── personas/       # data: 4 persona (persona.yaml + PERSONA.md + toolsets/skills/delegation)
│   └── skills/         # data: 5 skill seed (agentskills.io-compatible SKILL.md)
├── apps/
│   └── web/            # Next.js: chat SSE + persona picker + approval + delegation cards
├── workspace/reports/  # deliverable agent (di-gitignore)
├── mcp.json            # MCP servers demo (fetch + filesystem)
└── docs/
```

## Quickstart

```bash
npm install
cp .env.example .env        # isi YUI_OPENAI_API_KEY dst.
npm run dev                 # web :3000 + api :3211 (turbo paralel, dua proses)
npm test                    # contracts + core + api (vitest)
npm run typecheck
npm run e2e                 # E2E smoke Playwright (mock provider, tanpa API key)
```

E2E (P0-QA-1) menjalankan 3 server terisolasi (mock provider :3299 → api :3291 →
web :3990, data di `e2e/.tmp`) dan menuntaskan skenario demo §2 end-to-end —
pilih Conductor → delegasi Scholar via SSE → jawaban final → replay persist. Tidak
bentrok dengan dev server yang sedang jalan.

Atau jalankan semuanya di Docker (P0-INF-5):

```bash
docker compose up -d --build   # build image web+api, hidup di :3000 / :3211
# data user (sqlite + workspace) persist di volume yui-data — aman saat rebuild
# akses dari LAN: NEXT_PUBLIC_API_BASE=http://<host-anda>:3211 docker compose up -d --build web
```

Arsitektur (P0-INF-1): `apps/web` (Next.js, pure frontend) memanggil `apps/api`
(Fastify, pemilik runtime @yui/core) via HTTP — `NEXT_PUBLIC_API_BASE`
(default `http://127.0.0.1:3211`).

Penyimpanan sesi **swappable** (P0-DATA-1): default SQLite embedded; untuk
server / multi-worker, Postgres —

```bash
docker compose --profile postgres up -d --build   # + db :5545, api-pg :3213, web :3003
# atau tanpa docker: YUI_DB_DRIVER=postgres DATABASE_URL=postgres://… npx tsx apps/api/src/server.ts
# migrasi data lama (idempoten — aman diulang):
npx tsx scripts/migrate-sqlite-to-pg.mjs --from data/yui.db --to $DATABASE_URL
```

Skenario demo: pilih **Yui Conductor** → *"Riset 3 framework JS paling populer sekarang,
bandingkan singkat, tulis laporan markdown ke reports/"* → amati dekomposisi → delegasi ke
Scholar (riset + MCP) → Scribe (menulis + approval) → celebrating → refresh (resume).

## Aturan Repo (dari PLAN.md — dihafal semua dev)

1. **Kontrak dulu.** Semua tipe lintas core↔klien dari `@yui/contracts`. Tipe tangan = PR ditolak.
2. **History append-only.** Sistem prompt + toolset frozen saat sesi dibuat (prompt-cache discipline).
3. **Narrow waist.** Kapabilitas baru: skill → MCP → plugin; core tool = jalan terakhir.
4. **Shortcut demo ditandai** `// DEMO-SHORTCUT:` — dibayar di fase P0 (lihat TASKS.md).
5. **Persona = data**, bukan kode: package di `packages/personas/` (manifest + prompt + binding).

## Stack (D7)

npm + turbo · TypeScript strict · zod contracts · Node + better-sqlite3 (demo) · Next.js 15 ·
OpenAI-compatible provider (D12) · @modelcontextprotocol/sdk · Rive (placeholder CSS sementara).
