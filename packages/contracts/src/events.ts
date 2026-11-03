// @yui/contracts — event catalog (DEMO-WEEK-1.md §5)
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

export const MessageDoneEvent = EventMeta.extend({
  type: z.literal("message.done"),
  turnId: z.string(),
});

export const ToolCallEvent = EventMeta.extend({
  type: z.literal("tool.call"),
  turnId: z.string(),
  callId: z.string(),
  name: z.string(),
  args: z.record(z.unknown()),
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

export const DelegationDoneEvent = EventMeta.extend({
  type: z.literal("delegation.done"),
  turnId: z.string(),
  childSessionId: z.string(),
  summary: z.string(),
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
  args: z.record(z.unknown()),
  reason: z.string(),
});

export const ApprovalResolvedEvent = EventMeta.extend({
  type: z.literal("approval.resolved"),
  requestId: z.string(),
  approved: z.boolean(),
  tool: z.string().optional(),
});

export const SessionErrorEvent = EventMeta.extend({
  type: z.literal("session.error"),
  message: z.string(),
  recoverable: z.boolean(),
});

/** P1-MEM-2: learn nudge menghasilkan catatan ( transparansi — tampil sebagai chip di chat). */
export const MemoryNotedEvent = EventMeta.extend({
  type: z.literal("memory.noted"),
  turnId: z.string(),
  scope: z.enum(["user", "project"]),
  note: z.string().min(1),
});

/** Discriminated union — setiap event punya `type` literal; UI switch-case atas ini. */
export const YuiEvent = z.discriminatedUnion("type", [
  TurnStartedEvent,
  MessageDeltaEvent,
  MessageDoneEvent,
  ToolCallEvent,
  ToolResultEvent,
  DelegationStartedEvent,
  DelegationProgressEvent,
  DelegationDoneEvent,
  PersonaStateEvent,
  ApprovalRequestedEvent,
  MemoryNotedEvent,
  ApprovalResolvedEvent,
  SessionErrorEvent,
]);
export type YuiEvent = z.infer<typeof YuiEvent>;
export type YuiEventType = YuiEvent["type"];

/** Draft event sebelum diberi meta oleh store (dipakai core saat emit).
 *  Omit harus distributif agar tiap varian union tetap punya properti khasnya
 *  (Omit<Union, K> biasa hanya menyisakan properti yang sama di semua varian). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type EventDraft = DistributiveOmit<YuiEvent, "id" | "ts" | "sessionId">;
