// @yui/core — agent turn loop (pola fase Hermes §4.1, versi demo linear):
// assembly → api_call → tool_round → (iterate) → finalizer.
// TODO(P0) lihat TASKS.md: interrupt/AbortSignal end-to-end, retry+fallback model,
// repetition guard, iteration budget proper, compression, celebrating detection.
import { randomUUID } from "node:crypto";
import type { ProviderAdapter, InternalMessage, ToolCallRequest } from "./provider/adapter.js";
import { registry } from "./registry.js";
import type { SessionStore } from "./session/store.js";
import type { Emit } from "./session/emit.js";
import type { ApprovalEngine } from "./approval/engine.js";

const MAX_ITERATIONS = 12;

/** Tracing durasi (default aktif; matikan dengan YUI_TRACE=0) — jawaban untuk
 *  "kenapa lambat": pisahkan waktu provider vs tool vs menunggu approval. */
const TRACE = process.env.YUI_TRACE !== "0";
function trace(msg: string): void {
  if (TRACE) console.log(`[yui:trace] ${msg}`);
}

/** P1-PRJ-5 (D17): terapkan binding MCP pada daftar tool sesi — tool `mcp__*`
 *  hanya lolos bila ada di allowlist (prefix `...__*` atau nama persis). null = blokir semua. */
export function applyMcpBinding<T extends { name: string }>(
  schemas: T[],
  allowlist: string[] | null,
): T[] {
  return schemas.filter(
    (t) =>
      !t.name.startsWith("mcp__") ||
      allowlist?.some((a) => (a.endsWith("*") ? t.name.startsWith(a.slice(0, -1)) : a === t.name)),
  );
}

export interface LoopDeps {
  store: SessionStore;
  provider: ProviderAdapter;
  model: string;
  workspacePath: string;
  approvals: ApprovalEngine;
  emit: Emit;
  /** P1-PRJ-5 (D17): allowlist tool MCP untuk sesi ini (prefix `mcp__<srv>__*` / nama persis).
   *  null/undefined = sesi tanpa binding → SEMUA tool MCP disembunyikan (fail-closed). */
  mcpAllowlistFor?: (session: { id: string; personaId: string; projectId: string | null }) => string[] | null;
}

export class AgentLoop {
  constructor(private deps: LoopDeps) {}

  async runTurn(sessionId: string, userText: string): Promise<void> {
    const t0 = Date.now();
    const { store, provider, model, emit } = this.deps;
    const session = store.getSession(sessionId);
    if (!session) throw new Error(`session ${sessionId} tidak ditemukan`);

    const turnId = `t_${randomUUID()}`;

    // 1) append user message (append-only) + announce
    store.appendMessage(sessionId, { role: "user", content: userText });
    emit({ type: "turn.started", turnId });
    emit({ type: "persona.state", personaId: session.personaId, state: "thinking" });

    // 2) assembly: system prompt FROZEN (dari sesi) + history
    const messages: InternalMessage[] = [
      { role: "system", content: session.systemPrompt },
      ...store.getMessages(sessionId),
    ];
    // P1-PRJ-5 (D17): tool MCP hanya muncul bila persona DI-BIND di roster project.
    const tools = applyMcpBinding(registry.toolSchemas(session.toolsets), this.deps.mcpAllowlistFor?.(session) ?? null);

    let usedDelegation = false;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // 3) api phase
      let done;
      const tProvider = Date.now();
      try {
        done = await provider.chatStream({ model, messages, tools }, (chunk) => {
          if (chunk.type === "text_delta") emit({ type: "message.delta", turnId, delta: chunk.delta });
        });
      } catch (err) {
        // TODO(P0): retry + fallback model (YUI_MODEL_FALLBACK)
        emit({
          type: "session.error",
          message: err instanceof Error ? err.message : String(err),
          recoverable: false,
        });
        emit({ type: "persona.state", personaId: session.personaId, state: "error" });
        return;
      }
      trace(`turn=${turnId.slice(0, 10)} sesi=${sessionId.slice(0, 10)} persona=${session.personaId} iter=${i} provider=${Date.now() - tProvider}ms (msgs=${messages.length}, tools=${tools.length}, finish=${done.finishReason})`);

      // 4) tool round
      if (done.finishReason === "tool_calls" && done.toolCalls.length) {
        const assistantMsg: InternalMessage = {
          role: "assistant",
          content: done.text,
          toolCalls: done.toolCalls,
        };
        messages.push(assistantMsg);
        store.appendMessage(sessionId, assistantMsg);

        for (const call of done.toolCalls as ToolCallRequest[]) {
          emit({ type: "tool.call", turnId, callId: call.id, name: call.name, args: call.args });
          emit({ type: "persona.state", personaId: session.personaId, state: "working" });
          if (call.name === "delegate_task") usedDelegation = true;

          const tTool = Date.now();
          let tApproval = 0;
          const res = await registry.dispatch(call.name, call.args, {
            sessionId,
            turnId,
            workspacePath: this.deps.workspacePath,
            emit,
            requestApproval: (tool, args, reason) => {
              emit({ type: "persona.state", personaId: session.personaId, state: "awaiting_input" });
              tApproval = Date.now();
              return this.deps.approvals.request(tool, args, reason).then((v) => {
                trace(`  approval ${tool}: ${Date.now() - tApproval}ms → ${v ? "disetujui" : "ditolak"}`);
                return v;
              });
            },
          });
          trace(`  tool ${call.name}: total=${Date.now() - tTool}ms${tApproval ? ` (menunggu user ${Date.now() - tApproval}ms)` : ""}`);

          emit({ type: "tool.result", turnId, callId: call.id, result: res.result, isError: !!res.isError });
          const toolMsg: InternalMessage = {
            role: "tool",
            toolCallId: call.id,
            content: JSON.stringify(res.result).slice(0, 20_000),
          };
          messages.push(toolMsg);
          store.appendMessage(sessionId, toolMsg);
        }
        emit({ type: "persona.state", personaId: session.personaId, state: "thinking" });
        continue;
      }

      // 5) finalizer
      store.appendMessage(sessionId, { role: "assistant", content: done.text });
      emit({ type: "message.done", turnId });
      trace(`turn=${turnId.slice(0, 10)} SELESAI total=${Date.now() - t0}ms iter=${i + 1}`);
      // celebrating bila turn ini melibatkan delegation (P1: juga saat skill baru dibuat)
      emit({
        type: "persona.state",
        personaId: session.personaId,
        state: usedDelegation ? "celebrating" : "done",
      });
      return;
    }

    emit({ type: "session.error", message: "iteration budget habis", recoverable: true });
    emit({ type: "persona.state", personaId: session.personaId, state: "error" });
    trace(`turn=${turnId.slice(0, 10)} GAGAL budget habis total=${Date.now() - t0}ms`);
  }
}
