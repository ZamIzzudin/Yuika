// @yuika/contracts — event catalog (DEMO-WEEK-1.md §5)
// SATU-SATUNYA sumber tipe lintas core & klien. Dilarang menulis tipe tangan di apps/web.
import { z } from "zod";

/** State animasi persona — map 1:1 ke input Rive state machine (PLAN §7.6, D8). */
export const PersonaState = z.enum([
  "idle",
  "thinking",
  "working",
  "awaiting_input",
  "done",
  "error",
  "celebrating",
]);
export type PersonaState = z.infer<typeof PersonaState>;

/** Metadata yang dilekatkan store saat append (id monotonic per sesi = kunci replay). */
export const EventMeta = z.object({
  id: z.number().int().nonnegative(),
  ts: z.number().int(),
  sessionId: z.string().min(1),
});

export const TurnStartedEvent = EventMeta.extend({
  type: z.literal("turn.started"),
  turnId: z.string(),
});

export const MessageDeltaEvent = EventMeta.extend({
  type: z.literal("message.delta"),
  turnId: z.string(),
  delta: z.string(),
});

/** Streaming pikiran model (reasoning_content GLM / reasoning) — ditampilkan
 *  kolaps-able di UI supaya menit-menit berpikir TIDAK terasa mati (fix
 *  performa dev-10: 42k token reasoning dibuang diam-diam oleh adapter). */
export const ReasoningDeltaEvent = EventMeta.extend({
  type: z.literal("reasoning.delta"),
  turnId: z.string(),
  delta: z.string(),
  personaId: z.string().optional(),
});

export const MessageDoneEvent = EventMeta.extend({
  type: z.literal("message.done"),
  turnId: z.string(),
});

export const ToolCallEvent = EventMeta.extend({
  type: z.literal("tool.call"),
  turnId: z.string(),
  callId: z.string(),
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
});

export const ToolResultEvent = EventMeta.extend({
  type: z.literal("tool.result"),
  turnId: z.string(),
  callId: z.string(),
  result: z.unknown(),
  isError: z.boolean(),
});

export const DelegationStartedEvent = EventMeta.extend({
  type: z.literal("delegation.started"),
  turnId: z.string(),
  childSessionId: z.string(),
  personaId: z.string(),
  goal: z.string(),
});

export const DelegationProgressEvent = EventMeta.extend({
  type: z.literal("delegation.progress"),
  childSessionId: z.string(),
  state: PersonaState,
});

/** Live feed delegasi (fix dev-10 "kartu delegasi statis menit-lamanya"):
 *  delta teks/pikiran/aktivitas tool anak diteruskan ke sesi parent supaya
 *  UI parent streaming saat anak bekerja — bukan diam menunggu done. */
export const DelegationDeltaEvent = EventMeta.extend({
  type: z.literal("delegation.delta"),
  childSessionId: z.string(),
  personaId: z.string(),
  kind: z.enum(["text", "reasoning", "tool"]),
  delta: z.string(),
});

export const DelegationDoneEvent = EventMeta.extend({
  type: z.literal("delegation.done"),
  turnId: z.string(),
  childSessionId: z.string(),
  summary: z.string(),
});

/** P0-DEL-2: arahan mid-flight user → anak (kartu delegasi di UI parent). */
export const DelegationSteeredEvent = EventMeta.extend({
  type: z.literal("delegation.steered"),
  turnId: z.string(),
  childSessionId: z.string(),
  text: z.string(),
});

/** P1-DEL-3: anak di-PAUSE dari UI parent — loop anak berhenti memanggil
 *  provider di batas iterasi (progres tersimpan); parent turn ikut menunggu.
 *  Resume = delegation.resumed; cancel saat pause tetap jalan (graceful). */
export const DelegationPausedEvent = EventMeta.extend({
  type: z.literal("delegation.paused"),
  turnId: z.string(),
  childSessionId: z.string(),
});

export const DelegationResumedEvent = EventMeta.extend({
  type: z.literal("delegation.resumed"),
  turnId: z.string(),
  childSessionId: z.string(),
});

export const PersonaStateEvent = EventMeta.extend({
  type: z.literal("persona.state"),
  personaId: z.string(),
  state: PersonaState,
});

export const ApprovalRequestedEvent = EventMeta.extend({
  type: z.literal("approval.requested"),
  requestId: z.string(),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  reason: z.string(),
});

export const ApprovalResolvedEvent = EventMeta.extend({
  type: z.literal("approval.resolved"),
  requestId: z.string(),
  approved: z.boolean(),
  tool: z.string().optional(),
});

/** P0-DATA-3: approval pending saat server restart — turn-nya ikut mati,
 *  kartu approval di UI ditandai kedaluwarsa (bukan 404 diam-diam). */
export const ApprovalExpiredEvent = EventMeta.extend({
  type: z.literal("approval.expired"),
  requestId: z.string(),
  tool: z.string(),
});

/** P0-INF-4: taksonomi error lintas core — sumber kebenaran wire. `kind` =
 *  kategori penanganan (provider = selesai model/transport, tool = eksekusi
 *  tool, mcp = server eksternal, budget = iterasi habis, abort = stop user,
 *  internal = bug kita); `code` stabil untuk grep/alert. Keduanya opsional di
 *  event lama — backward compatible. */
export const ERROR_KINDS = ["provider", "tool", "mcp", "budget", "abort", "internal"] as const;

export const SessionErrorEvent = EventMeta.extend({
  type: z.literal("session.error"),
  message: z.string(),
  recoverable: z.boolean(),
  kind: z.enum(ERROR_KINDS).optional(),
  code: z.string().max(64).optional(),
});

/** P1-MEM-2: learn nudge menghasilkan catatan ( transparansi — tampil sebagai chip di chat). */
export const MemoryNotedEvent = EventMeta.extend({
  type: z.literal("memory.noted"),
  turnId: z.string(),
  scope: z.enum(["user", "project"]),
  note: z.string().min(1),
});

/** P1-MEM-3: agent mengusulkan skill dari pengalaman → draf menunggu validasi user. */
export const SkillProposedEvent = EventMeta.extend({
  type: z.literal("skill.proposed"),
  turnId: z.string(),
  name: z.string().min(1),
  description: z.string(),
});

/** P0-CORE-1: user membatalkan turn (tombol Stop) — bukan error; progres tersimpan. */
export const TurnCancelledEvent = EventMeta.extend({
  type: z.literal("turn.cancelled"),
  turnId: z.string(),
});

/** P0-CORE-4: konteks sesi dikompresi — history LAMA diringkas aux model jadi
 *  checkpoint (append-only tetap dijaga: tabel messages TIDAK pernah diubah;
 *  ini murni lapisan VIEW saat menyusun prompt). tampil sebagai info di chat. */
export const ContextCompressedEvent = EventMeta.extend({
  type: z.literal("context.compressed"),
  turnId: z.string(),
  messagesSummarized: z.number().int().nonnegative(),
  estTokensBefore: z.number().int().nonnegative(),
  estTokensAfter: z.number().int().nonnegative(),
});

/** Discriminated union — setiap event punya `type` literal; UI switch-case atas ini. */
export const YuiEvent = z.discriminatedUnion("type", [
  TurnStartedEvent,
  MessageDeltaEvent,
  ReasoningDeltaEvent,
  MessageDoneEvent,
  ToolCallEvent,
  ToolResultEvent,
  DelegationStartedEvent,
  DelegationProgressEvent,
  DelegationDeltaEvent,
  DelegationDoneEvent,
  DelegationSteeredEvent,
  DelegationPausedEvent,
  DelegationResumedEvent,
  PersonaStateEvent,
  ApprovalRequestedEvent,
  MemoryNotedEvent,
  ContextCompressedEvent,
  SkillProposedEvent,
  TurnCancelledEvent,
  ApprovalResolvedEvent,
  ApprovalExpiredEvent,
  SessionErrorEvent,
]);
export type YuiEvent = z.infer<typeof YuiEvent>;
export type YuiEventType = YuiEvent["type"];

/** Draft event sebelum diberi meta oleh store (dipakai core saat emit).
 *  Omit harus distributif agar tiap varian union tetap punya properti khasnya
 *  (Omit<Union, K> biasa hanya menyisakan properti yang sama di semua varian). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type EventDraft = DistributiveOmit<YuiEvent, "id" | "ts" | "sessionId">;
