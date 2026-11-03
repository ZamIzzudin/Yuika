// @yui/core — runtime wiring: satu factory untuk seluruh kernel (dipakai apps/web).
// DEMO-SHORTCUT: core berjalan in-process di Next.js; P0 memisah jadi service + worker.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PersonaInfo, type YuiEvent } from "@yui/contracts";
import { SessionStore } from "./session/store.js";
import { makeEmitter } from "./session/emit.js";
import { EventBus } from "./bus.js";
import { OpenAICompatProvider } from "./provider/openai-compat.js";
import { AgentLoop } from "./loop.js";
import { ApprovalEngine, resolvePendingApproval } from "./approval/engine.js";
import { listPersonas } from "./personas/loader.js";
import { createSessionWithPrompt } from "./runtime-helpers.js";
import { registerFileTools } from "./tools/file-tools.js";
import { registerWebTools } from "./tools/web-tools.js";
import { registerSkillTools } from "./tools/skill-tools.js";
import { registerRunCommandTool } from "./tools/run-command.js";
import { registerDelegateTool } from "./tools/delegate-tool.js";
import { registerTodoTools } from "./tools/todo-tools.js";
import { connectMcpFromConfig, type McpRegistry } from "./mcp/client.js";
import { appendUserPreferenceNote } from "./memory/usermd.js";
import { resolvePaths, type YuiPaths } from "./paths.js";
import { ProjectStore } from "./project/store.js";

export interface YuiRuntimeConfig {
  provider: { baseUrl: string; apiKey: string; model: string };
  paths?: Partial<YuiPaths>;
}

export function createYuiRuntime(cfg: YuiRuntimeConfig) {
  const paths = { ...resolvePaths(), ...cfg.paths } as YuiPaths;
  fs.mkdirSync(paths.workspacePath, { recursive: true });

  const store = new SessionStore(paths.dbPath);
  const projectStore = new ProjectStore(paths.dbPath);
  const provider = new OpenAICompatProvider({ baseUrl: cfg.provider.baseUrl, apiKey: cfg.provider.apiKey });

  // tools core (sekali per proses)
  registerFileTools();
  registerWebTools();
  registerSkillTools(paths.skillsDir);
  registerRunCommandTool();
  registerTodoTools({ sessionStore: store, projects: projectStore });
  registerDelegateTool({
    store,
    bus: EventBus,
    provider,
    model: cfg.provider.model,
    personasDir: paths.personasDir,
    skillsDir: paths.skillsDir,
    workspacePath: paths.workspacePath,
  });

  // MCP dari config (demo: best-effort, lanjut jika gagal)
  let mcpConfig: McpRegistry | null = null;
  if (paths.mcpConfigPath && fs.existsSync(paths.mcpConfigPath)) {
    mcpConfig = JSON.parse(fs.readFileSync(paths.mcpConfigPath, "utf-8")) as McpRegistry;
  }
  void connectMcpFromConfig(mcpConfig).then((conns) => {
    for (const c of conns) console.log(`[yui] MCP '${c.name}' terhubung (${c.toolCount} tools)`);
  });

  function listPersonaInfos(): PersonaInfo[] {
    return listPersonas(paths.personasDir).map((p) => ({
      id: p.manifest.id,
      name: p.manifest.name,
      expertise: p.manifest.expertise,
      description: p.manifest.description,
      portrait: p.manifest.assets.portrait,
      states: p.manifest.assets.expressions,
    }));
  }

  function createSession(
    personaId: string,
    projectId?: string | null,
  ): { sessionId: string; persona: PersonaInfo; projectId: string | null } {
    const persona = listPersonas(paths.personasDir).find((p) => p.manifest.id === personaId);
    if (!persona) throw new Error(`persona tidak ditemukan: ${personaId}`);
    if (projectId && !projectStore.getProject(projectId)) {
      throw new Error(`project tidak ditemukan: ${projectId}`);
    }
    const sessionId = `s_${randomUUID()}`;
    // System prompt + toolset DIBEKUKAN di sini (prompt-cache discipline)
    createSessionWithPrompt(store, persona, sessionId, persona.manifest.tools, paths.skillsDir, projectId ?? null);
    // W5-C2 stub: 1 catatan preferensi (preview) per sesi baru — learning-loop P1
    appendUserPreferenceNote(paths.workspacePath, persona.manifest.name);
    const info = listPersonaInfos().find((p) => p.id === personaId)!;
    return { sessionId, persona: info, projectId: projectId ?? null };
  }

  /** P1-PRJ-2: root file-ops efektif sesi — project root bila melekat, workspace bila tidak. */
  function effectiveWorkspace(sessionId: string): string {
    const session = store.getSession(sessionId);
    if (!session) throw new Error(`session ${sessionId} tidak ditemukan`);
    if (!session.projectId) return paths.workspacePath;
    const project = projectStore.getProject(session.projectId);
    if (!project) throw new Error(`project ${session.projectId} tidak ditemukan (dihapus?)`);
    return path.join(paths.workspacePath, project.rootPath);
  }

  function makeLoopFor(sessionId: string): AgentLoop {
    const emit = makeEmitter(store, EventBus, sessionId);
    const approvals = new ApprovalEngine(emit);
    return new AgentLoop({
      store,
      provider,
      model: cfg.provider.model,
      workspacePath: effectiveWorkspace(sessionId), // P1-PRJ-2: scope per sesi
      approvals,
      emit,
    });
  }

  return {
    paths,
    store,
    bus: EventBus,
    listPersonas: listPersonaInfos,
    createSession,
    runTurn: (sessionId: string, text: string) => makeLoopFor(sessionId).runTurn(sessionId, text),
    resolveApproval: (requestId: string, approved: boolean) => resolvePendingApproval(requestId, approved),
    emitSessionError: (sessionId: string, message: string) => {
      const e = store.appendEvent(sessionId, { type: "session.error", message, recoverable: false });
      EventBus.publish(sessionId, e);
    },
    getEvents: (sessionId: string, since = 0): YuiEvent[] => store.getEvents(sessionId, since),
    subscribe: (sessionId: string, listener: (e: YuiEvent) => void) => EventBus.subscribe(sessionId, listener),
    // ---- projects (P1-PRJ-1, PLAN §13.1) ----
    createProject: (name: string, description = "") => {
      const id = `p_${randomUUID().slice(0, 8)}`;
      const rootPath = `projects/${id}`; // relatif terhadap workspace — diisolasi penuh di P1-PRJ-2
      for (const sub of ["code", "docs", "reports"]) {
        fs.mkdirSync(path.join(paths.workspacePath, rootPath, sub), { recursive: true });
      }
      return projectStore.createProject({ id, name, description, rootPath });
    },
    listProjects: () => projectStore.listProjects(),
    getProject: (id: string) => projectStore.getProject(id),
    updateProject: (id: string, patch: { name?: string; description?: string; status?: "active" | "archived" }) =>
      projectStore.updateProject(id, patch),
    // ---- tasklist project (P1-PRJ-4) ----
    listProjectTasks: (projectId: string) => projectStore.listTasks(projectId),
    createProjectTask: (projectId: string, title: string, assignee?: string | null) =>
      projectStore.createTask({ id: `t_${randomUUID().slice(0, 8)}`, projectId, title, assignee: assignee ?? null }),
    updateProjectTask: (
      taskId: string,
      patch: { title?: string; status?: "todo" | "doing" | "review" | "done"; assignee?: string | null; addRefs?: string[] },
    ) => projectStore.updateTask(taskId, patch),
  };
}
