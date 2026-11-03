// @yui/core — Learn nudge (P1-MEM-2): panggilan aux RINGAN pasca-turn — sarankan
// SATU catatan bila turn mengungkap preferensi user / pelajaran project yang
// reusable, atau "none". Hasil masuk lewat tool memory_append (dedupe, kurasi
// sama seperti agent). Non-blocking: fire-and-forget dari finalizer loop.
// Matikan dengan YUI_LEARN=0; model aux via YUI_LEARN_MODEL (default: model utama).
import type { ProviderAdapter, InternalMessage } from "../provider/adapter.js";
import type { Emit } from "../session/emit.js";
import { registry } from "../registry.js";

export interface LearnNudgeArgs {
  provider: ProviderAdapter;
  model: string;
  personaName: string;
  /** Transkrip akhir turn (sudah dipotong pemanggil). */
  transcript: InternalMessage[];
  sessionId: string;
  turnId: string;
  workspacePath: string;
  emit: Emit;
}

export interface LearnNudgeResult {
  skipped?: string; // alasan tidak jalan (disabled / parse gagal / none)
  note?: string;
  scope?: "user" | "project";
}

const SYSTEM = `Kamu adalah modul pembelajaran agent Yui. Tinjau transkrip satu turn kerja.
Tugasmu HANYA memutuskan: apakah turn ini mengungkap (a) preferensi user yang DURABEL (gaya, bahasa, batasan, kebiasaan) atau (b) keputusan/pelajaran PROJECT yang reusable (stack, struktur, keputusan arsitektur, temuan riset kunci)?
Aturan tinggi: kalau ragu → none. Jangan mencatat: tugas sesaat, konten percakapan, hal yang jelas sekali-pakai, atau hal yang sudah umum.
Balas HANYA JSON satu baris: {"note": string|null, "scope": "user"|"project"} — note maksimal 200 karakter, bahasa user.`;

/** Ekstrak teks final dari stream (abaikan reasoning_content). */
async function completeText(provider: ProviderAdapter, model: string, messages: InternalMessage[]): Promise<string> {
  let text = "";
  const done = await provider.chatStream({ model, messages, tools: [] }, (c) => {
    if (c.type === "text_delta") text += c.delta;
  });
  return done.text || text;
}

/** Parse JSON toleran (code fence / prefix teks). */
function parseVerdict(raw: string): { note: string | null; scope: "user" | "project" } | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]) as { note?: unknown; scope?: unknown };
    const note = typeof v.note === "string" ? v.note.trim().slice(0, 200) : "";
    const scope = v.scope === "project" ? "project" : "user";
    return { note: note || null, scope };
  } catch {
    return null;
  }
}

/** Serialisasi transkrip ringkas untuk aux call (hemat token). */
export function compactTranscript(messages: InternalMessage[], maxChars = 700): string {
  return messages
    .slice(-14)
    .map((m) => {
      const who = m.role === "tool" ? `tool(${m.toolCallId?.slice(0, 8) ?? "?"})` : m.role;
      const body =
        m.role === "assistant" && m.toolCalls?.length
          ? `[${m.toolCalls.map((t) => t.name).join(",")}] ${m.content ?? ""}`
          : (m.content ?? "");
      return `${who}: ${String(body).slice(0, maxChars)}`;
    })
    .join("\n");
}

/**
 * Jalankan nudge (sinkron; pemanggil membungkus fire-and-forget).
 * Sukses → dispatch tool memory_append (append terkurasi + dedupe) + emit memory.noted.
 */
export async function runLearnNudge(args: LearnNudgeArgs): Promise<LearnNudgeResult> {
  if (process.env.YUI_LEARN === "0") return { skipped: "disabled (YUI_LEARN=0)" };
  const model = process.env.YUI_LEARN_MODEL || args.model;

  let raw = "";
  try {
    raw = await completeText(args.provider, model, [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Persona: ${args.personaName}\n\nTranskrip:\n${compactTranscript(args.transcript)}` },
    ]);
  } catch (e) {
    return { skipped: `provider gagal: ${e instanceof Error ? e.message : String(e)}` };
  }
  const verdict = parseVerdict(raw);
  if (!verdict) return { skipped: "bukan JSON valid" };
  if (!verdict.note) return { skipped: "none (tidak ada yang layak dicatat)" };

  const res = await registry.dispatch(
    "memory_append",
    { scope: verdict.scope, note: verdict.note },
    {
      sessionId: args.sessionId,
      turnId: args.turnId,
      workspacePath: args.workspacePath,
      emit: args.emit,
      requestApproval: async () => true,
    },
  );
  if (res.isError) return { skipped: `memory_append gagal: ${JSON.stringify(res.result).slice(0, 120)}` };
  args.emit({ type: "memory.noted", turnId: args.turnId, scope: verdict.scope, note: verdict.note });
  return { note: verdict.note, scope: verdict.scope };
}
