// @yuika/core — delegation-lite (DEMO): child = turn loop in-process dengan persona anak.
// DEMO-SHORTCUT: tanpa job queue persist, tanpa steering — dibayar di P0/P1 (TASKS.md).
// Parent hanya menerima ringkasan, bukan tool calls anak (context economy — Hermes §4.6).
import { randomUUID } from "node:crypto";
import type { PersonaState } from "@yuika/contracts";
import type { ISessionStore } from "../session/store.js";
import type { Emit } from "../session/emit.js";
import type { EventBus } from "../bus.js";
import type { ProviderAdapter } from "../provider/adapter.js";
import { AgentLoop, type LoopDeps } from "../loop.js";
import { moduleLogger } from "../logger.js";
import { makeApprovalEngineForSession, createSessionWithPrompt } from "../runtime-helpers.js";
import { memoryPromptSection } from "../memory/manager.js";
import type { SkillBinding } from "../skills/bindings.js";
import { listPersonas } from "../personas/loader.js";

export interface DelegationDeps {
  store: ISessionStore;
  bus: typeof EventBus;
  provider: ProviderAdapter;
  model: string;
  /** P1-MDL-1: teruskan ke loop anak — tiap anak resolve model persona-nya sendiri. */
  routeModel?: LoopDeps["routeModel"];
  personasDir: string;
  skillsDir: string;
  workspacePath: string,
  /** Workspace GLOBAL (USER.md) — delegasi menimpa workspacePath jadi project root. */
  workspaceGlobalPath?: string;
  /** P1-PRJ-5: allowlist MCP sesi anak (binding roster persona anak; null = tanpa). */
  mcpAllowlistFor?: (session: { id: string; personaId: string; projectId: string | null }) => string[] | null;
  /** Mapping manual skill → persona anak (menu Dungeon; skill-bindings.json). */
  skillBindingsFor?: (personaId: string) => SkillBinding | undefined;
  /** P1-CRED-1: metering loop anak juga tercatat (persona anak + model anak). */
  recordUsage?: LoopDeps["recordUsage"];
  /** P1-CRED-3: cap delegasi paralel dinamis (budget workspace); default 2. */
  maxChildren?: () => number;
  /** P0-DEL-2: kontrol anak aktif — runtime mendaftarkan agar UI parent bisa
   *  cancel (abort turn anak) / steer (arahan mid-turn) tanpa menunggu selesai.
   *  unregister dipanggil saat anak selesai (done/error/abort). */
  controls?: {
    register: (childSessionId: string, parentSessionId: string, ctl: { abort: AbortController; steer: (text: string) => void; pause: () => void; resume: () => void }) => void;
    unregister: (childSessionId: string) => void;
  };
}

const MAX_PARALLEL_CHILDREN = 3; // fix 2026-11: Maestro kerap 3 arah sekaligus (riset+susun+develop)

let activeChildren = 0;

export interface ChildRunHandle {
  childSessionId: string;
  summary: Promise<string>;
}

export function runChildPersona(
  deps: DelegationDeps,
  parent: { sessionId: string; turnId: string },
  personaId: string,
  goal: string,
  context: string | null,
  parentEmit: Emit,
): ChildRunHandle {
  const personas = listPersonas(deps.personasDir);
  const persona = personas.find((p) => p.manifest.id === personaId);
  if (!persona) throw new Error(`persona tidak ditemukan: ${personaId}`);
  if (!persona.manifest.delegation.spawnable_by.includes("yui") && !persona.manifest.delegation.spawnable_by.includes("user")) {
    throw new Error(`persona ${personaId} tidak spawnable`);
  }
  // P1-DEL-1: cap paralel = min(cap budget workspace, cap plan pendelegasi).
  // max_concurrent dibaca dari delegation.yaml persona PARENT — "resep"
  // seberapa agresif persona itu boleh membuka front paralel (Maestro 3 arah,
  // Planner fokus 1 anak per waktu). Anak tanpa delegate_task tak terdampak.
  const parentPersonaId = deps.store.getSession(parent.sessionId)?.personaId;
  const planCap = personas.find((p) => p.manifest.id === parentPersonaId)?.manifest.delegation.max_concurrent;
  const budgetCap = deps.maxChildren?.() ?? MAX_PARALLEL_CHILDREN;
  const cap = Math.min(budgetCap, planCap ?? budgetCap);
  if (activeChildren >= cap)
    throw new Error(
      `batas delegation paralel (${cap}) tercapai` +
        (planCap !== undefined && planCap <= budgetCap ? ` — plan ${parentPersonaId}: max_concurrent=${planCap} (delegation.yaml)` : " — atur di Settings → Metering"),
    );

  const childSessionId = `s_${randomUUID()}`;
  // Toolset anak = toolset persona MINUS delegate_task (kedalaman 1 utk demo) — TODO(P1): depth policy
  const childTools = persona.manifest.tools.filter((t) => t !== "delegate_task");
  // P1-MEM-6: anak mewarisi projectId parent (binding roster MCP anak jalan;
  // tool memory_append scope project valid). USER.md + memori DOMAIN persona anak
  // di-inject ke prompt anak (frozen). MEMORY.md project untuk anak menyusul
  // bersama projectRootFor di deps.
  const parentSession = deps.store.getSession(parent.sessionId);
  const childProjectId = parentSession?.projectId ?? null;
  const memExtra = memoryPromptSection(
    deps.workspaceGlobalPath ?? deps.workspacePath,
    null,
    persona.manifest.memory?.domain ?? null,
  );

  // Reuse pembuatan sesi dari AgentLoop factory (prompt frozen, skills index persona anak
  // + mapping manual Dungeon)
  createSessionWithPrompt(
    deps.store,
    persona,
    childSessionId,
    childTools,
    deps.skillsDir,
    childProjectId,
    memExtra,
    deps.skillBindingsFor?.(persona.manifest.id),
  );

  parentEmit({ type: "delegation.started", turnId: parent.turnId, childSessionId, personaId, goal });
  activeChildren++;
  // P0-DEL-2: kontrol anak — abort untuk cancel, steerQueue untuk arahan
  // mid-turn (di-drain loop anak tiap awal iterasi).
  const ac = new AbortController();
  const steerQueue: string[] = [];
  // P1-DEL-3: pause/resume — anak berhenti di batas iterasi (gate di loop);
  // abort saat pause membangunkan semua waiter → loop keluar graceful.
  let paused = false;
  let wakeWaiters: Array<() => void> = [];
  const wake = (): void => {
    const ws = wakeWaiters;
    wakeWaiters = [];
    ws.forEach((f) => f());
  };
  ac.signal.addEventListener("abort", wake, { once: true });
  deps.controls?.register(childSessionId, parent.sessionId, {
    abort: ac,
    steer: (text) => {
      steerQueue.push(text);
      parentEmit({ type: "delegation.steered", turnId: parent.turnId, childSessionId, text });
    },
    pause: () => {
      if (paused || ac.signal.aborted) return;
      paused = true;
      parentEmit({ type: "delegation.paused", turnId: parent.turnId, childSessionId });
    },
    resume: () => {
      if (!paused) return;
      paused = false;
      wake();
      parentEmit({ type: "delegation.resumed", turnId: parent.turnId, childSessionId });
    },
  });
  // P0-DEL-1: job persist — baris di DB sebelum loop anak jalan (audit & heal
  // lintas restart); ditutup done/error saat selesai. Gagal tulis job TIDAK
  // membatalkan delegasi (persist = best-effort, eksekusi tetap jalan).
  let jobId = -1;
  try {
    jobId = deps.store.startDelegationJob({
      parentSessionId: parent.sessionId,
      parentTurnId: parent.turnId,
      childSessionId,
      personaId,
      goal,
    });
  } catch {
    /* best-effort */
  }

  const summary = (async () => {
    const t0 = Date.now();
    try {
      const childEmit: Emit = (draft) => {
        // Event anak juga tersimpan di sesi anak (bisa diinspeksi terpisah)
        const event = deps.store.appendEvent(childSessionId, draft);
        deps.bus.publish(childSessionId, event);
        // Teruskan state persona anak ke parent sebagai delegation.progress
        if (draft.type === "persona.state") {
          parentEmit({ type: "delegation.progress", childSessionId, state: draft.state as PersonaState });
        }
        // Fix dev-10 ("kartu delegasi statis menit-lamanya"): delta teks/pikiran/
        // aktivitas tool anak diteruskan LIVE ke parent — UI parent streaming
        // "si anak sedang apa" selama provider call 2–9 menit, bukan diam.
        if (draft.type === "message.delta") {
          parentEmit({ type: "delegation.delta", childSessionId, personaId, kind: "text", delta: draft.delta });
        }
        if (draft.type === "reasoning.delta") {
          parentEmit({ type: "delegation.delta", childSessionId, personaId, kind: "reasoning", delta: draft.delta });
        }
        if (draft.type === "tool.call") {
          parentEmit({ type: "delegation.delta", childSessionId, personaId, kind: "tool", delta: `${draft.name}(${Object.keys(draft.args ?? {}).slice(0, 3).join(", ")})` });
        }
        // Approval yang diminta anak HARUS terlihat di parent — kalau tidak, turn parent
        // menggantung selamanya (UI parent hanya subscribe sesi parent). Kartu approval
        // tetap match by requestId (resolvePendingApproval global).
        if (draft.type === "approval.requested" || draft.type === "approval.resolved") {
          parentEmit(draft);
        }
      };
      const approvals = makeApprovalEngineForSession(childEmit);
      const loop = new AgentLoop({
        store: deps.store,
        provider: deps.provider,
        model: deps.model,
        routeModel: deps.routeModel,
        workspacePath: deps.workspacePath,
        approvals,
        emit: childEmit,
        mcpAllowlistFor: deps.mcpAllowlistFor,
        recordUsage: deps.recordUsage, // P1-CRED-1: anak ikut ter-meter
        steerFor: () => {
          const q = [...steerQueue];
          steerQueue.length = 0;
          return q;
        }, // P0-DEL-2
        pauseGateFor: async () => {
          // tunggu hingga resume/abort; true = lanjut iterasi, false = abort saat pause
          while (paused && !ac.signal.aborted) await new Promise<void>((res) => wakeWaiters.push(res));
          return !ac.signal.aborted;
        }, // P1-DEL-3
      });
      await loop.runTurn(childSessionId, context ? `${goal}\n\nContext:\n${context}` : goal, { signal: ac.signal });
      // P0-DEL-2: turn anak dibatalkan GRACEFUL (loop keluar rapi, bukan throw)
      // → job interrupted + kartu ditutup dengan penanda pembatalan.
      if (ac.signal.aborted) {
        if (jobId > 0) deps.store.finishDelegationJob(jobId, { status: "interrupted", error: "dibatalkan user/parent (P0-DEL-2)" });
        parentEmit({
          type: "delegation.done",
          turnId: parent.turnId,
          childSessionId,
          summary: "_(anak dibatalkan — progres tersimpan di sesi anak, lanjutkan dari sana)_",
        });
        return "_(dibatalkan)_";
      }
      const msgs = deps.store.getMessages(childSessionId);
      const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant" && m.content.trim());
      const summaryText = lastAssistant?.content ?? "(child selesai tanpa output)";
      // P0-DEL-1: loop menelan error provider (session.error event, bukan throw)
      // — job harus jujur: sesi anak berakhir GAGAL → status error, bukan done.
      const childEvents = deps.store.getEvents(childSessionId);
      const fatalError = [...childEvents].reverse().find((e): e is Extract<(typeof childEvents)[number], { type: "session.error" }> => e.type === "session.error" && e.recoverable === false);
      if (fatalError) throw new Error(`child gagal: ${fatalError.message}`);
      parentEmit({ type: "delegation.done", turnId: parent.turnId, childSessionId, summary: summaryText });
      if (jobId > 0) deps.store.finishDelegationJob(jobId, { status: "done", summary: summaryText });
      moduleLogger("delegation").info({ personaId, childSessionId, ms: Date.now() - t0 }, `delegation finished (goal: ${goal.slice(0, 60)}…)`);
      return summaryText;
    } catch (err) {
      // P0-DEL-2: dibatalkan (user/parent) BUKAN kegagalan — job interrupted +
      // kartu delegasi ditutup dengan penanda pembatalan, bukan "gagal".
      const cancelled = ac.signal.aborted;
      const msg = err instanceof Error ? err.message : String(err);
      if (jobId > 0) deps.store.finishDelegationJob(jobId, { status: cancelled ? "interrupted" : "error", error: cancelled ? "dibatalkan user/parent (P0-DEL-2)" : msg });
      // Tutup kartu delegasi di parent dengan ringkasan gagal — tanpa ini UI
      // menampilkan persona anak "working" selamanya.
      parentEmit({
        type: "delegation.done",
        turnId: parent.turnId,
        childSessionId,
        summary: cancelled ? "_(anak dibatalkan — progres tersimpan di sesi anak, lanjutkan dari sana)_" : `_(anak gagal: ${msg})_`,
      });
      if (cancelled) return "_(dibatalkan)_";
      throw err;
    } finally {
      activeChildren--;
      deps.controls?.unregister(childSessionId);
    }
  })();

  return { childSessionId, summary };
}
