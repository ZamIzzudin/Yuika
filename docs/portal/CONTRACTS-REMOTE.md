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
