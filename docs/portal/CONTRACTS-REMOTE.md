# CONTRACTS-REMOTE v1, Payload Aplikasi Remote (zod, FROZEN)

> Isi envelope E2E (SPEC-PROTOCOL §5). **Opaque bagi relay & portal**, dokumen
> ini mengikat HOST dan REMOTE (semuanya di repo Yuika). Sesi portal TIDAK
> mengimplementasi ini; cukup paham untuk konteks.
>
> Repositori Yuika menyalin blok zod di bawah **verbatim** ke
> `packages/contracts/src/remote.ts` (ekspor + masuk barrel `index.ts`).
> Mirror identik: `your-yui/docs/portal/CONTRACTS-REMOTE.md`.

## 1. Aturan dasar

- Satu envelope = satu JSON object (`proto:1` selalu ada).
- Arah: remote → host = `RemoteAction`; host → remote = `RemoteEvent`.
- **Korelasi**: action ber-`rid` dibalas event ber-`rid` sama (request/response).
  Event tanpa `rid` = broadcast tak berbalas (streaming).
- **Resume**: delta ber-`seq` (per sessionId, monoton naik dari 1, reset saat
  sesi baru). Remote reconnect → kirim `subscribe{sinceSeq}` → host mengirim
  `session.snapshot{latestSeq}` + delta yang hilang. Duplikat dibuang remote
  via `seq`.
- Idle heartbeat: `ping_host` → `pong_host` tiap 20 dtk (di atas keepalive ws).
- Payload > 64 KB harus dipecah host (buffer delta); batas keras envelope = §6
  SPEC-PROTOCOL (frame 256 KB).
- Enum & shape BEKU untuk v1; field optional baru diizinkan (ignore-unknown).

## 2. RemoteAction (zod, salin verbatim)

```ts
import { z } from "zod";

export const RemoteAction = z.discriminatedUnion("act", [
  z.object({
    proto: z.literal(1),
    act: z.literal("send_prompt"),
    rid: z.string(),
    sessionId: z.string(),
    personaId: z.string().optional(),
    message: z.string(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("steer"),
    rid: z.string(),
    sessionId: z.string(),
    note: z.string(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("cancel"),
    rid: z.string(),
    sessionId: z.string(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("approve"),
    rid: z.string(),
    approvalId: z.string(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("reject"),
    rid: z.string(),
    approvalId: z.string(),
    reason: z.string().optional(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("list_sessions"),
    rid: z.string(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("subscribe"),
    rid: z.string(),
    sessions: z.array(z.string()),
    /** resume: seq terakhir yang diterima remote per sesi (map sessionId→seq) */
    sinceSeq: z.record(z.string(), z.number().int()).optional(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("unsubscribe"),
    rid: z.string(),
    sessions: z.array(z.string()),
  }),
  // ── v1.1 (SCR-7, 2026-11): remote watch live screen, aditif, penerima lama aman ──
  z.object({
    proto: z.literal(1),
    act: z.literal("watch_screen"),
    rid: z.string(),
    /** screen key \"projectId/personaId\" */
    key: z.string(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("unwatch_screen"),
    rid: z.string(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("ping_host"),
    rid: z.string(),
  }),
]);
export type RemoteAction = z.infer<typeof RemoteAction>;
```

## 3. RemoteEvent (zod, salin verbatim)

```ts
export const RemoteEvent = z.discriminatedUnion("ev", [
  z.object({
    proto: z.literal(1),
    ev: z.literal("host.state"),
    /** persona roster ringkas + sesi aktif, dikirim saat remote join */
    sessions: z.array(
      z.object({
        sessionId: z.string(),
        title: z.string(),
        personaId: z.string(),
        updatedAt: z.number().int(),
      }),
    ),
    /** v1.1 (SCR-7): live screen aktif di host, opsional, remote lama abaikan. */
    screens: z
      .array(
        z.object({
          key: z.string(),
          personaId: z.string(),
          url: z.string(),
          title: z.string(),
          status: z.enum(["starting", "running", "stopped", "failed"]),
          viewers: z.number().int(),
          watchers: z.number().int(),
        }),
      )
      .optional(),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("session.list"),
    rid: z.string(),
    sessions: z.array(
      z.object({
        sessionId: z.string(),
        title: z.string(),
        personaId: z.string(),
        updatedAt: z.number().int(),
      }),
    ),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("session.snapshot"),
    rid: z.string().optional(),
    sessionId: z.string(),
    /** transcript ringkas (≤ 50 pesan terakhir) untuk render cepat */
    messages: z.array(
      z.object({
        role: z.enum(["user", "assistant", "tool"]),
        personaId: z.string().optional(),
        text: z.string(),
        at: z.number().int(),
      }),
    ),
    latestSeq: z.number().int(),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("message.delta"),
    sessionId: z.string(),
    seq: z.number().int(),
    delta: z.string(),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("message.done"),
    sessionId: z.string(),
    seq: z.number().int(),
    finish: z.enum(["stop", "error", "cancelled"]),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("approval.request"),
    sessionId: z.string().optional(),
    approvalId: z.string(),
    title: z.string(),
    summary: z.string(),
    risk: z.enum(["low", "medium", "high"]),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("approval.resolved"),
    approvalId: z.string(),
    resolution: z.enum(["approved", "rejected", "timeout"]),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("delegation.update"),
    sessionId: z.string().optional(),
    jobId: z.string(),
    state: z.enum(["started", "progress", "done", "error", "paused"]),
    detail: z.string().optional(),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("error"),
    rid: z.string().optional(),
    code: z.string(),
    message: z.string(),
  }),
  // ── v1.1 (SCR-7, 2026-11): remote watch live screen (~1fps JPEG, read-only v0) ──
  z.object({
    proto: z.literal(1),
    ev: z.literal("screen.state"),
    rid: z.string().optional(),
    key: z.string(),
    url: z.string(),
    title: z.string(),
    status: z.enum(["starting", "running", "stopped", "failed"]),
    viewers: z.number().int(),
    watchers: z.number().int(),
    leaseOwner: z.string().nullable(),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("screen.frame"),
    key: z.string(),
    /** base64 JPEG, di-throttle 1fps + dedupe frame identik di host. */
    data: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    ts: z.number().int(),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("pong_host"),
    rid: z.string(),
  }),
]);
export type RemoteEvent = z.infer<typeof RemoteEvent>;
```

## 4. Contoh wire (padan vector `docs/vectors/proto1.json`)

```jsonc
// remote → host (action)
{"proto":1,"act":"send_prompt","rid":"r-1","sessionId":"s-demo","personaId":"yui-coder","message":"Research popular JS frameworks"}
// host → remote (event delta)
{"proto":1,"ev":"message.delta","sessionId":"s-demo","seq":1,"delta":"According to 2026 data"}
// host → remote (approval)
{"proto":1,"ev":"approval.request","sessionId":"s-demo","approvalId":"ap-1","title":"run_command","summary":"npm install","risk":"medium"}
```

## 5. Pemetaan host (implementasi Yuika, P1-PRT-3)

| Action                                 | Jalur host                                                                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `send_prompt`                          | POST runtime sesi (`personaId` override opsional), sama dengan composer web                                                                          |
| `steer` / `cancel`                     | steer queue / abort aktif sesi                                                                                                                       |
| `approve` / `reject`                   | resolve approval engine (persis tombol web)                                                                                                          |
| `list_sessions`                        | daftar sesi runtime                                                                                                                                  |
| `subscribe`/`unsubscribe` + `sinceSeq` | daftar topik bus → envelope; replay delta dari buffer seq                                                                                            |
| `ping_host`                            | balas `pong_host`                                                                                                                                    |
| `watch_screen` / `unwatch_screen`      | (v1.1) langganan screen manager viewer → pump frame `screen.frame` ~1fps (`YUI_REMOTE_SCREEN_MS`) + dedupe + cap 200KB; ack/state via `screen.state` |

Event host = proyeksi `YuiEvent` bus yang sudah ada (message.delta ←
`message.delta`, approval.request ← `approval.requested`, dst.) + `seq` counter
per sesi yang dijaga host worker.

## 6. Evolusi

- Menambah nilai enum `act`/`ev` atau field optional = **v1 compatible**
  (penerima lama mengabaikan/`error` unknown act dengan `error code:"unknown_action"`).
- Mengubah shape nilai lama / menghapus = proto v2 (lihat SPEC-PROTOCOL §12).

---

# Amandemen v1.2 — Mission Control (project-oriented remote)

> Aditif murni (aturan §6): semua `act`/`ev` baru, tak ada yang berubah dari
> v1/v1.1. Tujuan: remote mobile menjadi mission control berorientasi PROJECT
> (bukan daftar sesi datar): monitor misi, file, tim, aktivitas, terminal,
> live browser, dan settings host — semuanya lewat kanal E2E yang sama.

## A.1 Action baru

| Act | Payload inti | Balasan | Catatan |
| --- | --- | --- | --- |
| `list_projects` | — | `projects.list` | semua project + `taskStats` + delegasi berjalan + sesi ringkas |
| `project.detail` | `projectId` | `project.detail` / `error unknown_project` | |
| `project.tasks` | `projectId` | `project.tasks` | task tree (getTaskTree) |
| `project.files` | `projectId` | `project.files` | tree file workspace |
| `project.file.read` | `projectId, relPath` | `project.file` | konten dipotong 64 KB (`truncated` true bila lebih) |
| `project.team` | `projectId` | `project.team` | roster + delegation jobs |
| `project.activity` | `projectId, limit?` | `project.activity` | entri termuda dulu (dibalik host) |
| `project.sessions` | `projectId` | `project.sessions` | sesi ringkas project (judul dari pesan pertama) |
| `personas.list` | — | `personas.list` | id + display name + override model |
| `session.create` | `personaId, projectId?, message?` | `session.snapshot{rid}` | roster di-merge otomatis host bila persona belum ter-assign; `message` opsional = turn pertama |
| `settings.get` | — | `settings.state` | approvalMode + budget + provider + modelRoutes + resetPending |
| `settings.usage` | — | `settings.usage` | summary + matrix (60 baris) |
| `settings.mcp` | — | `settings.mcp` | status server MCP |
| `settings.update` | `approvalMode?, budget?` | `settings.state` | budget = UpdateBudgetRequest (partial) |
| `provider.update` | `kind?, baseUrl?, apiKey?, model?, fallbackModel?, auxModel?` | `settings.state` | swap panas; key tak pernah dikirim balik (`keyPreview` saja) |
| `model.route.update` | `personaId, model? ("" = hapus), fallback?` | `settings.state` | |
| `mcp.retry` | `name` | `settings.mcp` | |
| `mcp.trust` | `server, trusted, denyTools?` | `settings.mcp` | |
| `reset.run` | `scope "work"\|"factory", confirm "RESET"` | `reset.acked` | ack DULU, lalu host exit (engine restart; D70/D71) |
| `terminal.list` | — | `terminal.list` | sesi terminal shared host |
| `terminal.open` | `projectId?` | `terminal.state{rid}` + stream `terminal.output` | workspace = project bila ada; replay dibatasi 16 KB ekor |
| `terminal.input` | `id, data` | — | tulis PTY |
| `terminal.close` | `id` | — | LEPAS langganan remote saja; terminal tetap hidup di host (shared) |
| `list_screens` | — | `screens.list` | semua screen manager host |
| `send_prompt` (+`projectId?`) | v1 | v1 | bila sessionId tak dikenal + personaId → sesi baru menempel project |

## A.2 Event baru

`projects.list`, `project.detail`, `project.tasks`, `project.files`,
`project.file`, `project.team`, `project.activity`, `project.sessions`,
`personas.list`, `settings.state` (rid opsional), `settings.usage`,
`settings.mcp`, `reset.acked`, `terminal.list`, `terminal.state` (ber-`replay`,
rid kosong = update pasca-exit), `terminal.output`, `screens.list`.

## A.3 Implementasi

- Host: `apps/api/src/portal/service.ts` (dispatch v1.2; reply selalu ber-rid
  sama, kegagalan → `error` ber-rid). Terminal watch = satu per remote
  (buka baru melepas lama); cleanup saat remote putus/stop.
- Remote mobile: `yuika-mobile/src/relay.ts` menambah `request()` RPC ringan
  (rid → promise; timeout 12 dtk; error ber-rid = reject).
- Kontrak zod: `packages/contracts/src/remote.ts` (amandemen aditif; import
  tipe dari modul saudara langsung, bukan barrel — hindari circular).
- Tes regresi: `apps/api/src/__tests__/portal.test.ts` (22 kasus: dispatch
  v1.2 penuh + terminal mock + SpecRelay nyata).
