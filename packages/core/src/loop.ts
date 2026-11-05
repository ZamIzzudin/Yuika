// @yui/core — agent turn loop (pola fase Hermes §4.1, versi demo linear):
// assembly → api_call → tool_round → (iterate) → finalizer.
// TODO(P0) lihat TASKS.md: interrupt/AbortSignal end-to-end (P0-CORE-1),
// compression v0 (P0-CORE-4), celebrating detection. Fallback model // repetition guard, iteration budget proper, compression, celebrating detection. guard repetisi: DONE dev 9.
import { randomUUID } from "node:crypto";
import type { ProviderAdapter, InternalMessage, ToolCallRequest } from "./provider/adapter.js";
import { registry } from "./registry.js";
import { runLearnNudge } from "./memory/nudge.js";
import { personaDisplayName } from "./personas/names.js";
import type { ISessionStore } from "./session/store.js";
import { buildContextMessages } from "./session/compress.js";
import { env } from "./env.js";
import { getLogger } from "./logger.js";
import { classifyError, ErrorCodes, YuiError } from "./errors.js";
import type { Emit } from "./session/emit.js";
import type { ApprovalEngine } from "./approval/engine.js";
import type { UsageEvent } from "@yui/contracts";

// Budget iterasi per turn: env override untuk use case panjang (multi-delegasi).
import { getApprovalMode } from "./approval/engine.js";

const MAX_ITERATIONS = env.maxIter;

/** Tracing durasi (default aktif; matikan dengan YUI_TRACE=0). P0-INF-3:
 *  kini lewat pino — baris trace = logger.debug bermakna (JSON, machine-parseable). */
function trace(msg: string): void {
  if (env.trace) getLogger().child({ mod: "loop.trace" }).debug(msg);
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
  store: ISessionStore;
  provider: ProviderAdapter;
  /** Model default sesi (env/Settings). Bisa dioverride per persona via `routeModel`. */
  model: string;
  /** P1-MDL-1: resolusi model PER PERSONA (override Settings → persona.yaml → default).
   *  Mengembalikan juga fallback model — P0-CORE-2: provider mati → fallback otomatis. */
  routeModel?: (personaId: string) => { model: string; fallback?: string; markUnhealthy?: (model: string) => void };
  workspacePath: string;
  approvals: ApprovalEngine;
  emit: Emit;
  /** P1-PRJ-5 (D17): allowlist tool MCP untuk sesi ini (prefix `mcp__<srv>__*` / nama persis).
   *  null/undefined = sesi tanpa binding → SEMUA tool MCP disembunyikan (fail-closed). */
  mcpAllowlistFor?: (session: { id: string; personaId: string; projectId: string | null }) => string[] | null;
  /** P1-CRED-1: catat pemakaian per panggilan model sukses (token dari provider,
   *  tanpa estimasi). Diisi runtime → ledger SQLite. */
  recordUsage?: (u: UsageEvent) => void;
  /** P0-CORE-4: model aux murah untuk kompresi konteks (getter — swap panas via
   *  Settings). Kosong/null → fallback ke model utama sesi. */
  auxModel?: () => string;
  /** P0-DEL-2: antrean steering — arahan user mid-turn di-drain (dipop) di awal
   *  tiap iterasi loop, di-inject sebagai pesan user berlabel. Dipakai runner
   *  delegasi untuk arahkan anak tanpa membatalkannya. */
  steerFor?: (sessionId: string) => string[];
  /** P1-DEL-3: gate pause per sesi (delegasi) — dipanggil di awal TIAP iterasi.
   *  Resolve `true` = lanjut (tidak sedang pause); `false` = dibatalkan saat
   *  ter-pause → loop keluar graceful (progress & parsial tersimpan). */
  pauseGateFor?: (sessionId: string) => Promise<boolean>;
}

export class AgentLoop {
  constructor(private deps: LoopDeps) {}

  async runTurn(sessionId: string, userText: string, opts?: { signal?: AbortSignal }): Promise<void> {
    const t0 = Date.now();
    const signal = opts?.signal;
    const { store, provider, emit } = this.deps;
    const session = store.getSession(sessionId);
    if (!session) throw new Error(`session ${sessionId} tidak ditemukan`);
    // P1-MDL-1: model sesi ini = route persona (override/persona.yaml) atau default.
    const route = this.deps.routeModel?.(session.personaId) ?? { model: this.deps.model };
    let model = route.model;

    const turnId = `t_${randomUUID()}`;
    // P0-INF-3: child logger per turn — traceId (=turnId) otomatis menempel di
    // SEMUA log turn ini; satu id = satu alur penuh di stdout.
    const log = getLogger().child({ mod: "loop", sessionId, turnId, persona: session.personaId });

    // 1) append user message (append-only) + announce
    store.appendMessage(sessionId, { role: "user", content: userText });
    emit({ type: "turn.started", turnId });
    log.info({ model, projectId: session.projectId }, "turn started");
    emit({ type: "persona.state", personaId: session.personaId, state: "thinking" });

    // 2) assembly: system prompt FROZEN (dari sesi) + history — via view kompresi
    // (P0-CORE-4): bila estimasi token > ambang, history lama diringkas aux model
    // jadi CHECKPOINT (tabel messages tetap append-only; ini murni lapisan view).
    const tAsm = Date.now();
    const ctx = await buildContextMessages(
      store,
      provider,
      this.deps.auxModel?.() || model, // P0-CORE-4: ringkasan pakai model aux MURAH bila dikonfigurasi
      sessionId,
      {
        contextTokens: env.contextTokens,
        threshold: env.compressThresholdPct / 1000,
        keepRecent: env.compressKeepRecent,
        minMessages: env.compressMinMessages,
      },
      // P1-INF-3: aux kompresi ter-meter (hanya dari usage provider).
      (u) =>
        this.deps.recordUsage?.({
          sessionId,
          projectId: session.projectId,
          personaId: session.personaId,
          model,
          promptTokens: u.inputTokens,
          outputTokens: u.outputTokens,
          latencyMs: u.latencyMs,
          at: Date.now(),
        }),
    );
    if (ctx.compressed) {
      emit({
        type: "context.compressed",
        turnId,
        messagesSummarized: ctx.messagesSummarized,
        estTokensBefore: ctx.estTokensBefore,
        estTokensAfter: ctx.estTokensAfter,
      });
      trace(
        `turn=${turnId.slice(0, 10)} KOMPRESI KONTEKS: ${ctx.messagesSummarized} pesan → checkpoint (~${ctx.estTokensBefore} → ~${ctx.estTokensAfter} token) dalam ${Date.now() - tAsm}ms`,
      );
    }
    const messages: InternalMessage[] = [
      { role: "system", content: session.systemPrompt },
      ...ctx.messages,
    ];
    // P1-PRJ-5 (D17): tool MCP hanya muncul bila persona DI-BIND di roster project.
    const tools = applyMcpBinding(registry.toolSchemas(session.toolsets), this.deps.mcpAllowlistFor?.(session) ?? null);

    let usedDelegation = false;
    let usedTools = false; // P1-MEM-2: turn yang melibatkan tool = kandidat nudge belajar
    // P0-CORE-1: teks parsial yang sudah mengalir ke UI — dipakai saat cancel
    // supaya history tetap koheren (pesan assistant tidak menggantung).
    let streamedText = "";
    const cancelledExit = (): void => {
      const note = "_(turn dibatalkan user)_";
      const content = streamedText.trim() ? `${streamedText.trim()}\n\n${note}` : note;
      store.appendMessage(sessionId, { role: "assistant", content });
      emit({ type: "message.delta", turnId, delta: streamedText.trim() ? `\n\n${note}` : note });
      emit({ type: "message.done", turnId });
      emit({ type: "turn.cancelled", turnId });
      emit({ type: "persona.state", personaId: session.personaId, state: "idle" });
      log.info({ ms: Date.now() - t0 }, "turn cancelled (user) — partial saved");
      trace(`turn=${turnId.slice(0, 10)} DIBATALKAN user total=${Date.now() - t0}ms iter parsial tersimpan`);
      return;
    };
    // Repetition guard: tool round identik 3× berturut → injek nudge agar agent
    // keluar dari loop verifikasi tanpa progres (diamati di test: todo_list/read_file berulang).
    let lastRoundSig = "";
    let repeatRounds = 0;

    // Fix 2026-11 (user): mode auto ("Hardcore") = user tidak ingin diinterupsi —
    // iterasi lanjut sampai jawaban final, cap pengaman jauh lebih tinggi (64).
    const iterCap = getApprovalMode() === "auto" ? env.maxIterHardcore : MAX_ITERATIONS;
    for (let i = 0; i < iterCap; i++) {
      if (signal?.aborted) return cancelledExit(); // P0-CORE-1: Stop ditekan sebelum iterasi dimulai
      // P0-DEL-2: steering — arahan user mid-turn di-drain tiap awal iterasi.
      // Pesan user berlabel (bukan system — kompatibel semua provider OpenAI-compat)
      // agar model memperlakukannya sebagai prioritas tertinggi berikutnya.
      const steers = this.deps.steerFor?.(sessionId) ?? [];
      for (const st of steers) {
        const steerMsg: InternalMessage = { role: "user", content: `[arahan user — mid-turn] ${st}` };
        messages.push(steerMsg);
        store.appendMessage(sessionId, steerMsg);
        trace(`  steer: ${st.slice(0, 80)}`);
      }
      // P1-DEL-3: pause (delegasi) — anak menunggu di sini TANPA memanggil
      // provider; resume/abort membangunkan gate. Abort saat pause → graceful.
      if (this.deps.pauseGateFor && !(await this.deps.pauseGateFor(sessionId))) {
        return cancelledExit();
      }
      // 3) api phase — rantai attempt: primary → fallback (P0-CORE-2). Provider
      // sudah retry transien ×2 di dalam (maxRetries); sampai sini = model itu
      // benar-benar gagal → tandai unhealthy (cooldown) & coba fallback SEKALI.
      let done: Awaited<ReturnType<ProviderAdapter["chatStream"]>> | undefined;
      const tProvider = Date.now();
      const attempts = [model, route.fallback].filter((m, i, a): m is string => !!m && a.indexOf(m) === i);
      let lastErr: unknown;
      for (let ai = 0; ai < attempts.length; ai++) {
        try {
          const attemptModel = attempts[ai]!;
          done = await provider.chatStream({ model: attemptModel, messages, tools, signal }, (chunk) => {
            if (chunk.type === "text_delta") {
              streamedText += chunk.delta; // P0-CORE-1: simpan parsial untuk jalur cancel
              emit({ type: "message.delta", turnId, delta: chunk.delta });
            }
            if (chunk.type === "reasoning_delta") {
              // Pikiran model streaming ke UI (kolaps-able) — fix dev-10: panggilan
              // menit-lamanya kini hidup, bukan diam. Tidak masuk history (bukan
              // konteks — hemat token & jaga invariant view-only).
              emit({ type: "reasoning.delta", turnId, delta: chunk.delta, personaId: session.personaId });
            }
          });
          // P1-CRED-1: metering — HANYA dari usage provider (tanpa estimasi).
          if (done.usage) {
            this.deps.recordUsage?.({
              sessionId,
              projectId: session.projectId,
              personaId: session.personaId,
              model: attemptModel,
              promptTokens: done.usage.inputTokens ?? 0,
              outputTokens: done.usage.outputTokens ?? 0,
              latencyMs: Date.now() - tProvider,
              at: Date.now(),
            });
          }
          if (ai > 0) {
            trace(`turn=${turnId.slice(0, 10)} FALLBACK AKTIF: ${attempts[0]} → ${attemptModel} (cooldown 5 mnt)`);
            model = attemptModel; // iterasi berikutnya tetap di fallback (jangan bolak-balik)
          }
          lastErr = undefined;
          break;
        } catch (err) {
          // P0-CORE-1: abort oleh user BUKAN error provider — keluar graceful.
          if (signal?.aborted) return cancelledExit();
          const ye = classifyError(err, "provider"); // P0-INF-4: kind/code/retryable
          lastErr = ye;
          if (ai < attempts.length - 1) {
            route.markUnhealthy?.(attempts[ai]!);
            log.warn(
              { model: attempts[ai], kind: ye.kind, code: ye.code },
              `provider gagal (${ye.message}) → fallback ${attempts[ai + 1]}`,
            );
          }
        }
      }
      if (lastErr || !done) {
        // P0-INF-4: error diklasifikasi (provider/abort/…) → event + log satu bahasa.
        const ye =
          lastErr !== undefined
            ? classifyError(lastErr, "provider")
            : new YuiError("provider", ErrorCodes.PROVIDER_NO_RESPONSE, "provider tanpa respons");
        log.error({ kind: ye.kind, code: ye.code, retryable: ye.retryable }, `turn gagal: ${ye.message}`);
        emit({
          type: "session.error",
          message: ye.message,
          recoverable: false,
          kind: ye.kind,
          code: ye.code,
        });
        emit({ type: "persona.state", personaId: session.personaId, state: "error" });
        return;
      }
      trace(`turn=${turnId.slice(0, 10)} sesi=${sessionId.slice(0, 10)} persona=${session.personaId} iter=${i} provider=${Date.now() - tProvider}ms (msgs=${messages.length}, tools=${tools.length}, finish=${done.finishReason})`);

      // 4) tool round
      if (done.finishReason === "tool_calls" && done.toolCalls.length) {
        usedTools = true;
        const assistantMsg: InternalMessage = {
          role: "assistant",
          content: done.text,
          toolCalls: done.toolCalls,
        };
        messages.push(assistantMsg);
        store.appendMessage(sessionId, assistantMsg);

        // Fix 2026-11 (user): tool calls dalam SATU round dieksekusi PARALEL.
        // Provider mengirim beberapa tool_calls sekaligus (mis. Maestro mendelegasikan
        // 3 riset "paralel") — dulu di-await satu-per-satu sehingga anak ke-2 baru
        // jalan setelah anak ke-1 selesai (sequential). Hasil tetap di-append
        // BERURUTAN sesuai urutan call (kontrak protocol tool_result).
        for (const call of done.toolCalls as ToolCallRequest[]) {
          emit({ type: "tool.call", turnId, callId: call.id, name: call.name, args: call.args });
        }
        emit({ type: "persona.state", personaId: session.personaId, state: "working" });
        if (done.toolCalls.some((c) => c.name === "delegate_task")) usedDelegation = true;

        const roundResults = await Promise.all(
          (done.toolCalls as ToolCallRequest[]).map((call) => {
            const tTool = Date.now();
            let tApproval = 0;
            return registry
              .dispatch(call.name, call.args, {
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
              })
              .then((res) => {
                trace(`  tool ${call.name}: total=${Date.now() - tTool}ms${tApproval ? ` (menunggu user ${Date.now() - tApproval}ms)` : ""}`);
                return { call, res };
              });
          }),
        );
        for (const { call, res } of roundResults) {
          if (res.isError) {
            // P0-INF-4: kegagalan tool ter-log terstruktur (event tool.result sudah jujur isError).
            log.warn({ tool: call.name, kind: "tool", code: ErrorCodes.TOOL_EXEC }, `tool ${call.name} returned error`);
          }
          emit({ type: "tool.result", turnId, callId: call.id, result: res.result, isError: !!res.isError });
          const toolMsg: InternalMessage = {
            role: "tool",
            toolCallId: call.id,
            content: JSON.stringify(res.result).slice(0, 20_000),
          };
          messages.push(toolMsg);
          store.appendMessage(sessionId, toolMsg);
        }
        if (signal?.aborted) return cancelledExit(); // P0-CORE-1: Stop antar tool round
        emit({ type: "persona.state", personaId: session.personaId, state: "thinking" });
        const sig = JSON.stringify(done.toolCalls.map((c) => [c.name, c.args]));
        if (sig === lastRoundSig) repeatRounds++;
        else {
          lastRoundSig = sig;
          repeatRounds = 0;
        }
        if (repeatRounds >= 2) {
          const nudge =
            "[sistem] Kamu memanggil tool yang sama berulang kali dengan argumen identik. Evaluasi hasil sebelumnya — lanjut dengan langkah BERBEDA atau berikan jawaban final sekarang.";
          messages.push({ role: "user", content: nudge });
          store.appendMessage(sessionId, { role: "user", content: nudge });
          repeatRounds = 0;
        }
        continue;
      }

      // 5) finalizer
      store.appendMessage(sessionId, { role: "assistant", content: done.text });
      emit({ type: "message.done", turnId });
      log.info({ ms: Date.now() - t0, iters: i + 1, model, usedTools, usedDelegation }, "turn finished");
      trace(`turn=${turnId.slice(0, 10)} SELESAI total=${Date.now() - t0}ms iter=${i + 1}`);
      // celebrating bila turn ini melibatkan delegation (P1: juga saat skill baru dibuat)
      emit({
        type: "persona.state",
        personaId: session.personaId,
        state: usedDelegation ? "celebrating" : "done",
      });
      // P1-MEM-2: learn nudge — aux call ringan pasca-turn yang MELIBATKAN TOOL.
      // Fire-and-forget: tidak memblokir UI; hasil lewat event memory.noted + trace.
      if (usedTools) {
        const tLearn = Date.now();
        const personaName = personaDisplayName(session.personaId);
        void runLearnNudge({
          provider: this.deps.provider,
          model,
          personaId: session.personaId,
          personaName,
          transcript: messages,
          sessionId,
          turnId,
          workspacePath: this.deps.workspacePath,
          emit,
          recordUsage: this.deps.recordUsage, // P1-INF-3: aux ter-meter
        })
          .then((r) =>
            trace(
              `nudge turn=${turnId.slice(0, 10)} ${Date.now() - tLearn}ms → ${
                r.note ? `tercatat (${r.scope}): ${r.note.slice(0, 80)}` : `skip: ${r.skipped}`
              }`,
            ),
          )
          .catch((e) => trace(`nudge turn=${turnId.slice(0, 10)} GAGAL ${e instanceof Error ? e.message : e}`));
      }
      return;
    }

    // Budget habis → akhiri GRACEFUL (dulu: error mentah; agent GLM kadang butuh
    // iterasi tambahan pasca-coding untuk verifikasi artefak). Progres & file
    // tersimpan; user tinggal bilang "lanjutkan" untuk resume turn.
    const budgetMsg =
      "Iterasi untuk turn ini mencapai batas atas sebelum jawaban final. Semua progres & file sudah tersimpan — ketik **lanjutkan** dan aku lanjut dari titik ini.";
    messages.push({ role: "assistant", content: budgetMsg });
    store.appendMessage(sessionId, { role: "assistant", content: budgetMsg });
    emit({ type: "message.delta", turnId, delta: budgetMsg });
    emit({ type: "message.done", turnId });
    emit({ type: "session.error", message: "iteration budget reached — progress saved, ask the agent to continue", recoverable: true, kind: "budget", code: ErrorCodes.ITERATION_BUDGET_EXCEEDED });
    emit({ type: "persona.state", personaId: session.personaId, state: "done" });
    log.warn({ ms: Date.now() - t0, iters: iterCap, kind: "budget" }, "iteration budget exhausted — graceful exit");
    trace(`turn=${turnId.slice(0, 10)} BUDGET-HABIS (graceful) total=${Date.now() - t0}ms`);
  }
}
