// observability, kontrak trace view per turn (UI "apa yang terjadi
// di balik layar"): langkah event (tool call/result, delegasi, approval) +
// panggilan model (dari ledger: latensi/token/biaya via price book opsional).
import { z } from "zod";

/** Satu langkah dalam turn, event mentah dipetakan jadi baris manusiawi. */
export const TraceStep = z.object({
  at: z.number().int(),
  /** Jenis langkah untuk ikon/warna UI. */
  kind: z.enum(["model", "tool", "delegate", "approval", "error", "message", "skill", "memory", "other"]),
  label: z.string(),
  /** ms, durasi bila terukur (tool call→result, model call latency). */
  durationMs: z.number().int().nullable(),
  isError: z.boolean().default(false),
});
export type TraceStep = z.infer<typeof TraceStep>;

export const TraceTurn = z.object({
  turnId: z.string(),
  startedAt: z.number().int(),
  endedAt: z.number().int().nullable(),
  /** null = turn masih berjalan saat trace dibuat. */
  status: z.enum(["done", "running", "cancelled", "error"]).default("done"),
  steps: z.array(TraceStep),
  /** Rollup panggilan model turn ini (dari ledger, jujur, tanpa estimasi). */
  tokens: z.object({ input: z.number().int(), output: z.number().int(), calls: z.number().int() }),
});
export type TraceTurn = z.infer<typeof TraceTurn>;

export const SessionTrace = z.object({
  sessionId: z.string(),
  turns: z.array(TraceTurn),
});
export type SessionTrace = z.infer<typeof SessionTrace>;
