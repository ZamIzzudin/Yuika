# Your-Yui 🎀

> Platform AI agent multi-platform (cloud · web · mobile · desktop) dengan **persona per
> keahlian**, MCP, skills learning-loop, dan delegation. Status: **minggu demo internal**.

## Dokumen

| Dokumen | Isi |
|---|---|
| [`docs/PLAN.md`](./docs/PLAN.md) | Blueprint lengkap: visi, arsitektur, keputusan D1–D13, roadmap fase |
| [`docs/DEMO-WEEK-1.md`](./docs/DEMO-WEEK-1.md) | Rencana eksekusi demo internal 1 minggu (3 dev, harian) |
| [`docs/TASKS.md`](./docs/TASKS.md) | **Checklist delegasi & roadmap sampai siap testing** (sumber kebenaran progres) |

## Struktur

```
your-yui/
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
npm run dev                 # web di http://localhost:3000
npm test                    # contracts + core (vitest)
npm run typecheck
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
