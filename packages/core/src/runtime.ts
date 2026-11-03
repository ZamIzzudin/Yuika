// @yui/core — runtime wiring: satu factory untuk seluruh kernel (dipakai apps/web).
// DEMO-SHORTCUT: core berjalan in-process di Next.js; P0 memisah jadi service + worker.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PersonaInfo, type McpServerStatus, type RosterEntry as RosterEntryIn, type YuiEvent } from "@yui/contracts";
import { SessionStore } from "./session/store.js";
import { makeEmitter } from "./session/emit.js";
import { EventBus } from "./bus.js";
import { OpenAICompatProvider } from "./provider/openai-compat.js";
import { AgentLoop } from "./loop.js";
import { registry } from "./registry.js";
import { ApprovalEngine, resolvePendingApproval } from "./approval/engine.js";
import { listPersonas } from "./personas/loader.js";
import { createSessionWithPrompt } from "./runtime-helpers.js";
import { registerFileTools } from "./tools/file-tools.js";
import { registerWebTools } from "./tools/web-tools.js";
import { registerSkillTools } from "./tools/skill-tools.js";
import { registerRunCommandTool } from "./tools/run-command.js";
import { registerDelegateTool } from "./tools/delegate-tool.js";
import { registerTodoTools } from "./tools/todo-tools.js";
import { connectMcpFromConfig, connectMcpServer, type McpCallInfo, type McpRegistry } from "./mcp/client.js";
import { MCP_CATALOG } from "./mcp/catalog.js";
import { installFromCatalog, uninstallFromConfig } from "./mcp/install.js";
import { McpAuditStore } from "./mcp/audit.js";
import { loadTrust, trustOf, upsertTrust } from "./mcp/trust.js";
import { appendUserPreferenceNote } from "./memory/usermd.js";
import { memoryPromptSection, readMemory, saveMemory } from "./memory/manager.js";
import { registerMemoryTools } from "./tools/memory-tools.js";
import { resolvePaths, resolveRepoRoot, type YuiPaths } from "./paths.js";
import { updateEnvFile } from "./env-file.js";
import { findUvx, installUv } from "./mcp/uv.js";
import { ProjectStore } from "./project/store.js";
import { loadRoster, saveRoster } from "./project/roster.js";
import { taskTreeFromEvents } from "./project/tasktree.js";

export interface YuiRuntimeConfig {
  provider: { baseUrl: string; apiKey: string; model: string };
  paths?: Partial<YuiPaths>;
}

export function createYuiRuntime(cfg: YuiRuntimeConfig) {
  const paths = { ...resolvePaths(), ...cfg.paths } as YuiPaths;
  fs.mkdirSync(paths.workspacePath, { recursive: true });

  const store = new SessionStore(paths.dbPath);
  const projectStore = new ProjectStore(paths.dbPath);
  // Settings: provider & model bisa di-swap panas (updateProviderSettings) —
  // sesi baru langsung pakai; loopCache dikosongkan; delegateDeps objek yang
  // sama dimutasi propertinya agar delegasi ikut provider baru.
  let provider = new OpenAICompatProvider({ baseUrl: cfg.provider.baseUrl, apiKey: cfg.provider.apiKey });
  let providerBaseUrl = cfg.provider.baseUrl;
  let model = cfg.provider.model;

  // tools core (sekali per proses)
  registerFileTools();
  registerWebTools();
  registerSkillTools(paths.skillsDir);
  registerRunCommandTool();
  registerTodoTools({ sessionStore: store, projects: projectStore });
  registerMemoryTools({ sessionStore: store, projects: projectStore, workspacePath: paths.workspacePath });
  // Objek deps delegasi DI-MUTASI saat provider swap (spread terjadi di call time).
  const delegateDeps: Parameters<typeof registerDelegateTool>[0] = {
    store,
    bus: EventBus,
    get provider() {
      return provider;
    },
    get model() {
      return model;
    },
    personasDir: paths.personasDir,
    skillsDir: paths.skillsDir,
    workspacePath: paths.workspacePath,
    workspaceGlobalPath: paths.workspacePath, // USER.md selalu global walau delegasi menimpa workspacePath
    mcpAllowlistFor, // P1-PRJ-5: anak mewarisi binding MCP sesuai roster persona anak
  };
  registerDelegateTool(delegateDeps);

  // MCP dari config (demo: best-effort, lanjut jika gagal).
  // Placeholder {workspace} di-substitusi path absolut — path relatif salah resolve
  // karena CWD dev server = apps/web, bukan root repo (bug npx 404/folder hilang).
  // P1-MCP-3: trust gate fail-closed — hanya server di-trust workspace yang connect;
  // tiap panggilan tool MCP di-audit. Trust berubah (PUT /api/mcp/trust) =
  // connect/disconnect dinamis + re-register handler (deny list baru).
  const mcpAudit = new McpAuditStore(paths.dbPath);
  const onMcpCall = (info: McpCallInfo) => mcpAudit.log(info);
  let mcpConfig: McpRegistry | null = null;
  const reloadMcpConfig = (): McpRegistry | null => {
    if (!paths.mcpConfigPath || !fs.existsSync(paths.mcpConfigPath)) return null;
    const raw = JSON.parse(fs.readFileSync(paths.mcpConfigPath, "utf-8")) as McpRegistry;
    for (const cfg of Object.values(raw.mcpServers)) {
      cfg.args = cfg.args?.map((a) => a.replaceAll("{workspace}", paths.workspacePath));
    }
    return raw;
  };
  mcpConfig = reloadMcpConfig();
  const mcpConns = new Map<string, { close: () => Promise<void>; toolNames: string[] }>();

  function trustConfig() {
    return loadTrust(paths.workspacePath);
  }

  function serverStatuses(): McpServerStatus[] {
    const trust = trustConfig();
    const names = new Set([...Object.keys(mcpConfig?.mcpServers ?? {}), ...trust.servers.map((s) => s.server)]);
    return [...names].sort().map((name) => {
      const entry = trustOf(trust, name);
      const conn = mcpConns.get(name);
      return {
        name,
        declared: Boolean(mcpConfig?.mcpServers[name]),
        trusted: entry?.trusted ?? false,
        denyTools: entry?.denyTools ?? [],
        connected: Boolean(conn),
        toolCount: conn?.toolNames.length ?? 0,
        tools: conn?.toolNames.map((t) => t.replace(`mcp__${name}__`, "")) ?? [],
      };
    });
  }

  async function disconnectMcp(name: string): Promise<void> {
    const conn = mcpConns.get(name);
    if (!conn) return;
    mcpConns.delete(name);
    conn.toolNames.forEach((t) => registry.unregister(t));
    await conn.close().catch(() => undefined);
  }

  async function connectMcp(name: string): Promise<boolean> {
    const cfg = mcpConfig?.mcpServers[name];
    if (!cfg) throw new Error(`server MCP tidak dideklarasikan di mcp.json: ${name}`);
    const entry = trustOf(trustConfig(), name);
    if (!entry?.trusted) throw new Error(`server MCP belum di-trust: ${name}`);
    const conn = await connectMcpServer(name, cfg, { denyTools: entry.denyTools, onCall: onMcpCall });
    mcpConns.set(name, conn);
    console.log(`[yui] MCP '${name}' terhubung (${conn.toolCount} tools)`);
    return true;
  }

  // Startup: connect semua server yang sudah di-trust (via helper di atas supaya
  // mcpConns terisi — connectMcpFromConfig hanya untuk pemakaian standalone).
  for (const name of Object.keys(mcpConfig?.mcpServers ?? {})) {
    void connectMcp(name).catch((e) => console.warn(`[yui] ${e instanceof Error ? e.message : e}`));
  }

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
    // System prompt + toolset DIBEKUKAN di sini (prompt-cache discipline).
    // P1-MEM-1: USER.md + MEMORY.md project di-inject saat sesi dibuat (frozen).
    const memExtra = memoryPromptSection(
      paths.workspacePath,
      projectId ? projectRoot(projectId) : null,
    );
    createSessionWithPrompt(store, persona, sessionId, persona.manifest.tools, paths.skillsDir, projectId ?? null, memExtra);
    // W5-C2 stub: 1 catatan preferensi (preview) per sesi baru — learning-loop P1
    appendUserPreferenceNote(paths.workspacePath, persona.manifest.name);
    const info = listPersonaInfos().find((p) => p.id === personaId)!;
    return { sessionId, persona: info, projectId: projectId ?? null };
  }

  /** Riwayat sesi sebuah project (terbaru dulu) — untuk resume percakapan lintas kunjungan. */
  function listProjectSessions(projectId: string): Array<{
    sessionId: string;
    personaId: string;
    personaName: string;
    createdAt: number;
    lastEventAt: number;
  }> {
    return store.listProjectSessions(projectId).map((s) => ({
      sessionId: s.id,
      personaId: s.personaId,
      personaName: listPersonaInfos().find((p) => p.id === s.personaId)?.name ?? s.personaId,
      createdAt: s.createdAt,
      lastEventAt: s.lastEventAt,
    }));
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

  /** Root absolut project di workspace (validasi project ada) — dipakai roster (PRJ-3). */
  function projectRoot(projectId: string): string {
    const project = projectStore.getProject(projectId);
    if (!project) throw new Error(`project tidak ditemukan: ${projectId}`);
    return path.join(paths.workspacePath, project.rootPath);
  }

  /** P1-PRJ-5 (D17): allowlist tool MCP sesi = binding persona di roster project.yaml.
   *  Sesi global / persona tanpa entry roster → null → SEMUA mcp__* disembunyikan. */
  function mcpAllowlistFor(session: { personaId: string; projectId: string | null }): string[] | null {
    if (!session.projectId) return null;
    const entry = loadRoster(projectRoot(session.projectId)).find((r) => r.personaId === session.personaId);
    if (!entry?.mcp.length) return null;
    return entry.mcp.flatMap((b) =>
      b.tools.length ? b.tools.map((t) => `mcp__${b.server}__${t}`) : [`mcp__${b.server}__*`],
    );
  }

  /** Loop di-cache per sesi: engine approval ("Setujui & ingat") bertahan antar turn
   *  sesi yang sama — prompt/toolset toh frozen per sesi. */
  const loopCache = new Map<string, AgentLoop>();

  function makeLoopFor(sessionId: string): AgentLoop {
    const cached = loopCache.get(sessionId);
    if (cached) return cached;
    const emit = makeEmitter(store, EventBus, sessionId);
    const approvals = new ApprovalEngine(emit);
    const loop = new AgentLoop({
      store,
      provider,
      model,
      workspacePath: effectiveWorkspace(sessionId), // P1-PRJ-2: scope per sesi
      approvals,
      emit,
      mcpAllowlistFor, // P1-PRJ-5: binding MCP granular per project×persona
    });
    loopCache.set(sessionId, loop);
    return loop;
  }

  return {
    paths,
    store,
    bus: EventBus,
    listPersonas: listPersonaInfos,
    createSession,
    listProjectSessions,
    runTurn: (sessionId: string, text: string) => makeLoopFor(sessionId).runTurn(sessionId, text),
    resolveApproval: (requestId: string, approved: boolean, remember = false) =>
      resolvePendingApproval(requestId, approved, remember),
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
    createProjectTask: (projectId: string, title: string, assignee?: string | null, parentId?: string | null) =>
      projectStore.createTask({ id: `t_${randomUUID().slice(0, 8)}`, projectId, title, assignee: assignee ?? null, parentId: parentId ?? null }),
    updateProjectTask: (
      taskId: string,
      patch: { title?: string; status?: "todo" | "doing" | "review" | "done"; assignee?: string | null; addRefs?: string[]; addArtefak?: string[] },
    ) => projectStore.updateTask(taskId, patch),
    /** TaskTree (P1-PRJ-7): pohon utuh dari replay event project — tanpa state kedua. */
    getTaskTree: (projectId: string) => taskTreeFromEvents(projectStore.listEvents(projectId)),
    // ---- MCP trust/audit (P1-MCP-3) ----
    /** Status semua server: deklarasi mcp.json + trust workspace + koneksi live. */
    mcpServerStatuses: serverStatuses,
    /** Ubah trust (upsert file) → connect/disconnect/re-register handler deny baru. */
    setMcpTrust: async (input: { server: string; trusted: boolean; denyTools: string[] }) => {
      if (input.trusted && !mcpConfig?.mcpServers[input.server]) {
        throw new Error(`server MCP tidak dideklarasikan di mcp.json: ${input.server}`);
      }
      upsertTrust(paths.workspacePath, input);
      await disconnectMcp(input.server); // untrust / deny baru → re-register handler
      if (input.trusted) await connectMcp(input.server);
      return trustOf(trustConfig(), input.server)!;
    },
    // ---- Settings: provider & model (swap panas) ----
    /** Config provider aktif (key disamarkan — jangan pernah balas key penuh). */
    getProviderSettings: () => ({
      baseUrl: providerBaseUrl,
      model,
      hasApiKey: Boolean(process.env.YUI_API_KEY),
      keyPreview: process.env.YUI_API_KEY ? `…${process.env.YUI_API_KEY.slice(-4)}` : "",
    }),
    /** Update provider/model: swap in-memory (sesi baru langsung pakai; loopCache
     *  dikosongkan) + persist ke .env agar bertahan restart. apiKey kosong = keep. */
    updateProviderSettings: (input: { baseUrl?: string; apiKey?: string; model?: string; fallbackModel?: string | null }) => {
      const envFile = path.join(resolveRepoRoot(), ".env");
      const toWrite: Record<string, string> = {};
      if (input.baseUrl?.trim()) {
        providerBaseUrl = input.baseUrl.trim();
        provider = new OpenAICompatProvider({ baseUrl: providerBaseUrl, apiKey: process.env.YUI_API_KEY ?? cfg.provider.apiKey });
        toWrite.YUI_BASE_URL = providerBaseUrl;
        process.env.YUI_BASE_URL = providerBaseUrl;
      }
      if (input.apiKey?.trim()) {
        provider = new OpenAICompatProvider({ baseUrl: providerBaseUrl, apiKey: input.apiKey.trim() });
        toWrite.YUI_API_KEY = input.apiKey.trim();
        process.env.YUI_API_KEY = input.apiKey.trim();
      }
      if (input.model?.trim()) {
        model = input.model.trim();
        toWrite.YUI_MODEL = model;
        process.env.YUI_MODEL = model;
      }
      if (input.fallbackModel !== undefined) {
        if (input.fallbackModel?.trim()) {
          toWrite.YUI_MODEL_FALLBACK = input.fallbackModel.trim();
          process.env.YUI_MODEL_FALLBACK = input.fallbackModel.trim();
        } else {
          delete process.env.YUI_MODEL_FALLBACK;
        }
      }
      if (Object.keys(toWrite).length > 0) {
        updateEnvFile(envFile, toWrite);
        loopCache.clear(); // sesi berikutnya memakai provider/model baru
      }
      return { ok: true, note: "Sesi baru & turn berikutnya memakai config baru (loopCache dikosongkan; .env diperbarui)." };
    },
    mcpAuditRecent: (limit = 50) => mcpAudit.recent(limit),
    // ---- Runtime uv/uvx (server MCP Python) ----
    /** Status uvx: path yang bisa dijalankan ("uvx" bila di PATH) atau null. */
    mcpUvxCheck: async () => ({ uvxPath: await findUvx() }),
    /** One-click install uv (installer resmi astral.sh) — dipanggil UI dengan konfirmasi. */
    mcpInstallUv: async () => installUv(),
    // ---- Memory manager (P1-MEM-1) ----
    /** Baca dokumen memori (header dibuat bila belum ada). */
    readMemory: (scope: "user" | "project", projectId?: string | null) =>
      readMemory(paths.workspacePath, scope, projectId ? projectRoot(projectId) : null, projectId ? projectStore.getProject(projectId)?.name ?? "" : ""),
    /** Simpan utuh dari editor user. */
    saveMemory: (scope: "user" | "project", content: string, projectId?: string | null) => {
      if (scope === "project") {
        if (!projectId) throw new Error("scope project butuh projectId");
        projectRoot(projectId); // validasi project ada
      }
      saveMemory(paths.workspacePath, scope, content, scope === "project" && projectId ? projectRoot(projectId) : null);
    },
    // ---- Katalog & install (P1-MCP-1) ----
    /** Katalog kurasi untuk UI panel MCP. */
    mcpCatalog: () => MCP_CATALOG,
    /** Pasang dari katalog → tulis mcp.json + reload in-memory. TIDAK auto-connect
     *  (fail-closed): user harus Trust di panel setelah ini. */
    installMcpServer: (catalogId: string, env: Record<string, string>) => {
      if (!paths.mcpConfigPath) throw new Error("mcp.json tidak dikonfigurasi (YUI_MCP_CONFIG)");
      const { name } = installFromCatalog(paths.mcpConfigPath, catalogId, env);
      mcpConfig = reloadMcpConfig();
      return { name, statuses: serverStatuses() };
    },
    /** Lepas server: putuskan koneksi (bila ada) + hapus dari mcp.json. */
    uninstallMcpServer: async (name: string) => {
      if (!paths.mcpConfigPath) throw new Error("mcp.json tidak dikonfigurasi (YUI_MCP_CONFIG)");
      await disconnectMcp(name);
      const removed = uninstallFromConfig(paths.mcpConfigPath, name);
      mcpConfig = reloadMcpConfig();
      return { removed, statuses: serverStatuses() };
    },
    // ---- roster project (P1-PRJ-3) ----
    getProjectRoster: (projectId: string) => loadRoster(projectRoot(projectId)),
    saveProjectRoster: (projectId: string, roster: RosterEntryIn[]): RosterEntryIn[] => {
      projectRoot(projectId); // validasi project ada
      const known = new Set(listPersonas(paths.personasDir).map((p) => p.manifest.id));
      const seen = new Set<string>();
      for (const r of roster) {
        if (!known.has(r.personaId)) throw new Error(`persona tidak ditemukan: ${r.personaId}`);
        if (seen.has(r.personaId)) throw new Error(`persona duplikat di roster: ${r.personaId}`);
        seen.add(r.personaId);
      }
      saveRoster(projectRoot(projectId), roster);
      return loadRoster(projectRoot(projectId));
    },
  };
}
