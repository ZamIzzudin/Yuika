// P1-PRT-2 — Kontrak payload remote (SALINAN VERBATIM dari
// docs/portal/CONTRACTS-REMOTE.md — FROZEN v1, mirror yuika-portal).
// Isi envelope E2E (SPEC-PROTOCOL §5); OPAQUE bagi relay & portal.
// Mengubah shape/enum = proto v2 (SPEC-PROTOCOL §12) — jangan edit sepihak.
//
// Amandemen aditif v1.1 (SCR-7, 2026-11): +act watch_screen/unwatch_screen,
// +ev screen.state/screen.frame, +field host.state.screens (opsional).
// Murni aditif: remote lama mem-BUANG ev tak dikenal (safeParse skip), host
// lama membalas error unknown_action — tidak ada hapus/ganti shape.
//
// Aturan (CONTRACTS §1): action ber-rid dibalas event ber-rid sama; delta
// ber-seq per sessionId (resume via subscribe{sinceSeq}); ping_host→pong_host
// tiap 20 dtk; unknown act → event error code "unknown_action".
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
  // SCR-7 (v1.1): remote menonton live screen persona di host — 1fps JPEG,
  // read-only (tanpa input/lease di v0).
  z.object({
    proto: z.literal(1),
    act: z.literal("watch_screen"),
    rid: z.string(),
    /** screen key "projectId/personaId" */
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

export const RemoteEvent = z.discriminatedUnion("ev", [
  z.object({
    proto: z.literal(1),
    ev: z.literal("host.state"),
    /** persona roster ringkas + sesi aktif — dikirim saat remote join */
    sessions: z.array(z.object({
      sessionId: z.string(),
      title: z.string(),
      personaId: z.string(),
      updatedAt: z.number().int(),
    })),
    /** SCR-7 (v1.1): live screen aktif di host (opsional — remote lama abaikan). */
    screens: z.array(z.object({
      key: z.string(),
      personaId: z.string(),
      url: z.string(),
      title: z.string(),
      status: z.enum(["starting", "running", "stopped", "failed"]),
      viewers: z.number().int(),
      watchers: z.number().int(),
    })).optional(),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("session.list"),
    rid: z.string(),
    sessions: z.array(z.object({
      sessionId: z.string(),
      title: z.string(),
      personaId: z.string(),
      updatedAt: z.number().int(),
    })),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("session.snapshot"),
    rid: z.string().optional(),
    sessionId: z.string(),
    /** transcript ringkas (≤ 50 pesan terakhir) untuk render cepat */
    messages: z.array(z.object({
      role: z.enum(["user", "assistant", "tool"]),
      personaId: z.string().optional(),
      text: z.string(),
      at: z.number().int(),
    })),
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
  z.object({
    proto: z.literal(1),
    ev: z.literal("pong_host"),
    rid: z.string(),
  }),
  // SCR-7 (v1.1): remote watch — state saat mulai/berubah; frame ~1fps.
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
    /** base64 JPEG — di-throttle 1fps + dedupe frame identik di host. */
    data: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    ts: z.number().int(),
  }),
]);
export type RemoteEvent = z.infer<typeof RemoteEvent>;
