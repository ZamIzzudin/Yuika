// @yuika/contracts, event catalog (DEMO-WEEK-1.md §5)
// SATU-SATUNYA sumber tipe lintas core & klien. Dilarang menulis tipe tangan di apps/web.
import { z } from "zod";

/** State animasi persona, map 1:1 ke input Rive state machine (PLAN §7.6, D8). */
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

/** Streaming pikiran model (reasoning_content GLM / reasoning), ditampilkan
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
 *  UI parent streaming saat anak bekerja, bukan diam menunggu done. */
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

/** P1-DEL-3: anak di-PAUSE dari UI parent, loop anak berhenti memanggil
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

/** P0-DATA-3: approval pending saat server restart, turn-nya ikut mati,
 *  kartu approval di UI ditandai kedaluwarsa (bukan 404 diam-diam). */
export const ApprovalExpiredEvent = EventMeta.extend({
  type: z.literal("approval.expired"),
  requestId: z.string(),
  tool: z.string(),
});

/** P0-INF-4: taksonomi error lintas core, sumber kebenaran wire. `kind` =
 *  kategori penanganan (provider = selesai model/transport, tool = eksekusi
 *  tool, mcp = server eksternal, budget = iterasi habis, abort = stop user,
 *  internal = bug kita); `code` stabil untuk grep/alert. Keduanya opsional di
 *  event lama, backward compatible. */
export const ERROR_KINDS = ["provider", "tool", "mcp", "budget", "abort", "internal"] as const;

export const SessionErrorEvent = EventMeta.extend({
  type: z.literal("session.error"),
  message: z.string(),
  recoverable: z.boolean(),
  kind: z.enum(ERROR_KINDS).optional(),
  code: z.string().max(64).optional(),
});

// ── P2-FLOW: workflow.* (aditif; PLAN §13.3) ─────────────────────────────
// Emit di sesi LEAD (Conductor) run, board & replay gratis via stream sesi.
export const WorkflowStartedEvent = EventMeta.extend({
  type: z.literal("workflow.started"),
  runId: z.string(),
  projectId: z.string().nullable(),
  workflowName: z.string(),
  phaseCount: z.number().int().positive(),
});

export const PhaseEnteredEvent = EventMeta.extend({
  type: z.literal("phase.entered"),
  runId: z.string(),
  phaseId: z.string(),
  mode: z.enum(["sequential", "parallel"]),
});

export const PhaseDoneEvent = EventMeta.extend({
  type: z.literal("phase.done"),
  runId: z.string(),
  phaseId: z.string(),
});

export const StepStartedEvent = EventMeta.extend({
  type: z.literal("step.started"),
  runId: z.string(),
  phaseId: z.string(),
  stepId: z.string(),
  personaId: z.string(),
  task: z.string(),
});

export const StepDoneEvent = EventMeta.extend({
  type: z.literal("step.done"),
  runId: z.string(),
  phaseId: z.string(),
  stepId: z.string(),
  personaId: z.string(),
  ok: z.boolean(),
  summary: z.string(),
});

export const WorkflowGateAwaitEvent = EventMeta.extend({
  type: z.literal("workflow.gate.await"),
  runId: z.string(),
  phaseId: z.string(),
});

export const WorkflowGatePassedEvent = EventMeta.extend({
  type: z.literal("workflow.gate.passed"),
  runId: z.string(),
  phaseId: z.string(),
  decision: z.enum(["approved", "rejected"]),
});

export const WorkflowDoneEvent = EventMeta.extend({
  type: z.literal("workflow.done"),
  runId: z.string(),
  projectId: z.string().nullable(),
  ok: z.boolean(),
  error: z.string().optional(),
});

/** P2-FLOW-6: steering mid-run, pause/resume, suntik instruksi, reassign step. */
export const WorkflowSteerEvent = EventMeta.extend({
  type: z.literal("workflow.steer"),
  runId: z.string(),
  instruction: z.string(),
});

export const WorkflowPausedEvent = EventMeta.extend({
  type: z.literal("workflow.paused"),
  runId: z.string(),
});

export const WorkflowResumedEvent = EventMeta.extend({
  type: z.literal("workflow.resumed"),
  runId: z.string(),
});

// ── Vault (Batch 12 / D27), nilai TIDAK PERNAH ada di event; hasValue saja. ─

export const VaultRequestedEvent = EventMeta.extend({
  type: z.literal("vault.requested"),
  requestId: z.string(),
  name: z.string(),
  kind: z.enum(["api_key", "command", "login"]),
  reason: z.string(),
  /** Origin tujuan secret_http (utk label kartu), opsional. */
  originHint: z.string().optional(),
});

export const VaultResolvedEvent = EventMeta.extend({
  type: z.literal("vault.resolved"),
  requestId: z.string(),
  name: z.string(),
  status: z.enum(["filled", "skipped", "expired"]),
  hasValue: z.boolean(),
  saved: z.boolean(),
});

/** Audit pemakaian, metadata saja (nama, kanal, target), tanpa nilai. */
export const VaultUsedEvent = EventMeta.extend({
  type: z.literal("vault.used"),
  name: z.string(),
  kind: z.enum(["api_key", "command"]),
  channel: z.enum(["http", "command"]),
  target: z.string(),
});

export const StepReassignedEvent = EventMeta.extend({
  type: z.literal("workflow.step.reassigned"),
  runId: z.string(),
  phaseId: z.string(),
  stepId: z.string(),
  fromPersona: z.string(),
  toPersona: z.string(),
});

/** P1-MEM-2: learn nudge menghasilkan catatan ( transparansi, tampil sebagai chip di chat). */
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

/** P0-CORE-1: user membatalkan turn (tombol Stop), bukan error; progres tersimpan. */
export const TurnCancelledEvent = EventMeta.extend({
  type: z.literal("turn.cancelled"),
  turnId: z.string(),
});

/** P0-CORE-4: konteks sesi dikompresi, history LAMA diringkas aux model jadi
 *  checkpoint (append-only tetap dijaga: tabel messages TIDAK pernah diubah;
 *  ini murni lapisan VIEW saat menyusun prompt). tampil sebagai info di chat. */
export const ContextCompressedEvent = EventMeta.extend({
  type: z.literal("context.compressed"),
  turnId: z.string(),
  messagesSummarized: z.number().int().nonnegative(),
  estTokensBefore: z.number().int().nonnegative(),
  estTokensAfter: z.number().int().nonnegative(),
});

/** Discriminated union, setiap event punya `type` literal; UI switch-case atas ini. */
export const ScreenStateEvent = EventMeta.extend({
  type: z.literal("screen.state"),
  projectId: z.string(),
  personaId: z.string(),
  status: z.enum(["starting", "running", "stopped", "failed"]),
  url: z.string(),
  title: z.string(),
  leaseOwner: z.string().nullable(),
});

/** Batch 14a (SCR-4): persona minta user ambil alih / serahkan kontrol,
 *  kartu NON-BLOCKING (chat tetap hidup; deadline auto-expired). */
export const TakeoverRequestedEvent = EventMeta.extend({
  type: z.literal("takeover.requested"),
  requestId: z.string(),
  projectId: z.string(),
  personaId: z.string(),
  reason: z.string(),
  deadlineMs: z.number().int().nonnegative(),
});

export const TakeoverResolvedEvent = EventMeta.extend({
  type: z.literal("takeover.resolved"),
  requestId: z.string(),
  projectId: z.string(),
  personaId: z.string(),
  status: z.enum(["granted", "denied", "expired"]),
});

// ── VLT-4 (blok C): fill_login, kartu permintaan kredensial login. ──────
// INVARIAN (sama dgn vault Batch 12): nilai user/password TIDAK PERNAH ada
// di event, hanya origin + deadline. Nilai masuk lewat REST fill saja.
export const LoginRequestedEvent = EventMeta.extend({
  type: z.literal("login.requested"),
  requestId: z.string(),
  projectId: z.string(),
  personaId: z.string(),
  origin: z.string(),
  deadlineMs: z.number().int().nonnegative(),
});

export const LoginResolvedEvent = EventMeta.extend({
  type: z.literal("login.resolved"),
  requestId: z.string(),
  projectId: z.string(),
  personaId: z.string(),
  status: z.enum(["filled", "skipped", "expired", "failed"]),
  saved: z.boolean(),
});

// ── SCR-6 (Batch 14b): persona QA (Sherlock) menonton live screen persona lain
// dan mencatat hasil verifikasi, NON-BLOCKING (tak ada gate/kartu), murni
// observability: muncul di activity feed (tab Logs) sebagai sinyal kualitas.
export const QACheckEvent = EventMeta.extend({
  type: z.literal("qa.check"),
  projectId: z.string(),
  personaId: z.string(),
  /** Persona yang screen-nya diamati (opsional, QA check bisa juga utk artefak file). */
  targetPersonaId: z.string().optional(),
  item: z.string().min(1).max(120),
  status: z.enum(["pass", "fail", "warn"]),
  note: z.string().max(500).optional(),
});

// ── P2-WKS (Batch 13): workshop persisten, transisi lifecycle + audit cmd ──
export const WorkshopStateEvent = EventMeta.extend({
  type: z.literal("workshop.state"),
  projectId: z.string(),
  from: z.string(),
  to: z.string(),
  reason: z.string().max(200),
});

export const WorkshopCommandEvent = EventMeta.extend({
  type: z.literal("workshop.command"),
  projectId: z.string(),
  /** "user" | "persona:<id>", persona-first audit. */
  by: z.string().max(64),
  cmd: z.string().max(2_000),
  exitCode: z.number().int().optional(),
});

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
  WorkflowStartedEvent,
  PhaseEnteredEvent,
  PhaseDoneEvent,
  StepStartedEvent,
  StepDoneEvent,
  WorkflowGateAwaitEvent,
  WorkflowGatePassedEvent,
  WorkflowDoneEvent,
  WorkflowSteerEvent,
  WorkflowPausedEvent,
  WorkflowResumedEvent,
  StepReassignedEvent,
  VaultRequestedEvent,
  VaultResolvedEvent,
  VaultUsedEvent,
  ScreenStateEvent,
  TakeoverRequestedEvent,
  TakeoverResolvedEvent,
  LoginRequestedEvent,
  LoginResolvedEvent,
  QACheckEvent,
  WorkshopStateEvent,
  WorkshopCommandEvent,
]);
export type YuiEvent = z.infer<typeof YuiEvent>;
export type YuiEventType = YuiEvent["type"];

/** Draft event sebelum diberi meta oleh store (dipakai core saat emit).
 *  Omit harus distributif agar tiap varian union tetap punya properti khasnya
 *  (Omit<Union, K> biasa hanya menyisakan properti yang sama di semua varian). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type EventDraft = DistributiveOmit<YuiEvent, "id" | "ts" | "sessionId">;
