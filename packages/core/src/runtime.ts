// @yuika/core — runtime wiring: satu factory untuk seluruh kernel (dipakai apps/web).
// DEMO-SHORTCUT: core berjalan in-process di Next.js; P0 memisah jadi service + worker.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PersonaInfo, type DeleteProjectResult, type McpServerStatus, type PersonaGrowth, type PersonaShapeOverride, type RosterEntry as RosterEntryIn, type TaskItem, type UpdateBudgetRequest, type UsageFilter, type YuiEvent } from "@yuika/contracts";
import { createSessionStore, type ISessionStore } from "./session/store.js";
import { moduleLogger } from "./logger.js";
import { makeEmitter } from "./session/emit.js";
import { EventBus } from "./bus.js";
import { OpenAICompatProvider } from "./provider/openai-compat.js";
import { AnthropicProvider } from "./provider/anthropic.js";
import { GeminiProvider } from "./provider/gemini.js";
import type { ProviderKind } from "./provider/index.js";
import { AgentLoop } from "./loop.js";
import { registry } from "./registry.js";
import { ApprovalEngine, resolvePendingApproval, getApprovalMode, setApprovalMode, type ApprovalMode } from "./approval/engine.js";
import { listPersonas } from "./personas/loader.js";
import { buildPersonaGrowth } from "./personas/growth.js";
import { loadPersonaShapes, savePersonaShape } from "./personas/shapes.js";
import { createSessionWithPrompt } from "./runtime-helpers.js";
import { WorkflowEngine } from "./workflow/engine.js";
import { loadSkillBindings, saveSkillBindings, applyBindingAction, effectiveSkillNames, type SkillBinding, type SkillBindingsFile } from "./skills/bindings.js";
import { registerFileTools } from "./tools/file-tools.js";
import { registerWebTools } from "./tools/web-tools.js";
import { newResearchCache } from "./research/cache.js";
import { registerSkillTools } from "./tools/skill-tools.js";
import { registerRunCommandTool } from "./tools/run-command.js";
import { registerVaultTools } from "./tools/vault-tools.js";
import { getVault } from "./vault/manager.js";
import { registerTerminalTool } from "./tools/terminal-tool.js";
import * as terminal from "./terminal/manager.js";
import { registerDelegateTool } from "./tools/delegate-tool.js";
import { registerConsultTool } from "./tools/consult-tool.js";
import { registerTodoTools } from "./tools/todo-tools.js";
import { connectMcpFromConfig, connectMcpServer, type McpCallInfo, type McpRegistry } from "./mcp/client.js";
import { MCP_CATALOG } from "./mcp/catalog.js";
import { installFromCatalog, uninstallFromConfig } from "./mcp/install.js";
import { McpAuditStore } from "./mcp/audit.js";
import { UsageLedger } from "./usage/ledger.js";
import { loadPriceBook, saveModelPrice } from "./model-prices.js";
import { AdmissionControl, usageMatrixWithCost } from "./budget.js";
import { buildTrace } from "./session/trace.js";
import type { ModelPrice } from "@yuika/contracts";
import { loadTrust, trustOf, upsertTrust } from "./mcp/trust.js";
import { appendUserPreferenceNote } from "./memory/usermd.js";
import { memoryPromptSection, readMemory, saveMemory } from "./memory/manager.js";
import { registerMemoryTools } from "./tools/memory-tools.js";
import { registerSessionSearchTools } from "./tools/session-search.js";
import { registerDocTools } from "./tools/doc-tools.js";
import { resolvePaths, resolveRepoRoot, type YuiPaths } from "./paths.js";
import { updateEnvFile } from "./env-file.js";
import { env } from "./env.js";
import { findUvx, installUv } from "./mcp/uv.js";
import { buildModelRouter, loadModelOverrides, saveModelOverride } from "./model-router.js";
import { smokeModel } from "./provider/smoke.js";
import type { ModelSmokeResult } from "@yuika/contracts";
import { acceptDraft, listDrafts, readUsage, rejectDraft, updateDraft } from "./skills/manager.js";
import { buildFileTree, readProjectFile, safeProjectPath } from "./project/files.js";
import { readBrowserPolicy, readBrowserPage, writeBrowserPolicy } from "./browser/reader.js";
import { FileRevisionStore } from "./project/revisions.js";
import { listSkills } from "./skills/loader.js";
import { ProjectStore } from "./project/store.js";
import { loadRoster, saveRoster } from "./project/roster.js";
import { computeReadiness } from "./project/readiness.js";
import { taskTreeFromEvents } from "./project/tasktree.js";
import { loadMissions, missionDir, createMission as writeMission, appendMissionResource, deleteMission, dungeonsDir, sanitizeMaterialName } from "./dungeon/mission.js";
import { createDungeonRunner, sweepStaleRuns } from "./dungeon/runner.js";
import { healInterruptedTurns } from "./session/heal.js";
import { createSkillEvaluator, missionForSkill, readEval } from "./dungeon/eval.js";
import { setSkillStatus } from "./skills/manager.js";

export interface YuiRuntimeConfig {
  provider: { baseUrl: string; apiKey: string; model: string; kind?: string };
  paths?: Partial<YuiPaths>;
}

function safeList<T>(fn: () => T[]): T[] {
  try {
    return fn();
  } catch {
    return [];
  }
}

export function createYuiRuntime(cfg: YuiRuntimeConfig) {
  const paths = { ...resolvePaths(), ...cfg.paths } as YuiPaths;
  fs.mkdirSync(paths.workspacePath, { recursive: true });

  const store: ISessionStore = createSessionStore(paths.dbPath);
  // P0-DATA-3: approval pending dari proses sebelumnya → expired (turn-nya mati
  // bersama proses lama); kartu di UI ditandai lewat event approval.expired.
  store.expirePendingApprovals();

  // ---- P1-DUN-1: dungeon runner (arena latihan; ruangan = project sandbox) ----
  /** Ruangan misi = project kind dungeon, root = folder misi (sandbox sesi). */
  function ensureDungeonRoom(m: { id: string; title: string; goal: string }): string {
    const id = `p_dungeon-${m.id}`;
    const existing = projectStore.getProject(id);
    if (existing) return id;
    const rootPath = `dungeons/${m.id}`;
    for (const sub of ["code", "reports"]) fs.mkdirSync(path.join(paths.workspacePath, rootPath, sub), { recursive: true });
    return projectStore.createProject({ id, name: `Dungeon: ${m.title}`, description: m.goal.slice(0, 200), rootPath, kind: "dungeon" }).id;
  }
  const dungeonRunner = createDungeonRunner({
    workspacePath: paths.workspacePath,
    ensureRoom: (m) => ensureDungeonRoom(m),
    createSession: (personaId, projectId) => createSession(personaId, projectId).sessionId,
    runTurn: (sessionId, text) => runTurnInternal(sessionId, text),
    lastAssistantText: (sessionId) => {
      const msgs = store.getMessages(sessionId).filter((m) => m.role === "assistant");
      return msgs.length ? (msgs[msgs.length - 1]!.content ?? null) : null;
    },
  });
  // P0 reliabilitas (feedback user dev-10): turn/run yang mati bersama proses
  // lama (server direstart saat berjalan) ditutup jujur — anti UI "berjalan"
  // zombie. Sekali per PROSES: HMR me-recreate runtime, tapi turn lama masih
  // hidup di memori proses ini → jangan bunuh (flag globalThis). Flag yang sama
  // menjaga sweepStaleRuns agar tidak menandai run HIDUP sebagai gagal saat HMR.
  const gBoot = globalThis as unknown as { __yuiBootSwept?: boolean };
  if (!gBoot.__yuiBootSwept) {
    gBoot.__yuiBootSwept = true;
    sweepStaleRuns(paths.workspacePath, loadMissions(paths.workspacePath)); // restart-safe
    const healed = healInterruptedTurns(store);
    if (healed.length) moduleLogger("runtime").info({ count: healed.length }, "interrupted turns healed after restart");
  }

  // ---- P1-DUN-3: eval buta tested→ready (hakim = sesi fresh, lihat §13.8) ----
  const skillEvaluator = createSkillEvaluator({
    createJudgeSession: (personaId, projectId) => createSession(personaId, projectId).sessionId,
    ensureRoom: (m) => ensureDungeonRoom(m),
    runTurn: (sessionId, text) => runTurnInternal(sessionId, text),
    lastAssistantText: (sessionId) => {
      const msgs = store.getMessages(sessionId).filter((m) => m.role === "assistant");
      return msgs.length ? (msgs[msgs.length - 1]!.content ?? null) : null;
    },
    promote: (skillName) => setSkillStatus(paths.skillsDir, skillName, "ready"),
  });
  const projectStore = new ProjectStore(paths.dbPath);
  // Settings: provider & model bisa di-swap panas (updateProviderSettings) —
  // sesi baru langsung pakai; loopCache dikosongkan; delegateDeps objek yang
  // sama dimutasi propertinya agar delegasi ikut provider baru.
  let providerKind: ProviderKind = (cfg.provider.kind as ProviderKind | undefined) ?? "openai-compat";
  let provider = makeProvider(cfg.provider.baseUrl, cfg.provider.apiKey);
  let providerBaseUrl = cfg.provider.baseUrl;

  /** P1-INF-2: satu titik pembuatan provider — adapter per kind. */
  function makeProvider(baseUrl: string, apiKey: string) {
    return providerKind === "anthropic"
      ? new AnthropicProvider({ baseUrl, apiKey })
      : providerKind === "gemini"
        ? new GeminiProvider({ baseUrl, apiKey })
        : new OpenAICompatProvider({ baseUrl, apiKey });
  }
  let model = cfg.provider.model;
  // P1-MDL-1: override per persona (diedit di Settings) — file JSON di samping DB.
  const modelOverridesFile = path.join(path.dirname(paths.dbPath), "model-overrides.json");
  const modelPricesFile = path.join(path.dirname(paths.dbPath), "model-prices.json");
  // Mode approval (fix dev-10): persist di data/ — "auto" = write_file &
  // run_command bebas-approval (mode cepat), "ask" = kartu persetujuan.
  const approvalModeFile = path.join(path.dirname(paths.dbPath), "approval-mode.json");
  try {
    setApprovalMode(JSON.parse(fs.readFileSync(approvalModeFile, "utf-8")).mode === "auto" ? "auto" : "ask");
  } catch {
    setApprovalMode("ask"); // belum ada / rusak → default aman
  }
  // Mapping manual skill → persona (menu Dungeon): file data/skill-bindings.json.
  // Baca ulang tiap akses (hot path kecil — satu file JSON) supai editan via UI
  // langsung berlaku untuk SESI BARU tanpa restart runtime.
  const skillBindingsPath = path.join(path.dirname(paths.dbPath), "skill-bindings.json");
  function skillBindingsFile(): SkillBindingsFile {
    return loadSkillBindings(skillBindingsPath);
  }

  // tools core (sekali per proses)
  const fileRevisions = new FileRevisionStore(paths.dbPath);
  registerFileTools(fileRevisions);
  // Batch 7 (RS-4): cache riset SQLite terpisah dari db sesi (aman dihapus ulang).
  const researchCache = newResearchCache(path.join(path.dirname(paths.dbPath), "research.db"));
  registerWebTools({ sessionStore: store, projects: projectStore, cache: researchCache }); // P2-STU-4: fetch agent tercatat di tab Browser
  registerSkillTools(paths.skillsDir);
  registerSessionSearchTools(store); // P1-MEM-5: riwayat sesi bisa ditelusuri agent
  registerDocTools(); // dev-10: scribe membaca dokumen user (pdf/xlsx/csv)
  registerRunCommandTool();
  // Batch 12 (P2-VLT): vault kredensial — store terenkripsi terpisah dari demo.db
  // (vault.db + vault.key di direktori data). Nilai tak pernah lewat jalur model.
  const vault = getVault(path.dirname(paths.dbPath));
  registerVaultTools();
  registerTerminalTool(); // P2-STU-2: terminal shared user & agent
  registerTodoTools({ sessionStore: store, projects: projectStore });
  registerMemoryTools({
    sessionStore: store,
    projects: projectStore,
    workspacePath: paths.workspacePath,
    // P1-MEM-6: domain persona pemanggil tool (dari manifest, cache-friendly).
    domainOfPersona: (personaId) => listPersonas(paths.personasDir).find((p) => p.manifest.id === personaId)?.manifest.memory.domain ?? null,
  });
  // Objek deps delegasi DI-MUTASI saat provider swap (spread terjadi di call time).
  // P1-MDL-1: router model per persona — override file (Settings) → persona.yaml → default.
  const modelRouter = buildModelRouter({
    defaultModel: () => model, // getter: default bisa di-swap panas (updateProviderSettings)
    defaultFallback: process.env.YUI_MODEL_FALLBACK,
    personasDir: paths.personasDir,
    overridesFile: modelOverridesFile,
  });
  const routeModelFor = (personaId: string) => ({ ...modelRouter.route(personaId), markUnhealthy: modelRouter.markUnhealthy });
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
    routeModel: routeModelFor, // P1-MDL-1: anak resolve model persona-nya sendiri
    mcpAllowlistFor, // P1-PRJ-5: anak mewarisi binding MCP sesuai roster persona anak
    skillBindingsFor: (personaId) => skillBindingsFile()[personaId], // mapping manual Dungeon
    recordUsage: (u) => { usageLedger.record(u); admission.noteUsage(); }, // CRED-1 meter + CRED-2 saldo cache invalidate
    maxChildren: () => admission.maxChildren(), // CRED-3: cap delegasi dinamis
    controls: {
      register: (childSessionId, parentSessionId, ctl) => childControls.set(childSessionId, { parentSessionId, ctl }),
      unregister: (childSessionId) => childControls.delete(childSessionId),
    }, // P0-DEL-2
  };
  registerDelegateTool(delegateDeps);
  // P2-PM-2 (D22): consult — brainstorm terstruktur Planner ke persona spesialis
  // (paralel via delegation runner yang sama: metering/cap/event/audit berlaku).
  registerConsultTool(delegateDeps);

  // P2-FLOW-2: workflow engine — deps memakai GETTER yang sama dgn delegateDeps
  // (provider/model hot-swap tetap terlihat; spread langsung akan membekukan nilai).
  const workflowEngine = new WorkflowEngine({
    get store() {
      return store;
    },
    get bus() {
      return EventBus;
    },
    get provider() {
      return provider;
    },
    get model() {
      return model;
    },
    personasDir: paths.personasDir,
    skillsDir: paths.skillsDir,
    workspacePath: paths.workspacePath,
    workspaceGlobalPath: paths.workspacePath,
    routeModel: routeModelFor,
    mcpAllowlistFor,
    skillBindingsFor: (personaId) => skillBindingsFile()[personaId],
    recordUsage: (u) => {
      usageLedger.record(u);
      admission.noteUsage();
    },
    maxChildren: () => admission.maxChildren(),
    projects: projectStore,
  });
  // FLOW-3: run yang belum tamat dilanjutkan saat boot (gate yang belum
  // diputuskan ditanya ulang; step done tidak diulang).
  const resumedRuns = workflowEngine.resumeRuns();
  if (resumedRuns.length) moduleLogger("workflow").info({ runs: resumedRuns }, "resume: run belum tamat dilanjutkan");

  // MCP dari config (demo: best-effort, lanjut jika gagal).
  // Placeholder {workspace} di-substitusi path absolut — path relatif salah resolve
  // karena CWD dev server = apps/web, bukan root repo (bug npx 404/folder hilang).
  // P1-MCP-3: trust gate fail-closed — hanya server di-trust workspace yang connect;
  // tiap panggilan tool MCP di-audit. Trust berubah (PUT /api/mcp/trust) =
  // connect/disconnect dinamis + re-register handler (deny list baru).
  const mcpAudit = new McpAuditStore(paths.dbPath);
  // P1-CRED-1: ledger metering — token per panggilan model (loop utama + delegasi anak).
  const usageLedger = new UsageLedger(paths.dbPath);
  // P1-CRED-2/3: admission control (saldo hold→settle + rate limit) — file budget.json.
  const budgetFile = path.join(path.dirname(paths.dbPath), "budget.json");
  const admission = new AdmissionControl(usageLedger, modelPricesFile, budgetFile);
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
  /** P0-MCP-1: state koneksi — connected → (mati) reconnecting backoff → parked
   *  (retry manual); penutupan disengaja (uninstall/toggle) tidak memicu retry. */
  const mcpConns = new Map<
    string,
    { close: () => Promise<void>; toolNames: string[]; ping: () => Promise<boolean>; state: "connected" | "reconnecting" | "parked"; lastError: string | null; nextRetryAt: number | null }
  >();
  const mcpRetry = new Map<string, { timer: NodeJS.Timeout; attempt: number }>();
  const deliberateClose = new Set<string>();
  const RETRY_DELAYS = [2_000, 5_000, 15_000, 60_000, 300_000]; // backoff, cap 5 mnt

  function clearMcpRetry(name: string): void {
    const r = mcpRetry.get(name);
    if (r) clearTimeout(r.timer);
    mcpRetry.delete(name);
  }

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
        connected: conn?.state === "connected",
        toolCount: conn?.toolNames.length ?? 0,
        tools: conn?.toolNames.map((t) => t.replace(`mcp__${name}__`, "")) ?? [],
        state: conn?.state ?? "off",
        lastError: conn?.lastError ?? null,
        nextRetryAt: conn?.nextRetryAt ?? null,
      };
    });
  }

  async function disconnectMcp(name: string): Promise<void> {
    deliberateClose.add(name); // onclose transitif tak memicu auto-reconnect
    clearMcpRetry(name);
    const conn = mcpConns.get(name);
    if (conn) {
      mcpConns.delete(name);
      conn.toolNames.forEach((t) => registry.unregister(t));
      await conn.close().catch(() => undefined);
    }
    deliberateClose.delete(name);
  }

  /** P0-MCP-1: server mati/crash → lepas tools, jadwalkan reconnect backoff;
   *  setelah 5 percobaan gagal → PARKED (naikkan lagi manual dari panel MCP). */
  function onMcpDown(name: string, reason: string): void {
    if (deliberateClose.has(name)) return; // ditutup disengaja (toggle/uninstall)
    const conn = mcpConns.get(name);
    if (!conn || conn.state !== "connected") return; // sudah dalam siklus retry
    mcpConns.delete(name);
    conn.toolNames.forEach((t) => registry.unregister(t));
    void conn.close().catch(() => undefined);
    scheduleMcpRetry(name, reason);
  }

  function scheduleMcpRetry(name: string, err: string): void {
    const prev = mcpRetry.get(name);
    const attempt = (prev?.attempt ?? 0) + 1;
    if (attempt > RETRY_DELAYS.length) {
      clearMcpRetry(name);
      mcpConns.set(name, { close: async () => undefined, toolNames: [], ping: async () => false, state: "parked", lastError: err, nextRetryAt: null });
      moduleLogger("mcp").warn({ server: name, kind: "mcp", code: "MCP_PARKED" }, `parked after ${RETRY_DELAYS.length} reconnect attempts (${err}) — re-enable from the MCP panel`);
      return;
    }
    const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)]!;
    const nextRetryAt = Date.now() + delay;
    mcpConns.set(name, { close: async () => undefined, toolNames: [], ping: async () => false, state: "reconnecting", lastError: err, nextRetryAt });
    moduleLogger("mcp").warn({ server: name, kind: "mcp", code: "MCP_RECONNECT", attempt, retryInMs: delay }, `down (${err}) — reconnecting`);
    const timer = setTimeout(
      () => {
        void connectMcp(name)
          .then(() => clearMcpRetry(name))
          .catch((e: unknown) => scheduleMcpRetry(name, e instanceof Error ? e.message : String(e)));
      },
      delay,
    );
    mcpRetry.set(name, { timer, attempt });
  }

  async function connectMcp(name: string): Promise<boolean> {
    const cfg = mcpConfig?.mcpServers[name];
    if (!cfg) throw new Error(`server MCP tidak dideklarasikan di mcp.json: ${name}`);
    const entry = trustOf(trustConfig(), name);
    if (!entry?.trusted) throw new Error(`server MCP belum di-trust: ${name}`);
    const conn = await connectMcpServer(name, cfg, {
      denyTools: entry.denyTools,
      onCall: onMcpCall,
      onDown: (reason) => onMcpDown(name, reason),
      workspacePath: paths.workspacePath, // P1-MCP-4: mount utk cfg.sandbox
      // P1-MCP-6: daftar tool server berubah (notifikasi) → perbarui snapshot
      // status (McpPanel polling) — persona mengambil tool baru tanpa restart.
      onToolsChanged: (r) => {
        const c = mcpConns.get(name);
        if (c) c.toolNames = r.toolNames;
        moduleLogger("mcp").info({ server: name, added: r.added.length, removed: r.removed.length, total: r.toolNames.length }, "tool list changed");
      },
      connectTimeoutMs: 150_000,
    });
    clearMcpRetry(name);
    mcpConns.set(name, { ...conn, state: "connected", lastError: null, nextRetryAt: null });
    moduleLogger("mcp").info({ server: name, tools: conn.toolCount }, "connected");
    return true;
  }

  // Startup: connect semua server yang sudah di-trust (via helper di atas supaya
  // mcpConns terisi — connectMcpFromConfig hanya untuk pemakaian standalone).
  // Gagal startup → scheduleMcpRetry (sama seperti server mati): cold start
  // `uvx`/`npx` (unduh paket pertama) bisa timeout — retry backoff akan sukses
  // begitu cache terisi; tanpa ini server mati permanen sampai restart proses.
  for (const name of Object.keys(mcpConfig?.mcpServers ?? {})) {
    void connectMcp(name).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      moduleLogger("mcp").warn({ server: name }, `startup connect gagal: ${msg}`);
      scheduleMcpRetry(name, msg);
    });
  }

  // P0-MCP-1: health check — ping tiap 60 dtk (fix 2026-11: 30 dtk terlalu
  // sering — tiap recreate runtime di dev menumpuk ping & membebani; server
  // banyak → interval naik. stdio ping tetap murah, tapi jangan spam).
  const mcpHealthTimer = setInterval(() => {
    for (const [name, conn] of mcpConns) {
      if (conn.state !== "connected") continue;
      void conn.ping().then((ok) => {
        if (!ok) onMcpDown(name, "health check: ping gagal");
      });
    }
  }, 60_000);
  mcpHealthTimer.unref?.();

  // P0-DATA-2: housekeeping harian — boot (setelah heal menutup turn gantung)
  // + interval 24 jam; retensi 0 = mati.
  const housekeep = () => {
    if (env.eventsRetentionDays > 0) store.archiveOldEvents(env.eventsRetentionDays);
  };
  setTimeout(housekeep, 10_000).unref?.();
  const retentionTimer = setInterval(housekeep, 24 * 3_600_000);
  retentionTimer.unref?.();

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

  /** P1-PER-4: growth persona — dikurasi dari sesi/turn/task nyata. */
  function personaGrowth(): PersonaGrowth[] {
    return buildPersonaGrowth(
      listPersonas(paths.personasDir).map((p) => ({ id: p.manifest.id, name: p.manifest.name, domain: p.manifest.memory.domain })),
      store,
      projectStore,
    );
  }

  /** Menu Persona (2026-11): override bentuk geometri maskot — hanya entri
   *  yang dipilih user; tanpa entri = default web (PERSONA_SHAPE). */
  function personaShapes(): PersonaShapeOverride[] {
    const map = loadPersonaShapes(paths.workspacePath);
    return Object.entries(map)
      .filter(([, shape]) => shape)
      .map(([personaId, shape]) => ({ personaId, shape: shape as PersonaShapeOverride["shape"] }))
      .sort((a, b) => a.personaId.localeCompare(b.personaId));
  }

  function setPersonaShape(personaId: string, shape: string): PersonaShapeOverride {
    return savePersonaShape(
      paths.workspacePath,
      personaId,
      shape,
      listPersonas(paths.personasDir).map((p) => p.manifest.id),
    );
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
    // P1-MEM-6: + memori DOMAIN persona (lintas project) — juga frozen.
    const memExtra = memoryPromptSection(
      paths.workspacePath,
      projectId ? projectRoot(projectId) : null,
      persona.manifest.memory?.domain ?? null,
    );
    createSessionWithPrompt(store, persona, sessionId, persona.manifest.tools, paths.skillsDir, projectId ?? null, memExtra, skillBindingsFile()[persona.manifest.id]);
    // W5-C2 stub: 1 catatan preferensi (preview) per sesi baru — learning-loop P1
    appendUserPreferenceNote(paths.workspacePath, persona.manifest.name);
    const info = listPersonaInfos().find((p) => p.id === personaId)!;
    return { sessionId, persona: info, projectId: projectId ?? null };
  }

  /** P1-PRT-3: sesi terbaru lintas project — host.state/list_sessions remote. */
  function listRecentSessions(limit = 20): Array<{ sessionId: string; title: string; personaId: string; updatedAt: number }> {
    return store.listRecentSessions(limit).map((s) => ({
      sessionId: s.id,
      title: (s.title ?? "(no message)").slice(0, 60),
      personaId: s.personaId,
      updatedAt: s.updatedAt,
    }));
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
  /** P0-CORE-1: satu turn aktif per sesi — AbortController untuk Stop (HTTP + loop checks). */
  const turnAborts = new Map<string, AbortController>();
  /** P0-DEL-2: kontrol anak delegasi aktif (cancel/steer dari UI parent).
   *  Key = childSessionId; unregister otomatis oleh runner (finally). */
  const childControls = new Map<
    string,
    { parentSessionId: string; ctl: { abort: AbortController; steer: (text: string) => void; pause: () => void; resume: () => void } }
  >();

  /** Dipakai REST runTurn & dungeon runner (async — resolve saat turn selesai). */
  function runTurnInternal(sessionId: string, text: string): Promise<void> {
    // P1-CRED-2/3: admission control — cek rate limit & budget SEBELUM turn jalan.
    const emit = makeEmitter(store, EventBus, sessionId);
    const admit = admission.admitTurn(sessionId);
    if (!admit.ok) {
      emit({ type: "session.error", message: admit.reason ?? "turn ditolak", recoverable: true });
      return Promise.resolve();
    }
    if (admit.warn) {
      emit({ type: "session.error", message: `⚠ ${admit.warn} — turn tetap dijalankan (mode warn)`, recoverable: true });
    }
    const ac = new AbortController();
    turnAborts.set(sessionId, ac);
    return makeLoopFor(sessionId)
      .runTurn(sessionId, text, { signal: ac.signal })
      .finally(() => {
        turnAborts.delete(sessionId);
        admission.settleTurn(sessionId); // CRED-2: hold dilepas (actual sudah di ledger)
      });
  }

  function makeLoopFor(sessionId: string): AgentLoop {
    const cached = loopCache.get(sessionId);
    if (cached) return cached;
    const emit = makeEmitter(store, EventBus, sessionId);
    const approvals = new ApprovalEngine(emit, { sessionId, store }); // P0-DATA-3: persist
    const loop = new AgentLoop({
      store,
      provider,
      model,
      // P1-MDL-1: model per persona (override Settings → persona.yaml → default)
      // + fallback P0-CORE-2 dengan cooldown 5 mnt.
      routeModel: (personaId) => ({ ...modelRouter.route(personaId), markUnhealthy: modelRouter.markUnhealthy }),
      workspacePath: effectiveWorkspace(sessionId), // P1-PRJ-2: scope per sesi
      approvals,
      emit,
      mcpAllowlistFor, // P1-PRJ-5: binding MCP granular per project×persona
      auxModel: () => process.env.YUI_AUX_MODEL || process.env.YUI_LEARN_MODEL || model, // P0-CORE-4: kompresi pakai model murah (swap panas)
      recordUsage: (u) => { usageLedger.record(u); admission.noteUsage(); }, // CRED-1 meter + CRED-2 saldo cache
    });
    loopCache.set(sessionId, loop);
    return loop;
  }

  // ---- P1-MDL-2: smoke test model (tool-call 2 langkah) + fallback otomatis ----
  // Model gagal smoke → unhealthy (cooldown 5 mtn) → router langsung ke fallback;
  // lulus → cooldown dibersihkan. Auto setelah provider settings berubah;
  // manual via POST /api/settings/provider/smoke.
  let smokeResults: ModelSmokeResult[] = [];
  let smokeRunning = false;
  async function runModelSmoke(): Promise<ModelSmokeResult[]> {
    if (smokeRunning) return smokeResults; // sedang berjalan — pakai hasil terakhir
    smokeRunning = true;
    try {
      const models = new Set<string>([model, process.env.YUI_MODEL_FALLBACK ?? ""].filter(Boolean));
      for (const p of listPersonas(paths.personasDir)) {
        const r = modelRouter.route(p.manifest.id);
        if (r.model) models.add(r.model);
        if (r.fallback) models.add(r.fallback);
      }
      smokeResults = [];
      for (const m of models) {
        const r = await smokeModel(provider, m);
        if (r.ok) modelRouter.markHealthy(m);
        else modelRouter.markUnhealthy(m);
        smokeResults.push(r);
      }
      return smokeResults;
    } finally {
      smokeRunning = false;
    }
  }

  return {
    getModelSmoke: (): { running: boolean; results: ModelSmokeResult[] } => ({ running: smokeRunning, results: smokeResults }),
    runModelSmoke: () => runModelSmoke(),
    // P0-DATA-2: housekeeping retention — pindahkan events lama ke arsip.
    // Dipanggil manual (REST) & otomatis (boot + interval harian); retensi dari
    // YUI_EVENTS_RETENTION_DAYS (0 = mati).
    housekeepEvents: (nowMs?: number): { archived: number; sessions: number } => {
      const r = store.archiveOldEvents(env.eventsRetentionDays, nowMs);
      if (r.archived > 0) moduleLogger("data").info({ ...r, retentionDays: env.eventsRetentionDays }, "events diarsipkan (retention)");
      return r;
    },
    // P1-CRED-1: metering ledger — summary rollup + feed event terbaru.
    getUsageSummary: (filter: { projectId?: string; sessionId?: string; personaId?: string; since?: number } = {}) =>
      usageLedger.summary(filter),
    getUsageRecent: (limit = 50, filter: { projectId?: string; sessionId?: string; personaId?: string; since?: number } = {}) =>
      usageLedger.recent(limit, filter),
    paths,
    store,
    bus: EventBus,
    /** Batch 12 (P2-VLT): vault kredensial — utk REST metadata & fill. */
    vault,
    /** Matikan runtime dengan rapi — dipanggil saat runtime DI-REPLACE (HMR dev:
     *  module lib/runtime di-reval → runtime baru; yang lama harus mati total,
     *  kalau tidak proses MCP stdio lama jadi ZOMBIE yang menumpuk tiap recompile
     *  — feedback user dev-10: armada MCP reconnect penuh berulang kali).
     *  Turn yang masih berjalan di loop lama tetap menyelesaikan dirinya
     *  (data lewat file DB yang sama; event lewat bus globalThis). */
    dispose: async () => {
      clearInterval(mcpHealthTimer);
      for (const name of [...mcpConns.keys()]) await disconnectMcp(name); // matikan proses stdio anak + unregister tools
      for (const r of mcpRetry.values()) clearTimeout(r.timer); // retry tertunda (parked/reconnecting)
      mcpRetry.clear();
      // P2-STU-2: matikan sesi terminal (shell host / container sandbox).
      try { await terminal.closeAll(); } catch { /* shutdown best-effort */ }
      // Batch 12 (P2-VLT-2): sisa run-only dari turn yang mati dibersihkan;
      // singleton vault (globalThis) TETAP hidup lintas HMR — db handle-nya
      // WAL-safe, sama seperti store sesi (DELIBERAT: tidak di-close).
      // DELIBERAT: koneksi sqlite TIDAK ditutup — turn yang masih berjalan di
      // loop lama memakai objek store ini (WAL aman multi-handle; kebocoran
      // handle per HMR jauh lebih ringan daripada mematikan turn in-flight).
    },
    listPersonas: listPersonaInfos,
    personaGrowth,
    personaShapes,
    setPersonaShape,
    createSession,
    listProjectSessions,
    listRecentSessions,
    runTurn: (sessionId: string, text: string) => runTurnInternal(sessionId, text),
    /** Batalkan turn sesi (tombol Stop). true bila ada turn aktif yang dibatalkan.
     *  P0-DEL-2: CASCADE — membatalkan turn parent sekaligus membatalkan semua
     *  anak delegasi turn itu (dulu anak lanjut sendiri di background). */
    cancelTurn: (sessionId: string) => {
      const ac = turnAborts.get(sessionId);
      if (!ac) return false;
      ac.abort();
      turnAborts.delete(sessionId);
      for (const [childId, c] of childControls) {
        if (c.parentSessionId === sessionId) {
          c.ctl.abort.abort();
          childControls.delete(childId);
        }
      }
      return true;
    },
    // ---- P0-DEL-2: cancel/steer anak delegasi dari UI parent ----
    cancelDelegation: (childSessionId: string) => {
      const c = childControls.get(childSessionId);
      if (!c) return false;
      c.ctl.abort.abort(); // unregister ditangani finally runner
      return true;
    },
    steerDelegation: (childSessionId: string, text: string) => {
      const c = childControls.get(childSessionId);
      const t = text.trim();
      if (!c || !t) return false;
      c.ctl.steer(t);
      return true;
    },
    // ---- P1-DEL-3: pause/resume anak delegasi ----
    pauseDelegation: (childSessionId: string) => {
      const c = childControls.get(childSessionId);
      if (!c) return false;
      c.ctl.pause(); // event delegation.paused ke parent via runner
      return true;
    },
    resumeDelegation: (childSessionId: string) => {
      const c = childControls.get(childSessionId);
      if (!c) return false;
      c.ctl.resume();
      return true;
    },
    resolveApproval: (requestId: string, approved: boolean, remember = false) =>
      resolvePendingApproval(requestId, approved, remember),
    emitSessionError: (sessionId: string, message: string) => {
      const e = store.appendEvent(sessionId, { type: "session.error", message, recoverable: false });
      EventBus.publish(sessionId, e);
    },
    getEvents: (sessionId: string, since = 0): YuiEvent[] => store.getEvents(sessionId, since),
    subscribe: (sessionId: string, listener: (e: YuiEvent) => void) => EventBus.subscribe(sessionId, listener),
    subscribeAll: (listener: (e: YuiEvent) => void) => EventBus.subscribeAll(listener),
    // ---- projects (P1-PRJ-1, PLAN §13.1) ----
    createProject: (name: string, description = "") => {
      const id = `p_${randomUUID().slice(0, 8)}`;
      const rootPath = `projects/${id}`; // relatif terhadap workspace — diisolasi penuh di P1-PRJ-2
      for (const sub of ["code", "docs", "reports"]) {
        fs.mkdirSync(path.join(paths.workspacePath, rootPath, sub), { recursive: true });
      }
      return projectStore.createProject({ id, name, description, rootPath });
    },
    // ---- Dungeon (P1-DUN-1): arena latihan persona — ruangan sandbox ----
    listDungeons: () => {
      const missions = loadMissions(paths.workspacePath);
      return missions.map((m) => ({ mission: m, runs: dungeonRunner.runs(m.id) }));
    },
    startDungeonRun: (missionId: string) => {
      const m = loadMissions(paths.workspacePath).find((x) => x.id === missionId);
      if (!m) throw new Error(`misi dungeon tidak ditemukan: ${missionId}`);
      return dungeonRunner.start(m);
    },
    // ---- P1-DUN-4: latihan buatan user (halaman Dungeon) ----
    createDungeonMission: (input: {
      personaId: string;
      title: string;
      goal: string;
      skillName: string;
      skillDescription: string;
      resources?: string[];
      acceptance: string[];
    }) => {
      if (!listPersonas(paths.personasDir).some((p) => p.manifest.id === input.personaId)) throw new Error(`persona '${input.personaId}' tidak dikenal`);
      return writeMission(paths.workspacePath, {
        title: input.title,
        persona: input.personaId,
        goal: input.goal,
        resources: input.resources?.filter((r) => r.trim()).map((r) => r.trim()),
        acceptance: input.acceptance,
        skillName: input.skillName,
        skillDescription: input.skillDescription,
      });
    },
    /** Simpan bahan ajar user ke <dungeon>/materials/<nama> + catat sebagai sumber misi. */
    writeDungeonMaterial: (slug: string, name: string, bytes: Buffer) => {
      const safe = sanitizeMaterialName(name);
      if (!safe || safe.includes("..")) throw new Error("nama file tidak valid");
      const dir = path.join(dungeonsDir(paths.workspacePath), slug, "materials");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, safe), bytes);
      appendMissionResource(paths.workspacePath, slug, `materials/${safe}`);
      return `materials/${safe}`;
    },
    deleteDungeonMission: (slug: string) => deleteMission(paths.workspacePath, slug),
    listProjects: () => projectStore.listProjects(),
    getProject: (id: string) => projectStore.getProject(id),
    /** P1-PRJ-8 (request user): hapus project + SEMUA artefak terkait — sesi &
     *  eventnya, task + project_events, file workspace (termasuk MEMORY.md project
     *  & uploads), revisi file, baris audit MCP, ruangan+dungeon run (kalau kind
     *  dungeon). YANG DIPERTAHANKAN: skill persona (milik persona — keputusan user)
     *  & usage ledger (akuntansi metering jujur; baris tinggal historis). */
    deleteProject: (id: string): DeleteProjectResult => {
      const project = projectStore.getProject(id);
      if (!project) throw new Error(`project tidak ditemukan: ${id}`);
      // 1. Batalkan turn in-flight sesi project ini (turnAborts → loop batal;
      //    loopCache dibuang agar turn finalizer tak menulis setelah baris dihapus).
      const sessions = store.listProjectSessions(id).map((s) => s.id);
      for (const sid of sessions) {
        turnAborts.get(sid)?.abort();
        turnAborts.delete(sid);
        loopCache.delete(sid);
      }
      // 2. Baris DB: sesi + events/messages/approvals → audit MCP milik sesi itu.
      const delSessions = store.deleteProjectSessions(id);
      const auditRows = mcpAudit.deleteForSessions(sessions);
      // 3. Revisi file project (prefix = root project) lalu seluruh dir workspace-
      //    project (file, uploads/, reports/, MEMORY.md project, roster, runs dungeon).
      const root = path.join(paths.workspacePath, project.rootPath);
      const revisions = fileRevisions.deleteRevisionsUnder(root + path.sep);
      fs.rmSync(root, { recursive: true, force: true });
      // 4. Terakhir: baris project itu sendiri (tasks + project_events + projects).
      const delProject = projectStore.deleteProjectData(id);
      return {
        ok: true,
        projectId: id,
        name: project.name,
        kind: project.kind ?? "project",
        deleted: {
          sessions: delSessions.sessions,
          events: delSessions.events,
          approvals: delSessions.approvals,
          tasks: delProject.tasks,
          projectEvents: delProject.projectEvents,
          revisions,
          auditRows,
          workspaceDir: root,
        },
        keptUsage: true,
        keptSkills: true,
      };
    },
    // P2-STU-3 v0: tab File — tree + baca file, scoped dir project (anti traversal).
    listProjectFiles: (id: string) => {
      const p = projectStore.getProject(id);
      if (!p) throw new Error("project tidak ditemukan");
      // rootPath relatif thd workspace — WAJIB lewat projectRoot (fix: dulu readdir
      // relatif terhadap cwd Next apps/web → tree selalu kosong).
      return buildFileTree(projectRoot(id));
    },
    // P2-STU-2: root absolut project utk sesi terminal (tab Terminal).
    projectWorkspacePath: (id: string) => projectRoot(id),
    readProjectFile: (id: string, relPath: string) => {
      const p = projectStore.getProject(id);
      if (!p) throw new Error("project tidak ditemukan");
      return readProjectFile(projectRoot(id), relPath);
    },
    // P2-STT-3: revisi & diff — snapshot lama direkam otomatis oleh write_file.
    listFileRevisions: (id: string, relPath: string) => {
      const p = projectStore.getProject(id);
      if (!p) throw new Error("project tidak ditemukan");
      return fileRevisions.listRevisions(safeProjectPath(projectRoot(id), relPath));
    },
    readFileRevision: (id: string, relPath: string, rev: number) => {
      const p = projectStore.getProject(id);
      if (!p) throw new Error("project tidak ditemukan");
      return fileRevisions.getRevision(safeProjectPath(projectRoot(id), relPath), rev);
    },
    /** dev-10: simpan file upload user (pdf/xlsx/…) ke root proyek (uploads/…). */
    writeProjectUpload: async (id: string, rel: string, data: Buffer) => {
      const p = projectStore.getProject(id);
      if (!p) throw new Error("project tidak ditemukan");
      const abs = safeProjectPath(projectRoot(id), rel);
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      await fs.promises.writeFile(abs, data);
    },
    /** P0-DEL-1: riwayat job delegasi persist (audit/monitor lintas restart).
     *  projectId = project sesi parent; undefined/null = semua. */
    delegationJobs: (projectId?: string | null) => store.listDelegationJobs(projectId ?? undefined),
    /** Diagram Tim: SEMUA edge delegasi lintas sesi di proyek (grandchild ikut,
     *  relasi nyata dari event — bukan asumsi urutan persona). */
    getProjectDelegations: (id: string) => {
      const p = projectStore.getProject(id);
      if (!p) throw new Error("project tidak ditemukan");
      const sessions = store.listProjectSessions(id);
      const edges = new Map<string, import("@yuika/contracts").DelegationEdge>();
      for (const s of sessions) {
        for (const e of store.getEvents(s.id)) {
          if (e.type === "delegation.started") {
            edges.set(e.childSessionId, {
              parentSessionId: s.id,
              parentPersonaId: s.personaId,
              childSessionId: e.childSessionId,
              personaId: e.personaId,
              goal: e.goal,
              status: "running",
              startedAt: e.ts,
            });
          } else if (e.type === "delegation.progress") {
            const t = edges.get(e.childSessionId);
            if (t) t.state = e.state;
          } else if (e.type === "delegation.done") {
            const t = edges.get(e.childSessionId);
            if (t) {
              t.status = "done";
              t.doneAt = e.ts;
              t.summary = e.summary;
            }
          }
        }
      }
      return [...edges.values()];
    },
    updateProject: (id: string, patch: { name?: string; description?: string; status?: "active" | "archived" }) =>
      projectStore.updateProject(id, patch),
    // ---- tasklist project (P1-PRJ-4) ----
    listProjectTasks: (projectId: string) => projectStore.listTasks(projectId),
    createProjectTask: (
      projectId: string,
      title: string,
      assignee?: string | null,
      parentId?: string | null,
      detail?: { description?: string | null; acceptance?: string[]; dependsOn?: string[]; estimate?: string | null; phase?: TaskItem["phase"] },
    ) =>
      projectStore.createTask({
        id: `t_${randomUUID().slice(0, 8)}`,
        projectId,
        title,
        assignee: assignee ?? null,
        parentId: parentId ?? null,
        description: detail?.description ?? null,
        acceptance: detail?.acceptance ?? [],
        dependsOn: detail?.dependsOn ?? [],
        estimate: detail?.estimate ?? null,
        phase: detail?.phase ?? null,
      }),
    updateProjectTask: (
      taskId: string,
      patch: {
        title?: string;
        status?: "todo" | "doing" | "review" | "done";
        assignee?: string | null;
        addRefs?: string[];
        addArtefak?: string[];
        description?: string | null;
        acceptance?: string[];
        dependsOn?: string[];
        estimate?: string | null;
        phase?: TaskItem["phase"];
      },
    ) => projectStore.updateTask(taskId, patch),
    /** TaskTree (P1-PRJ-7): pohon utuh dari replay event project — tanpa state kedua. */
    getTaskTree: (projectId: string) => taskTreeFromEvents(projectStore.listEvents(projectId)),
    // ---- MCP trust/audit (P1-MCP-3) ----
    /** Status semua server: deklarasi mcp.json + trust workspace + koneksi live. */
    mcpServerStatuses: serverStatuses,
    /** P0-MCP-1: hubungkan ulang sekarang (tombol ↻ di panel — bypass backoff). */
    mcpRetryConnect: async (name: string) => {
      await disconnectMcp(name); // pastikan entry lama (parked/karius) dilepas
      await connectMcp(name);
    },
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
      kind: providerKind,
      baseUrl: providerBaseUrl,
      model,
      fallbackModel: process.env.YUI_MODEL_FALLBACK ?? "",
      auxModel: process.env.YUI_AUX_MODEL ?? process.env.YUI_LEARN_MODEL ?? "",
      hasApiKey: Boolean(process.env.YUI_API_KEY),
      keyPreview: process.env.YUI_API_KEY ? `…${process.env.YUI_API_KEY.slice(-4)}` : "",
    }),
    // P1-MDL: model per persona — override untuk UI Settings (sumber: file JSON).
    // P1-MDL-3: price book — indikator biaya metering (per persona/model).
    getModelPrices: () => loadPriceBook(modelPricesFile),
    // Mode approval: GET/PUT (persist file — survive restart; global lintas sesi).
    approvalMode: () => getApprovalMode(),
    setApprovalMode: (mode: ApprovalMode) => {
      setApprovalMode(mode);
      fs.mkdirSync(path.dirname(approvalModeFile), { recursive: true });
      fs.writeFileSync(approvalModeFile, JSON.stringify({ mode }, null, 2), "utf-8");
    },
    // Mapping manual skill → persona (menu Dungeon): payload UI + toggle persist.
    getSkillBindings: () => {
      const bindings = skillBindingsFile();
      // Skill siap pakai + DRAF (feedback user: hasil latihan mandiri harus bisa
      // diterima & dipasang langsung dari sini — jalur terima di tab Skill hanya
      // ada saat project aktif, jadikan mapping self-sufficient).
      const skills = [
        ...listSkills(paths.skillsDir).map((s) => ({ name: s.name, description: s.description, status: s.status, slug: null as string | null })),
        ...listDrafts(paths.skillsDir).map((s) => ({
          name: s.name,
          description: s.description,
          status: s.status,
          slug: path.basename(s.dir),
        })),
      ];
      const personas = listPersonas(paths.personasDir).map((p) => {
        const bundled = p.manifest.skills.bundled;
        const b = bindings[p.manifest.id];
        const effective = effectiveSkillNames(bundled, b, undefined);
        return {
          id: p.manifest.id,
          name: p.manifest.name,
          bundled,
          attached: b?.attached ?? [],
          detached: b?.detached ?? [],
          effective: [...effective],
        };
      });
      return { skills, personas };
    },
    setSkillBinding: (personaId: string, skill: string, action: "attach" | "detach") => {
      const personas = listPersonas(paths.personasDir);
      const persona = personas.find((p) => p.manifest.id === personaId);
      if (!persona) throw new Error(`persona tidak ditemukan: ${personaId}`);
      if (!listSkills(paths.skillsDir).some((s) => s.name === skill)) throw new Error(`skill tidak ditemukan: ${skill}`);
      const data = skillBindingsFile();
      data[personaId] = applyBindingAction(data[personaId], skill, persona.manifest.skills.bundled, action);
      saveSkillBindings(skillBindingsPath, data);
      return data[personaId]!;
    },
    updateModelPrice: (model: string, price: ModelPrice) => saveModelPrice(modelPricesFile, model, price),
    // P1-CRED-2/3/4: budget & admission + attribution matrix.
    getBudgetStatus: () => admission.status(),
    updateBudget: (input: UpdateBudgetRequest) => {
      admission.updateConfig(input);
      return admission.status();
    },
    getUsageMatrix: (filter: UsageFilter = {}) => usageMatrixWithCost(usageLedger, modelPricesFile, filter),
    /** P1-INF-4: trace per turn — event store + ledger digabung jadi timeline. */
    getTrace: (sessionId: string) => buildTrace(store, usageLedger, sessionId),
    getModelRoutes: () => ({
      defaultModel: model,
      defaultFallback: process.env.YUI_MODEL_FALLBACK ?? "",
      overrides: loadModelOverrides(modelOverridesFile),
      personas: listPersonas(paths.personasDir).map((p) => ({ id: p.manifest.id, name: p.manifest.name })),
    }),
    /** Simpan override model satu persona ("" = hapus → ikut default). loopCache.clear()
     *  supaya sesi baru langsung memakai route baru. */
    updateModelRoute: (personaId: string, o: { model?: string; fallback?: string }) => {
      if (!listPersonas(paths.personasDir).some((p) => p.manifest.id === personaId)) throw new Error(`persona ${personaId} tidak dikenal`);
      saveModelOverride(modelOverridesFile, personaId, o);
      loopCache.clear();
    },
    /** Update provider/model: swap in-memory (sesi baru langsung pakai; loopCache
     *  dikosongkan) + persist ke .env agar bertahan restart. apiKey kosong = keep. */
    updateProviderSettings: (input: { kind?: string; baseUrl?: string; apiKey?: string; model?: string; fallbackModel?: string | null; auxModel?: string | null }) => {
      const envFile = path.join(resolveRepoRoot(), ".env");
      const toWrite: Record<string, string | null> = {};
      if (input.kind && (input.kind === "openai-compat" || input.kind === "anthropic" || input.kind === "gemini") && input.kind !== providerKind) {
        providerKind = input.kind;
        provider = makeProvider(providerBaseUrl, process.env.YUI_API_KEY ?? cfg.provider.apiKey);
        toWrite.YUI_PROVIDER_KIND = providerKind;
        process.env.YUI_PROVIDER_KIND = providerKind;
      }
      if (input.baseUrl?.trim()) {
        providerBaseUrl = input.baseUrl.trim();
        provider = makeProvider(providerBaseUrl, process.env.YUI_API_KEY ?? cfg.provider.apiKey);
        toWrite.YUI_BASE_URL = providerBaseUrl;
        process.env.YUI_BASE_URL = providerBaseUrl;
      }
      if (input.apiKey?.trim()) {
        provider = makeProvider(providerBaseUrl, input.apiKey.trim());
        toWrite.YUI_API_KEY = input.apiKey.trim();
        process.env.YUI_API_KEY = input.apiKey.trim();
      }
      if (input.model?.trim()) {
        model = input.model.trim();
        toWrite.YUI_MODEL = model;
        process.env.YUI_MODEL = model;
      }
      if (input.auxModel !== undefined) {
        if (input.auxModel?.trim()) {
          toWrite.YUI_AUX_MODEL = input.auxModel.trim();
          process.env.YUI_AUX_MODEL = input.auxModel.trim();
        } else {
          delete process.env.YUI_AUX_MODEL;
          delete process.env.YUI_LEARN_MODEL; // alias lama ikut bersih
        }
      }
      if (input.fallbackModel !== undefined) {
        if (input.fallbackModel?.trim()) {
          toWrite.YUI_MODEL_FALLBACK = input.fallbackModel.trim();
          process.env.YUI_MODEL_FALLBACK = input.fallbackModel.trim();
        } else {
          toWrite.YUI_MODEL_FALLBACK = null; // hapus dari .env (dulu: nilai lama hidup lagi setelah restart)
          delete process.env.YUI_MODEL_FALLBACK;
        }
      }
      if (input.auxModel !== undefined) {
        if (input.auxModel?.trim()) {
          toWrite.YUI_AUX_MODEL = input.auxModel.trim();
          toWrite.YUI_LEARN_MODEL = null; // alias lama dibersihkan
          process.env.YUI_AUX_MODEL = input.auxModel.trim();
          delete process.env.YUI_LEARN_MODEL;
        } else {
          toWrite.YUI_AUX_MODEL = null;
          toWrite.YUI_LEARN_MODEL = null;
          delete process.env.YUI_AUX_MODEL;
          delete process.env.YUI_LEARN_MODEL;
        }
      }
      if (Object.keys(toWrite).length > 0) {
        updateEnvFile(envFile, toWrite);
        loopCache.clear(); // sesi berikutnya memakai provider/model baru
        // P1-MDL-2: smoke ulang di background — model baru gagal smoke → fallback otomatis
        void runModelSmoke();
      }
      return { ok: true, note: "Sesi baru & turn berikutnya memakai config baru (loopCache dikosongkan; .env diperbarui)." };
    },
    // ---- Skills (P1-MEM-3): draf → validasi → siap pakai ----
    listSkillsWithDrafts: () => {
      const drafts = safeList(() => listDrafts(paths.skillsDir));
      const skills = safeList(() => listSkills(paths.skillsDir));
      return {
        drafts: drafts.map((s) => ({ slug: path.basename(s.dir), name: s.name, description: s.description, body: s.body, usage: readUsage(s.dir), status: s.status, personas: s.personas })),
        skills: skills.map((s) => ({ name: s.name, description: s.description, usage: readUsage(s.dir), status: s.status, personas: s.personas, eval: readEval(s.dir) })),
      };
    },
    /** P1-DUN-3: eval buta skill `tested` (nama/slug) — fire-and-forget;
     *  hasil di-polling via listSkillsWithDrafts (field `eval`). */
    evalSkill: (nameOrSlug: string) => {
      const skill = listSkills(paths.skillsDir).find((s) => s.name === nameOrSlug || path.basename(s.dir) === nameOrSlug);
      if (!skill) throw new Error(`skill aktif '${nameOrSlug}' tidak ditemukan`);
      if (skill.status !== "tested") throw new Error(`skill '${skill.name}' berstatus ${skill.status} — hanya skill 'tested' yang bisa dieval (accept draft dulu)`);
      const ev = readEval(skill.dir);
      if (ev?.verdict === "pending") throw new Error("eval sedang berjalan — tunggu selesai");
      const mission = missionForSkill(loadMissions(paths.workspacePath), skill.name);
      if (!mission) throw new Error(`tidak ada misi dengan target skill '${skill.name}' — eval buta butuh kriteria acceptance dari misi`);
      void skillEvaluator.evaluate(mission, { name: skill.name, dir: skill.dir });
      return { ok: true, skill: skill.name };
    },
    updateSkillDraft: (input: { slug: string; name: string; description: string; body: string }) =>
      updateDraft(paths.skillsDir, input.slug, input.name, input.description, input.body),
    acceptSkillDraft: (slug: string) => acceptDraft(paths.skillsDir, slug),
    rejectSkillDraft: (slug: string) => rejectDraft(paths.skillsDir, slug),
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
    /** P1-DUN-5: skill readiness persona di roster (assign gating) — dari
     *  inventory skill global (tested/ready = siap; draft tidak dihitung). */
    getRosterReadiness: (projectId: string) =>
      computeReadiness(
        loadRoster(projectRoot(projectId)),
        listSkills(paths.skillsDir).map((s) => ({ name: s.name, category: s.frontmatter.metadata?.yui?.category, personas: s.personas, status: s.status })),
      ),
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
    // ---- workflow (P2-FLOW) ----
    workflowEngine,
    listWorkflowRuns: (projectId: string) => projectStore.listWorkflowRuns(projectId),
    getWorkflowRun: (runId: string) => projectStore.getWorkflowRun(runId),
    // ---- P2-STU-4: browser read-only (tab Browser) ----
    /** Baca halaman via allowlist proxy (sanitized). byRole utk riwayat kunjungan. */
    getBrowserPage: async (projectId: string, rawUrl: string, byRole: "agent" | "user") => {
      const p = projectStore.getProject(projectId);
      if (!p) throw new Error("project tidak ditemukan");
      const policy = readBrowserPolicy(projectRoot(projectId));
      const page = await readBrowserPage(rawUrl, {
        allow: policy.allow,
        allowAll: policy.allowAll,
        allowPrivate: process.env.YUI_BROWSER_ALLOW_PRIVATE === "1",
      });
      projectStore.addBrowserVisit({ projectId, url: page.url, title: page.title, byRole });
      return page;
    },
    /** Policy browser project (allowlist + allowAll) — dipakai tab Browser. */
    getBrowserPolicy: (projectId: string) => {
      if (!projectStore.getProject(projectId)) throw new Error("project tidak ditemukan");
      return readBrowserPolicy(projectRoot(projectId));
    },
    setBrowserPolicy: (projectId: string, patch: { allow?: string[]; allowAll?: boolean }) => {
      if (!projectStore.getProject(projectId)) throw new Error("project tidak ditemukan");
      const cur = readBrowserPolicy(projectRoot(projectId));
      writeBrowserPolicy(projectRoot(projectId), {
        allow: patch.allow ?? cur.allow,
        allowAll: patch.allowAll ?? cur.allowAll,
      });
      return readBrowserPolicy(projectRoot(projectId));
    },
    listBrowserVisits: (projectId: string, limit?: number) => projectStore.listBrowserVisits(projectId, limit),
  };
}
