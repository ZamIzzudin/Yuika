// @yui/core — delegation-lite (DEMO): child = turn loop in-process dengan persona anak.
// DEMO-SHORTCUT: tanpa job queue persist, tanpa steering — dibayar di P0/P1 (TASKS.md).
// Parent hanya menerima ringkasan, bukan tool calls anak (context economy — Hermes §4.6).
import { randomUUID } from "node:crypto";
import type { PersonaState } from "@yui/contracts";
import type { SessionStore } from "../session/store.js";
import type { Emit } from "../session/emit.js";
import type { EventBus } from "../bus.js";
import type { ProviderAdapter } from "../provider/adapter.js";
import { AgentLoop, type LoopDeps } from "../loop.js";
import { makeApprovalEngineForSession, createSessionWithPrompt } from "../runtime-helpers.js";
import { memoryPromptSection } from "../memory/manager.js";
import { listPersonas } from "../personas/loader.js";

export interface DelegationDeps {
  store: SessionStore;
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
  /** P1-CRED-1: metering loop anak juga tercatat (persona anak + model anak). */
  recordUsage?: LoopDeps["recordUsage"];
  /** P1-CRED-3: cap delegasi paralel dinamis (budget workspace); default 2. */
  maxChildren?: () => number;
}

const MAX_PARALLEL_CHILDREN = 2; // DEMO cap — P1: pool berbasis workspace + plan

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
  const persona = listPersonas(deps.personasDir).find((p) => p.manifest.id === personaId);
  if (!persona) throw new Error(`persona tidak ditemukan: ${personaId}`);
  if (!persona.manifest.delegation.spawnable_by.includes("yui") && !persona.manifest.delegation.spawnable_by.includes("user")) {
    throw new Error(`persona ${personaId} tidak spawnable`);
  }
  if (activeChildren >= (deps.maxChildren?.() ?? MAX_PARALLEL_CHILDREN))
    throw new Error(`batas delegation paralel (${deps.maxChildren?.() ?? MAX_PARALLEL_CHILDREN}) tercapai — atur di Settings → Metering`);

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

  // Reuse pembuatan sesi dari AgentLoop factory (prompt frozen, skills index persona anak)
  createSessionWithPrompt(deps.store, persona, childSessionId, childTools, deps.skillsDir, childProjectId, memExtra);

  parentEmit({ type: "delegation.started", turnId: parent.turnId, childSessionId, personaId, goal });
  activeChildren++;

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
      });
      await loop.runTurn(childSessionId, context ? `${goal}\n\nContext:\n${context}` : goal);
      const msgs = deps.store.getMessages(childSessionId);
      const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant" && m.content.trim());
      const summaryText = lastAssistant?.content ?? "(child selesai tanpa output)";
      parentEmit({ type: "delegation.done", turnId: parent.turnId, childSessionId, summary: summaryText });
      console.log(`[yui:trace] delegasi ${personaId} SELESAI total=${Date.now() - t0}ms (goal: ${goal.slice(0, 60)}…)`);
      return summaryText;
    } finally {
      activeChildren--;
    }
  })();

  return { childSessionId, summary };
}
