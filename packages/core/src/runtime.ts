import { deleteDesignFilesForProject, listDesignFiles } from "./design/store.js";
// @yuika/core, runtime wiring: satu factory untuk seluruh kernel (dipakai apps/web).
// DEMO-SHORTCUT: core berjalan in-process di Next.js; P0 memisah jadi service + worker.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PersonaInfo, type DeleteProjectResult, type McpServerStatus, type PersonaGrowth, type PersonaShapeOverride, type RosterEntry as RosterEntryIn, type TaskItem, type UpdateBudgetRequest, type UsageFilter, type YuiEvent } from "@yuika/contracts";
import { createSessionStore, type ISessionStore } from "./session/store.js";
import { moduleLogger } from "./logger.js";
import { executePendingWipe } from "./reset.js";
import { makeEmitter } from "./session/emit.js";
import { EventBus } from "./bus.js";
import { OpenAICompatProvider } from "./provider/openai-compat.js";
import { AnthropicProvider } from "./provider/anthropic.js";
import { GeminiProvider } from "./provider/gemini.js";
import type { ProviderAdapter } from "./provider/adapter.js";
import type { ProviderKind } from "./provider/index.js";
import { AgentLoop } from "./loop.js";
import { registry } from "./registry.js";
import { ApprovalEngine, resolvePendingApproval, getApprovalMode, setApprovalMode, type ApprovalMode } from "./approval/engine.js";
import { listPersonas } from "./personas/loader.js";
import { buildPersonaGrowth } from "./personas/growth.js";
import { loadPersonaShapes, savePersonaShape } from "./personas/shapes.js";
import type { PersonaRename, PersonaRenamesResponse } from "@yuika/contracts";
import { loadPersonaRenames, savePersonaRename, clearPersonaRename as clearPersonaRenameWs } from "./personas/rename.js";
import {
  createCustomPersona as createCustomPersonaWs,
  updateCustomPersona as updateCustomPersonaWs,
  deleteCustomPersona as deleteCustomPersonaWs,
  exportPersona as exportPersonaWs,
  importPersona as importPersonaWs,
} from "./personas/custom.js";
import { CUSTOM_ALLOWED_TOOLS, CustomPersonaResult, PersonaShareFile, type CreateCustomPersonaRequest, type ForgeKit, type UpdateCustomPersonaRequest } from "@yuika/contracts";
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
import { registerWorkshopTool } from "./tools/workshop-tool.js";
import { registerScreenTools } from "./tools/screen-tools.js";
import { registerQaTools } from "./tools/qa-tools.js";
import { closeAllScreens } from "./screen/manager.js";
import * as terminal from "./terminal/manager.js";
import { registerDelegateTool } from "./tools/delegate-tool.js";
import { registerConsultTool } from "./tools/consult-tool.js";
import { registerTodoTools } from "./tools/todo-tools.js";
import { connectMcpFromConfig, connectMcpServer, type McpCallInfo, type McpRegistry } from "./mcp/client.js";
import { MCP_CATALOG } from "./mcp/catalog.js";
import { installFromCatalog, uninstallFromConfig, mergeMcpConfig, readUserConfig } from "./mcp/install.js";
import { McpAuditStore } from "./mcp/audit.js";
import { UsageLedger } from "./usage/ledger.js";
import { loadPriceBook, saveModelPrice } from "./model-prices.js";
import { AdmissionControl, usageMatrixWithCost } from "./budget.js";
import { buildTrace, buildProjectActivity } from "./session/trace.js";
import { buildProjectDashboard, scanProjectSignals } from "./project/dashboard.js";
import { WorkshopManager } from "./workshop/manager.js";
import { WorkshopStore } from "./workshop/store.js";
import type { ModelPrice } from "@yuika/contracts";
import { loadTrust, trustOf, upsertTrust } from "./mcp/trust.js";
import { appendUserPreferenceNote } from "./memory/usermd.js";
import { memoryPromptSection, readMemory, saveMemory } from "./memory/manager.js";
import { registerMemoryTools } from "./tools/memory-tools.js";
import { registerSessionSearchTools } from "./tools/session-search.js";
import { registerDocTools } from "./tools/doc-tools.js";
import { registerDesignTools } from "./tools/design-tools.js";
import { resolvePaths, resolveRepoRoot, type YuiPaths } from "./paths.js";
import { buildBackupBundle, restoreScriptText, type BackupBundle } from "./backup/bundle.js";
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
  // D70: selesaikan reset tertunda SEBELUM store mana pun membuka file —
  // proses baru saja direstart supervisor (exit 87), semua handle bebas.
  const pendingWipe = executePendingWipe(paths);
  if (pendingWipe) {
    moduleLogger("runtime").info(
      { scope: pendingWipe.scope, deleted: pendingWipe.deleted.length, failures: pendingWipe.failures.length },
      "reset: pending wipe executed, booting fresh",
    );
  }
  fs.mkdirSync(paths.workspacePath, { recursive: true });
  // Dir bersama untuk MCP filesystem (katalog: "{workspace}/reports").
  // Dir per-project dibuat saat project lahir, tapi level-atas ini tidak
  // pernah dibuat oleh siapa pun: deployment baru (volume Docker kosong)
  // membuat server filesystem skip semua direktorinya. Satu mkdir di boot
  // menutup Docker + desktop sekaligus.
  fs.mkdirSync(path.join(paths.workspacePath, "reports"), { recursive: true });
  // MCP git (mcp-server-git --repository {workspace}) menuntut path yang
  // SUDAH jadi repository git; tanpa ini server git mati di boot ("not a
  // valid Git repository"). Init sekali, idempoten — repo lokal kerja
  // agent (status/diff/commit), bukan remote. Nested repo per-project aman
  // (tampil untracked/gitlink saja).
  try {
    if (!fs.existsSync(path.join(paths.workspacePath, ".git"))) {
      execFileSync("git", ["init", "-q"], { cwd: paths.workspacePath, stdio: "pipe" });
    }
  } catch {
    // git tak ada di PATH (jarang): MCP git akan gagal sendiri; fitur lain aman.
  }

  const store: ISessionStore = createSessionStore(paths.dbPath);
 // approval pending dari proses sebelumnya → expired (turn-nya mati
  // bersama proses lama); kartu di UI ditandai lewat event approval.expired.
  store.expirePendingApprovals();

 // ---- : dungeon runner (arena latihan; ruangan = project sandbox) ----
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
  // lama (server direstart saat berjalan) ditutup jujur, anti UI "berjalan"
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

 // ---- : eval buta tested→ready (hakim = sesi fresh, lihat §13.8) ----
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
 // (P2-WKS): workshop persisten, registry SQLite lokal sendiri
  // (koneksi kedua file sama, WAL) karena workshop = artefak host-local.
  const workshopStore = new WorkshopStore(paths.dbPath);
  const workshopManager = new WorkshopManager({
    store: workshopStore,
    workspaceRootOf: (pid) => {
      try {
        return projectRoot(pid);
      } catch {
        return paths.workspacePath; // project terhapus → fallback aman
      }
    },
  });
  workshopManager.startIdleWatchdog();
  // D114: sapu workshop yatim saat boot (container/volume yuika-ws-* tanpa
  // project; row registry tua). Fire-and-forget: docker lambat/tak ada tidak
  // boleh menahan boot api.
  void workshopManager
    .sweepOrphans(projectStore.listProjects().map((p) => p.id))
    .catch((e: unknown) => moduleLogger("runtime").warn({ err: String(e) }, "workshop orphan sweep gagal (dilewati)"));
  // Settings: provider & model bisa di-swap panas (updateProviderSettings),
  // sesi baru langsung pakai; loopCache dikosongkan; delegateDeps objek yang
  // sama dimutasi propertinya agar delegasi ikut provider baru.
  let providerKind: ProviderKind = (cfg.provider.kind as ProviderKind | undefined) ?? "openai-compat";
  let provider = makeProvider(cfg.provider.baseUrl, cfg.provider.apiKey);
  let providerBaseUrl = cfg.provider.baseUrl;
  // Lazy-config (D49): apiKey dilacak eksplisit — runtime boleh boot dengan
  // nilai kosong; providerConfigured() menutup celah trio-kosong vs swap panas.
  let providerApiKey = cfg.provider.apiKey;

 /** satu titik pembuatan provider, adapter per kind. Lazy-config (D49):
   *  trio kosong -> stub yang melempar pesan jelas (SDK asli menolak
   *  konstruksi dengan apiKey kosong; runtime tetap boleh boot). */
  function makeProvider(baseUrl: string, apiKey: string) {
    if (!baseUrl || !apiKey) {
      return {
        id: "unconfigured",
        chatStream: async () => {
          throw new Error("Provider is not configured. Open Settings, set base URL, API key and model, then try again.");
        },
      } satisfies ProviderAdapter;
    }
    return providerKind === "anthropic"
      ? new AnthropicProvider({ baseUrl, apiKey })
      : providerKind === "gemini"
        ? new GeminiProvider({ baseUrl, apiKey })
        : new OpenAICompatProvider({ baseUrl, apiKey });
  }
  let model = cfg.provider.model;
 // override per persona (diedit di Settings), file JSON di samping DB.
  const modelOverridesFile = path.join(path.dirname(paths.dbPath), "model-overrides.json");
  const modelPricesFile = path.join(path.dirname(paths.dbPath), "model-prices.json");
  // Mode approval (fix dev-10): persist di data/, "auto" = write_file &
  // run_command bebas-approval (mode cepat), "ask" = kartu persetujuan.
  const approvalModeFile = path.join(path.dirname(paths.dbPath), "approval-mode.json");
  try {
    setApprovalMode(JSON.parse(fs.readFileSync(approvalModeFile, "utf-8")).mode === "auto" ? "auto" : "ask");
  } catch {
    setApprovalMode("ask"); // belum ada / rusak → default aman
  }
  // Mapping manual skill → persona (menu Dungeon): file data/skill-bindings.json.
  // Baca ulang tiap akses (hot path kecil, satu file JSON) supai editan via UI
  // langsung berlaku untuk SESI BARU tanpa restart runtime.
  const skillBindingsPath = path.join(path.dirname(paths.dbPath), "skill-bindings.json");
  function skillBindingsFile(): SkillBindingsFile {
    return loadSkillBindings(skillBindingsPath);
  }

  // tools core (sekali per proses)
  const fileRevisions = new FileRevisionStore(paths.dbPath);
  registerFileTools(fileRevisions);
 // (RS-4): cache riset SQLite terpisah dari db sesi (aman dihapus ulang).
  const researchCache = newResearchCache(path.join(path.dirname(paths.dbPath), "research.db"));
  registerWebTools({ sessionStore: store, projects: projectStore, cache: researchCache }); // : fetch agent tercatat di tab Browser
  registerSkillTools(paths.skillsDir);
  registerSessionSearchTools(store); // : riwayat sesi bisa ditelusuri agent
  registerDocTools(); // dev-10: scribe membaca dokumen user (pdf/xlsx/csv)
  registerDesignTools(paths.workspacePath); // P3-CANVAS: designer menggambar ke editor embedded
  registerRunCommandTool();
  // Credential vault: an encrypted store separate from the main DB
  // (vault.db + vault.key in the data dir). Values never cross the model path.
  const vault = getVault(path.dirname(paths.dbPath));
  registerVaultTools();
  registerTerminalTool({
    // Shared user/agent terminal: the agent also enters a workshop
    // container when one is live, and works in the PROJECT workspace.
    workshop: () => workshopManager,
    projectRoot,
  });
  registerWorkshopTool({ manager: () => workshopManager }); //  ()
  // Shared live screen: one Chromium per project x persona,
  // screencast to the Browser tab (Live mode), two-way input behind a lease fence.
  // dataDir holds persistent profiles .yuika/browser/<project>/<persona>;
  // takeover.resolved is emitted by the TOOL via ctx.emit (the turn keeps waiting).
  registerScreenTools({ dataDir: path.dirname(paths.dbPath) });
  registerQaTools(); // SCR-6: persona QA menonton screen persona lain (read-only)
  registerTodoTools({ sessionStore: store, projects: projectStore });
  registerMemoryTools({
    sessionStore: store,
    projects: projectStore,
    workspacePath: paths.workspacePath,
 // domain persona pemanggil tool (dari manifest, cache-friendly).
    domainOfPersona: (personaId) => listPersonas(paths.personasDir, paths.workspacePath).find((p) => p.manifest.id === personaId)?.manifest.memory.domain ?? null,
  });
  // Objek deps delegasi DI-MUTASI saat provider swap (spread terjadi di call time).
 // router model per persona, override file (Settings) → persona.yaml → default.
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
    routeModel: routeModelFor, // : anak resolve model persona-nya sendiri
    mcpAllowlistFor, // : anak mewarisi binding MCP sesuai roster persona anak
    skillBindingsFor: (personaId) => skillBindingsFile()[personaId], // mapping manual Dungeon
    recordUsage: (u) => { usageLedger.record(u); admission.noteUsage(); }, // CRED-1 meter + CRED-2 saldo cache invalidate
    maxChildren: () => admission.maxChildren(), // CRED-3: cap delegasi dinamis
    controls: {
      register: (childSessionId, parentSessionId, ctl) => childControls.set(childSessionId, { parentSessionId, ctl }),
      unregister: (childSessionId) => childControls.delete(childSessionId),
    }, // 
    onChildSpawn: (personaId, projectId) => {
      if (projectId) rtMergeAssign(projectId, [personaId]);
    }, // : delegasi = merge-assign anak ke roster
  };
  registerDelegateTool(delegateDeps);
  // Structured consult: the Planner brainstorms with specialist personas
  // (parallel via the same delegation runner: metering/cap/event/audit apply).
  registerConsultTool(delegateDeps);

  // Workflow engine: deps use the same GETTERS as delegateDeps
  // (provider/model hot-swap stays visible; a spread would freeze the values).
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
    onChildSpawn: (personaId, projectId) => {
      if (projectId) rtMergeAssign(projectId, [personaId]);
    },
    ensureFullRoster: (projectId) => {
      rtAssignAll(projectId);
    },
  });
  // FLOW-3: run yang belum tamat dilanjutkan saat boot (gate yang belum
  // diputuskan ditanya ulang; step done tidak diulang).
  const resumedRuns = workflowEngine.resumeRuns();
  if (resumedRuns.length) moduleLogger("workflow").info({ runs: resumedRuns }, "resume: run belum tamat dilanjutkan");

  // MCP dari config (demo: best-effort, lanjut jika gagal).
  // Placeholder {workspace} di-substitusi path absolut, path relatif salah resolve
  // karena CWD dev server = apps/web, bukan root repo (bug npx 404/folder hilang).
  // Fail-closed trust gate: only workspace-trusted servers connect; every MCP
  // tool call is audited. A trust change (PUT /api/mcp/trust) means dynamic
  // connect/disconnect plus handler re-registration (new deny list).
  const mcpAudit = new McpAuditStore(paths.dbPath);
 // ledger metering, token per panggilan model (loop utama + delegasi anak).
  const usageLedger = new UsageLedger(paths.dbPath);
 // admission control (saldo hold→settle + rate limit), file budget.json.
  const budgetFile = path.join(path.dirname(paths.dbPath), "budget.json");
  const admission = new AdmissionControl(usageLedger, modelPricesFile, budgetFile);
  const onMcpCall = (info: McpCallInfo) => mcpAudit.log(info);
  let mcpConfig: McpRegistry | null = null;
  const reloadMcpConfig = (): McpRegistry | null => {
    // Base (mcp.json, layer image) ∪ overlay user (workspace/mcp.user.json,
    // volume persist): instalasi + token user selamat lintas redeploy.
    const base =
      paths.mcpConfigPath && fs.existsSync(paths.mcpConfigPath)
        ? (JSON.parse(fs.readFileSync(paths.mcpConfigPath, "utf-8")) as McpRegistry)
        : null;
    const merged = mergeMcpConfig(base, readUserConfig(paths.workspacePath));
    if (!base && Object.keys(merged.mcpServers).length === 0) return null;
    for (const cfg of Object.values(merged.mcpServers)) {
      cfg.args = cfg.args?.map((a) => a.replaceAll("{workspace}", paths.workspacePath));
    }
    return merged;
  };
  mcpConfig = reloadMcpConfig();
  /** Connection state: connected -> (down) reconnecting with backoff -> parked
   *  (manual retry); deliberate close (uninstall/toggle) never retries. */
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

  /** Server down/crash: drop its tools, schedule a backoff reconnect;
   *  after 5 failed attempts -> PARKED (raise it manually in the MCP panel). */
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
      moduleLogger("mcp").warn({ server: name, kind: "mcp", code: "MCP_PARKED" }, `parked after ${RETRY_DELAYS.length} reconnect attempts (${err}), re-enable from the MCP panel`);
      return;
    }
    const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)]!;
    const nextRetryAt = Date.now() + delay;
    mcpConns.set(name, { close: async () => undefined, toolNames: [], ping: async () => false, state: "reconnecting", lastError: err, nextRetryAt });
    moduleLogger("mcp").warn({ server: name, kind: "mcp", code: "MCP_RECONNECT", attempt, retryInMs: delay }, `down (${err}), reconnecting`);
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
      workspacePath: paths.workspacePath, // mount for cfg.sandbox
      // The server's tool list changed (notification) -> refresh the snapshot
      // (McpPanel polls it); personas pick up new tools without a restart.
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
  // mcpConns terisi, connectMcpFromConfig hanya untuk pemakaian standalone).
  // Gagal startup → scheduleMcpRetry (sama seperti server mati): cold start
  // `uvx`/`npx` (unduh paket pertama) bisa timeout, retry backoff akan sukses
  // begitu cache terisi; tanpa ini server mati permanen sampai restart proses.
  for (const name of Object.keys(mcpConfig?.mcpServers ?? {})) {
    void connectMcp(name).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      moduleLogger("mcp").warn({ server: name }, `startup connect gagal: ${msg}`);
      scheduleMcpRetry(name, msg);
    });
  }

  // Health check: ping every 60s (30s proved too frequent: dev recreates the
  // runtime often and pings pile up; with many servers the load adds up.
  // stdio pings are cheap, but no spamming).
  const mcpHealthTimer = setInterval(() => {
    for (const [name, conn] of mcpConns) {
      if (conn.state !== "connected") continue;
      void conn.ping().then((ok) => {
        if (!ok) onMcpDown(name, "health check: ping gagal");
      });
    }
  }, 60_000);
  mcpHealthTimer.unref?.();

 // housekeeping harian, boot (setelah heal menutup turn gantung)
  // + interval 24 jam; retensi 0 = mati.
  const housekeep = () => {
    if (env.eventsRetentionDays > 0) store.archiveOldEvents(env.eventsRetentionDays);
  };
  setTimeout(housekeep, 10_000).unref?.();
  const retentionTimer = setInterval(housekeep, 24 * 3_600_000);
  retentionTimer.unref?.();

  function listPersonaInfos(): PersonaInfo[] {
    return listPersonas(paths.personasDir, paths.workspacePath).map((p) => ({
      id: p.manifest.id,
      name: p.manifest.name,
      expertise: p.manifest.expertise,
      description: p.manifest.description,
      portrait: p.manifest.assets.portrait,
      states: p.manifest.assets.expressions,
      custom: p.manifest.custom,
      ...(p.manifest.base ? { base: p.manifest.base } : {}),
    }));
  }

 /** growth persona, dikurasi dari sesi/turn/task nyata. */
  function personaGrowth(): PersonaGrowth[] {
    return buildPersonaGrowth(
      listPersonas(paths.personasDir, paths.workspacePath).map((p) => ({ id: p.manifest.id, name: p.manifest.name, domain: p.manifest.memory.domain })),
      store,
      projectStore,
    );
  }

  /** Menu Persona (2026-11): override bentuk geometri maskot, hanya entri
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
      listPersonas(paths.personasDir, paths.workspacePath).map((p) => p.manifest.id),
    );
  }

  /** F1 rename: daftar override nama tampilan (id internal tidak berubah). */
  function personaRenames(): PersonaRenamesResponse["renames"] {
    const defaults = new Map(
      listPersonas(paths.personasDir).map((p) => [p.manifest.id, { name: p.manifest.name, description: p.manifest.description }]),
    );
    return Object.values(loadPersonaRenames(paths.workspacePath))
      .filter((r) => defaults.has(r.personaId))
      .map((r) => ({
        personaId: r.personaId,
        name: r.name,
        description: r.description,
        defaultName: defaults.get(r.personaId)!.name,
      }))
      .sort((a, b) => a.personaId.localeCompare(b.personaId));
  }

  function setPersonaRename(personaId: string, name: string, description?: string | null): PersonaRename {
    return savePersonaRename(
      paths.workspacePath,
      personaId,
      { name, description: description ?? null },
      listPersonas(paths.personasDir).map((p) => p.manifest.id),
    );
  }

  function clearPersonaRename(personaId: string): boolean {
    return clearPersonaRenameWs(paths.workspacePath, personaId);
  }

  // ---- F2 Persona Forge: persona custom mandiri (workspace/personas/) ----
  function forgePaths() {
    return { personasDir: paths.personasDir, skillsDir: paths.skillsDir, workspacePath: paths.workspacePath };
  }

  function createCustomPersona(input: CreateCustomPersonaRequest): CustomPersonaResult {
    const p = createCustomPersonaWs(forgePaths(), input);
    // Shape dipilih saat forge → tulis bersamaan (override eksplisit).
    if (input.shape) {
      savePersonaShape(paths.workspacePath, p.manifest.id, input.shape, [p.manifest.id]);
    }
    return CustomPersonaResult.parse({
      id: p.manifest.id,
      name: p.manifest.name,
      description: p.manifest.description,
      ...(p.manifest.base ? { base: p.manifest.base } : {}),
      custom: true,
      tools: p.manifest.tools,
    });
  }

  function updateCustomPersona(id: string, input: UpdateCustomPersonaRequest): CustomPersonaResult {
    const p = updateCustomPersonaWs(forgePaths(), id, input);
    return CustomPersonaResult.parse({
      id: p.manifest.id,
      name: p.manifest.name,
      description: p.manifest.description,
      ...(p.manifest.base ? { base: p.manifest.base } : {}),
      custom: true,
      tools: p.manifest.tools,
    });
  }

  /** F2 backup: arsip seluruh data host (workspace + db) satu bundle JSON. */
  async function backupBundle(): Promise<BackupBundle> {
    return await buildBackupBundle({
      workspacePath: paths.workspacePath,
      dbPath: paths.dbPath,
      repoRoot: resolveRepoRoot(),
    });
  }

  /** F2 backup: script restore .mjs self-contained (data ter-embed) - file
   *  yang bisa dijalankan user di host mana pun untuk memulihkan data. */
  async function backupRestoreScript(): Promise<string> {
    return restoreScriptText(await backupBundle());
  }

  /** F2 share: export persona custom jadi file JSON (dibagikan antar-install). */
  function exportPersona(id: string): PersonaShareFile {
    return exportPersonaWs(forgePaths(), id);
  }

  /** F2 share: import file share -> persona custom baru (validasi penuh). */
  function importPersona(file: PersonaShareFile): CustomPersonaResult {
    const parsed = PersonaShareFile.parse(file);
    const p = importPersonaWs(forgePaths(), parsed);
    if (parsed.shape) {
      savePersonaShape(paths.workspacePath, p.manifest.id, parsed.shape, [p.manifest.id]);
    }
    return CustomPersonaResult.parse({
      id: p.manifest.id,
      name: p.manifest.name,
      description: p.manifest.description,
      custom: true,
      tools: p.manifest.tools,
    });
  }

  function deleteCustomPersona(id: string): boolean {
    return deleteCustomPersonaWs(forgePaths(), id);
  }

  /** F2: bahan baku wizard forge - persona lengkap (prompt + skills) + bank. */
  function forgeKit(): ForgeKit {
    return {
      personas: listPersonas(paths.personasDir, paths.workspacePath).map((p) => ({
        id: p.manifest.id,
        name: p.manifest.name,
        description: p.manifest.description,
        personaMd: p.personaMd,
        tools: p.manifest.tools,
        skills: p.manifest.skills.bundled,
        custom: p.manifest.custom,
        ...(p.manifest.base ? { base: p.manifest.base } : {}),
      })),
      skills: listSkills(paths.skillsDir).map((s) => ({ name: s.name, description: s.description })),
      // Deskripsi native functions (tooltip wizard) dari registry live.
      nativeTools: Object.fromEntries(
        registry.toolSchemas([...CUSTOM_ALLOWED_TOOLS]).map((s) => [s.name, s.description]),
      ),
    };
  }

  // ---- P3-CANVAS: daftar file desain untuk tab Design (editor embedded) ----
  function designFiles(): {
    files: Array<{ id: string; name: string; revn: number; updatedAt: number; pages: number }>;
  } {
    return { files: listDesignFiles(paths.workspacePath) };
  }

  function createSession(
    personaId: string,
    projectId?: string | null,
  ): { sessionId: string; persona: PersonaInfo; projectId: string | null } {
    const persona = listPersonas(paths.personasDir, paths.workspacePath).find((p) => p.manifest.id === personaId);
    if (!persona) throw new Error(`persona tidak ditemukan: ${personaId}`);
    if (projectId && !projectStore.getProject(projectId)) {
      throw new Error(`project tidak ditemukan: ${projectId}`);
    }
 // (Team Assembly): persona project HARUS ter-assign di roster
    // (project.yaml). Pintu assign: welcome screen project (playground), Config
    // → Roster, workflow run (auto-assign semua), dan delegasi Maestro (merge).
    // Dungeon (arena latihan) dikecualikan, sesinya ephemeral per misi.
    if (projectId && projectStore.getProject(projectId)?.kind !== "dungeon") {
      if (!loadRoster(projectRoot(projectId)).some((r) => r.personaId === personaId)) {
        throw new Error(
          `${persona.manifest.name} is not assigned to this project, assign them on the project welcome screen or in Config → Roster first`,
        );
      }
    }
    const sessionId = `s_${randomUUID()}`;
    // System prompt + toolset DIBEKUKAN di sini (prompt-cache discipline).
 // USER.md + MEMORY.md project di-inject saat sesi dibuat (frozen).
 // + memori DOMAIN persona (lintas project), juga frozen.
    const memExtra = memoryPromptSection(
      paths.workspacePath,
      projectId ? projectRoot(projectId) : null,
      persona.manifest.memory?.domain ?? null,
    );
    createSessionWithPrompt(store, persona, sessionId, persona.manifest.tools, paths.skillsDir, projectId ?? null, memExtra, skillBindingsFile()[persona.manifest.id]);
    // A new session is project activity (Home "... Ago" cards)
    if (projectId) projectStore.touchProject(projectId);
    // Preference stub: one preference note per new session (learning loop preview)
    appendUserPreferenceNote(paths.workspacePath, persona.manifest.name);
    const info = listPersonaInfos().find((p) => p.id === personaId)!;
    return { sessionId, persona: info, projectId: projectId ?? null };
  }

 /** sesi terbaru lintas project, host.state/list_sessions remote. */
  function listRecentSessions(limit = 20): Array<{ sessionId: string; title: string; personaId: string; updatedAt: number }> {
    return store.listRecentSessions(limit).map((s) => ({
      sessionId: s.id,
      title: (s.title ?? "(no message)").slice(0, 60),
      personaId: s.personaId,
      updatedAt: s.updatedAt,
    }));
  }

  /** Riwayat sesi sebuah project (terbaru dulu), untuk resume percakapan lintas kunjungan. */
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

 /** root file-ops efektif sesi, project root bila melekat, workspace bila tidak. */
  function effectiveWorkspace(sessionId: string): string {
    const session = store.getSession(sessionId);
    if (!session) throw new Error(`session ${sessionId} tidak ditemukan`);
    if (!session.projectId) return paths.workspacePath;
    const project = projectStore.getProject(session.projectId);
    if (!project) throw new Error(`project ${session.projectId} tidak ditemukan (dihapus?)`);
    return path.join(paths.workspacePath, project.rootPath);
  }

  /** Root absolut project di workspace (validasi project ada), dipakai roster (PRJ-3). */
  function projectRoot(projectId: string): string {
    const project = projectStore.getProject(projectId);
    if (!project) throw new Error(`project tidak ditemukan: ${projectId}`);
    return path.join(paths.workspacePath, project.rootPath);
  }

  /** MCP access is PER-HOST (trust), not per-persona/per-project.
   *  A server trusted in mcp-trust.json is visible to EVERY persona (assigned
   *  or not, project or global session) via the `mcp__<srv>__*` tools.
   *  Legacy `mcp:` roster bindings gate nothing anymore. */
  function mcpAllowlistFor(_session: { personaId: string; projectId: string | null }): string[] | null {
    const trusted = trustConfig().servers.filter((e) => e.trusted);
    if (!trusted.length) return null;
    return trusted.map((e) => `mcp__${e.server}__*`);
  }

  /** Loop di-cache per sesi: engine approval ("Setujui & ingat") bertahan antar turn
   *  sesi yang sama, prompt/toolset toh frozen per sesi. */
  const loopCache = new Map<string, AgentLoop>();
 /** satu turn aktif per sesi, AbortController untuk Stop (HTTP + loop checks). */
  const turnAborts = new Map<string, AbortController>();
 /** kontrol anak delegasi aktif (cancel/steer dari UI parent).
   *  Key = childSessionId; unregister otomatis oleh runner (finally). */
  const childControls = new Map<
    string,
    { parentSessionId: string; ctl: { abort: AbortController; steer: (text: string) => void; pause: () => void; resume: () => void } }
  >();

  /** Dipakai REST runTurn & dungeon runner (async, resolve saat turn selesai). */
  function runTurnInternal(sessionId: string, text: string): Promise<void> {
    // Lazy-config (D49): tanpa provider, turn berakhir dengan pesan jelas
    // (bukan error 500/healing panjang) — UI menunjuk ke Settings.
    if (!providerBaseUrl || !providerApiKey || !model) {
      const msg = "Provider is not configured. Open Settings, set base URL, API key and model, then try again.";
      const e = store.appendEvent(sessionId, { type: "session.error", message: msg, recoverable: false });
      EventBus.publish(sessionId, e);
      return Promise.resolve();
    }
 // admission control, cek rate limit & budget SEBELUM turn jalan.
    const emit = makeEmitter(store, EventBus, sessionId);
    const admit = admission.admitTurn(sessionId);
    if (!admit.ok) {
      emit({ type: "session.error", message: admit.reason ?? "turn ditolak", recoverable: true });
      return Promise.resolve();
    }
    if (admit.warn) {
      emit({ type: "session.error", message: `⚠ ${admit.warn}, turn tetap dijalankan (mode warn)`, recoverable: true });
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
    const approvals = new ApprovalEngine(emit, { sessionId, store }); // : persist
    const loop = new AgentLoop({
      store,
      provider,
      model,
 // model per persona (override Settings → persona.yaml → default)
 // + fallback dengan cooldown 5 mnt.
      routeModel: (personaId) => ({ ...modelRouter.route(personaId), markUnhealthy: modelRouter.markUnhealthy }),
      workspacePath: effectiveWorkspace(sessionId), // : scope per sesi
      approvals,
      emit,
      mcpAllowlistFor, // : binding MCP granular per project×persona
      auxModel: () => process.env.YUI_AUX_MODEL || process.env.YUI_LEARN_MODEL || model, // : kompresi pakai model murah (swap panas)
      recordUsage: (u) => { usageLedger.record(u); admission.noteUsage(); }, // CRED-1 meter + CRED-2 saldo cache
    });
    loopCache.set(sessionId, loop);
    return loop;
  }

 // ---- : smoke test model (tool-call 2 langkah) + fallback otomatis ----
  // Model gagal smoke → unhealthy (cooldown 5 mtn) → router langsung ke fallback;
  // lulus → cooldown dibersihkan. Auto setelah provider settings berubah;
  // manual via POST /api/settings/provider/smoke.
  let smokeResults: ModelSmokeResult[] = [];
  let smokeRunning = false;
  async function runModelSmoke(): Promise<ModelSmokeResult[]> {
    if (smokeRunning) return smokeResults; // sedang berjalan, pakai hasil terakhir
    smokeRunning = true;
    try {
      const models = new Set<string>([model, process.env.YUI_MODEL_FALLBACK ?? ""].filter(Boolean));
      for (const p of listPersonas(paths.personasDir, paths.workspacePath)) {
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

 /** assign SEMUA persona ke roster project (merge), dipanggil
   *  saat workflow run dimulai (satu run = seluruh tim ter-assign). */
  function rtAssignAll(projectId: string): RosterEntryIn[] {
    const ids = listPersonas(paths.personasDir, paths.workspacePath).map((p) => p.manifest.id);
    return rtMergeAssign(projectId, ids);
  }

  /** Merge personaIds ke roster, entry lama utuh (role custom, phases, MCP). */
  function rtMergeAssign(projectId: string, personaIds: string[]): RosterEntryIn[] {
    const root = projectRoot(projectId); // validasi project ada
    const cur = loadRoster(root);
    let next = cur;
    for (const pid of personaIds) {
      if (next.some((r) => r.personaId === pid)) continue;
      const p = listPersonas(paths.personasDir, paths.workspacePath).find((x) => x.manifest.id === pid);
      if (!p) throw new Error(`persona tidak ditemukan: ${pid}`);
      next = [...next, { personaId: pid, role: p.manifest.expertise, phases: [], mcp: [] }];
    }
    if (next !== cur) {
      saveRoster(root, next);
      projectStore.touchProject(projectId); // a roster change is activity
    }
    return loadRoster(root);
  }

  return {
    getModelSmoke: (): { running: boolean; results: ModelSmokeResult[] } => ({ running: smokeRunning, results: smokeResults }),
    runModelSmoke: () => runModelSmoke(),
 // housekeeping retention, pindahkan events lama ke arsip.
    // Dipanggil manual (REST) & otomatis (boot + interval harian); retensi dari
    // YUI_EVENTS_RETENTION_DAYS (0 = mati).
    housekeepEvents: (nowMs?: number): { archived: number; sessions: number } => {
      const r = store.archiveOldEvents(env.eventsRetentionDays, nowMs);
      if (r.archived > 0) moduleLogger("data").info({ ...r, retentionDays: env.eventsRetentionDays }, "events diarsipkan (retention)");
      return r;
    },
 // metering ledger, summary rollup + feed event terbaru.
    getUsageSummary: (filter: { projectId?: string; sessionId?: string; personaId?: string; since?: number } = {}) =>
      usageLedger.summary(filter),
    getUsageRecent: (limit = 50, filter: { projectId?: string; sessionId?: string; personaId?: string; since?: number } = {}) =>
      usageLedger.recent(limit, filter),
    paths,
 /** (P2-SCR): direktori data runtime, profil browser persist. */
    dataDir: path.dirname(paths.dbPath),
    store,
    bus: EventBus,
 /** (P2-VLT): vault kredensial, utk REST metadata & fill. */
    vault,
    /** Matikan runtime dengan rapi, dipanggil saat runtime DI-REPLACE (HMR dev:
     *  module lib/runtime di-reval → runtime baru; yang lama harus mati total,
     *  kalau tidak proses MCP stdio lama jadi ZOMBIE yang menumpuk tiap recompile
     * , feedback user dev-10: armada MCP reconnect penuh berulang kali).
     *  Turn yang masih berjalan di loop lama tetap menyelesaikan dirinya
     *  (data lewat file DB yang sama; event lewat bus globalThis). */
    dispose: async () => {
      clearInterval(mcpHealthTimer);
      for (const name of [...mcpConns.keys()]) await disconnectMcp(name); // matikan proses stdio anak + unregister tools
      for (const r of mcpRetry.values()) clearTimeout(r.timer); // retry tertunda (parked/reconnecting)
      mcpRetry.clear();
 // matikan sesi terminal (shell host / container sandbox).
      try { await terminal.closeAll(); } catch { /* shutdown best-effort */ }
 // (P2-WKS): watchdog idle sleep + koneksi registry workshop.
      try { await workshopManager.close(); } catch { /* shutdown best-effort */ }
      try { workshopStore.close(); } catch { /* shutdown best-effort */ }
 // matikan semua Chromium shared-screen.
      try { await closeAllScreens(); } catch { /* shutdown best-effort */ }
 // sisa run-only dari turn yang mati dibersihkan;
      // singleton vault (globalThis) TETAP hidup lintas HMR, db handle-nya
      // WAL-safe, sama seperti store sesi (DELIBERAT: tidak di-close).
      // DELIBERAT: koneksi sqlite TIDAK ditutup, turn yang masih berjalan di
      // loop lama memakai objek store ini (WAL aman multi-handle; kebocoran
      // handle per HMR jauh lebih ringan daripada mematikan turn in-flight).
    },
    listPersonas: listPersonaInfos,
    personaGrowth,
    personaShapes,
    setPersonaShape,
    personaRenames,
    setPersonaRename,
    clearPersonaRename,
    createCustomPersona,
    updateCustomPersona,
    deleteCustomPersona,
    exportPersona,
    importPersona,
    backupBundle,
    backupRestoreScript,
    forgeKit,
    designFiles,
    createSession,
    listProjectSessions,
    listRecentSessions,
    runTurn: (sessionId: string, text: string) => runTurnInternal(sessionId, text),
    /** Batalkan turn sesi (tombol Stop). true bila ada turn aktif yang dibatalkan.
 * CASCADE, membatalkan turn parent sekaligus membatalkan semua
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
 // ---- : cancel/steer anak delegasi dari UI parent ----
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
 // ---- : pause/resume anak delegasi ----
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
    getMessagesWithSeq: (sessionId: string) => store.getMessagesWithSeq(sessionId),
    subscribe: (sessionId: string, listener: (e: YuiEvent) => void) => EventBus.subscribe(sessionId, listener),
    subscribeAll: (listener: (e: YuiEvent) => void) => EventBus.subscribeAll(listener),
    // ---- projects ----
    createProject: (name: string, description = "") => {
      const id = `p_${randomUUID().slice(0, 8)}`;
      const rootPath = `projects/${id}`; // relatif terhadap workspace, diisolasi penuh di 
      for (const sub of ["code", "docs", "reports"]) {
        fs.mkdirSync(path.join(paths.workspacePath, rootPath, sub), { recursive: true });
      }
      return projectStore.createProject({ id, name, description, rootPath });
    },
 // ---- Dungeon : arena latihan persona, ruangan sandbox ----
    listDungeons: () => {
      const missions = loadMissions(paths.workspacePath);
      return missions.map((m) => ({ mission: m, runs: dungeonRunner.runs(m.id) }));
    },
    startDungeonRun: (missionId: string) => {
      const m = loadMissions(paths.workspacePath).find((x) => x.id === missionId);
      if (!m) throw new Error(`misi dungeon tidak ditemukan: ${missionId}`);
      return dungeonRunner.start(m);
    },
 // ---- : latihan buatan user (halaman Dungeon) ----
    createDungeonMission: (input: {
      personaId: string;
      title: string;
      goal: string;
      skillName: string;
      skillDescription: string;
      resources?: string[];
      acceptance: string[];
    }) => {
      if (!listPersonas(paths.personasDir, paths.workspacePath).some((p) => p.manifest.id === input.personaId)) throw new Error(`persona '${input.personaId}' tidak dikenal`);
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
 /** (request user): hapus project + SEMUA artefak terkait, sesi &
     *  eventnya, task + project_events, file workspace (termasuk MEMORY.md project
     *  & uploads), revisi file, baris audit MCP, ruangan+dungeon run (kalau kind
     *  dungeon). YANG DIPERTAHANKAN: skill persona (milik persona, keputusan user)
     *  & usage ledger (akuntansi metering jujur; baris tinggal historis). */
    deleteProject: async (id: string): Promise<DeleteProjectResult> => {
      const project = projectStore.getProject(id);
      if (!project) throw new Error(`project tidak ditemukan: ${id}`);
      // 0. The project workshop (container, volume, row) is deleted too,
      //    tanpa ini container yuika-ws-* menumpuk di docker host.
      const hadWorkshop = workshopManager.info(id).state !== "absent";
      if (hadWorkshop) await workshopManager.destroy(id);
      // 1. Batalkan turn in-flight sesi project ini (turnAborts → loop batal;
      //    loopCache dibuang agar turn finalizer tak menulis setelah baris dihapus).
      const sessions = store.listProjectSessions(id).map((s) => s.id);
      for (const sid of sessions) {
        turnAborts.get(sid)?.abort();
        turnAborts.delete(sid);
        loopCache.delete(sid);
      }
      // Kill this project's terminal sessions BEFORE removing the directory:
      // otherwise its sandbox containers `yui-ses-*` keep running on the
      // host after deletion (and on Windows a local session holding the cwd
      // makes rmSync fail with EPERM).
      const root = path.join(paths.workspacePath, project.rootPath);
      const killedTerminals = await terminal.killSessionsUnder(root);
      // 2. Baris DB: sesi + events/messages/approvals → audit MCP milik sesi itu.
      const delSessions = store.deleteProjectSessions(id);
      const auditRows = mcpAudit.deleteForSessions(sessions);
      // 3. Revisi file project (prefix = root project) lalu seluruh dir workspace-
      //    project (file, uploads/, reports/, MEMORY.md project, roster, runs dungeon).
      const revisions = fileRevisions.deleteRevisionsUnder(root + path.sep);
      fs.rmSync(root, { recursive: true, force: true });
      // 3b. D94: file desain yang terikat project (workspace/design/*.json
      //     projectId) — dulu tertinggal jadi sampah setelah project dihapus.
      const designFiles = deleteDesignFilesForProject(paths.workspacePath, id);
      // 4. Terakhir: baris project itu sendiri (tasks + project_events +
      //     projects + browser_visits + workflow_runs — D94).
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
          workshop: hadWorkshop,
          terminalSessions: killedTerminals,
          // D94: artefak per-project yang dulu bocor
          designFiles,
          browserVisits: delProject.browserVisits,
          workflowRuns: delProject.workflowRuns,
          delegationJobs: delSessions.delegationJobs,
          contextCheckpoints: delSessions.contextCheckpoints,
        },
        keptUsage: true,
        keptSkills: true,
      };
    },
 // v0: tab File, tree + baca file, scoped dir project (anti traversal).
    listProjectFiles: (id: string) => {
      const p = projectStore.getProject(id);
      if (!p) throw new Error("project tidak ditemukan");
      // rootPath relatif thd workspace, WAJIB lewat projectRoot (fix: dulu readdir
      // relatif terhadap cwd Next apps/web → tree selalu kosong).
      return buildFileTree(projectRoot(id));
    },
 // root absolut project utk sesi terminal (tab Terminal).
    projectWorkspacePath: (id: string) => projectRoot(id),
    readProjectFile: (id: string, relPath: string) => {
      const p = projectStore.getProject(id);
      if (!p) throw new Error("project tidak ditemukan");
      return readProjectFile(projectRoot(id), relPath);
    },
 // revisi & diff, snapshot lama direkam otomatis oleh write_file.
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
    /** D88/D89: upload dokumen (endpoint tunggal POST /api/uploads +
     *  relay act session.upload). Target bebas-scope:
     *  - {sessionId} → ikut sesi (proyek → <root>/uploads, global →
     *    workspace/uploads)
     *  - {projectId} → <root proyek>/uploads
     *  - keduanya kosong → workspace/uploads
     *  Mengembalikan path RELATIF workspace agar persona bisa membacanya
     *  via doc_read (ctx.workspacePath = workspace root). */
    writeUpload: async (
      target: { sessionId?: string; projectId?: string },
      filename: string,
      data: Buffer,
    ): Promise<{ path: string; bytes: number }> => {
      if (/[\\/]/.test(filename) || filename.includes("..")) throw new Error("invalid file name");
      let rootAbs: string;
      let relToWs: string;
      if (target.sessionId) {
        const session = store.getSession(target.sessionId);
        if (!session) throw new Error("session not found");
        if (session.projectId) {
          const p = projectStore.getProject(session.projectId);
          if (!p) throw new Error("project tidak ditemukan");
          rootAbs = path.join(paths.workspacePath, p.rootPath);
          relToWs = `${p.rootPath}/uploads/${filename}`;
        } else {
          rootAbs = paths.workspacePath;
          relToWs = `uploads/${filename}`;
        }
      } else if (target.projectId) {
        const p = projectStore.getProject(target.projectId);
        if (!p) throw new Error("project tidak ditemukan");
        rootAbs = path.join(paths.workspacePath, p.rootPath);
        relToWs = `${p.rootPath}/uploads/${filename}`;
      } else {
        rootAbs = paths.workspacePath;
        relToWs = `uploads/${filename}`;
      }
      const abs = path.join(rootAbs, "uploads", filename);
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      await fs.promises.writeFile(abs, data);
      return { path: relToWs, bytes: data.length };
    },

    /** D92: baca aset upload (image) utk di-render klien — hanya path relatif
     *  workspace di dalam folder uploads, hanya ekstensi gambar. */
    readUpload: async (relPath: string): Promise<{ buf: Buffer; contentType: string }> => {
      if (typeof relPath !== "string" || relPath.includes("..") || relPath.startsWith("/") || relPath.includes("\\")) {
        throw new Error("invalid path");
      }
      const wsAbs = path.resolve(paths.workspacePath);
      const abs = path.resolve(wsAbs, relPath);
      if (!abs.startsWith(wsAbs + path.sep)) throw new Error("invalid path");
      if (!relPath.split("/").includes("uploads")) throw new Error("path must be inside an uploads folder");
      const CT: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
      };
      const contentType = CT[path.extname(abs).toLowerCase()];
      if (!contentType) throw new Error("only image assets can be served");
      try {
        const buf = await fs.promises.readFile(abs);
        return { buf, contentType };
      } catch {
        throw new Error("asset not found");
      }
    },
 /** riwayat job delegasi persist (audit/monitor lintas restart).
     *  projectId = project sesi parent; undefined/null = semua. */
    delegationJobs: (projectId?: string | null) => store.listDelegationJobs(projectId ?? undefined),
    /** Diagram Tim: SEMUA edge delegasi lintas sesi di proyek (grandchild ikut,
     *  relasi nyata dari event, bukan asumsi urutan persona). */
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
 // ---- tasklist project ----
    listProjectTasks: (projectId: string) => projectStore.listTasks(projectId),
    createProjectTask: (
      projectId: string,
      title: string,
      assignee?: string | null,
      parentId?: string | null,
      detail?: { description?: string | null; acceptance?: string[]; dependsOn?: string[]; estimate?: string | null; phase?: TaskItem["phase"] },
    ) => {
      const t = projectStore.createTask({
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
      });
      projectStore.touchProject(projectId); // a new task is project activity
      return t;
    },
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
 /** TaskTree : pohon utuh dari replay event project, tanpa state kedua. */
    getTaskTree: (projectId: string) => taskTreeFromEvents(projectStore.listEvents(projectId)),
    // ---- MCP trust/audit ----
    /** Status semua server: deklarasi mcp.json + trust workspace + koneksi live. */
    mcpServerStatuses: serverStatuses,
    /** Reconnect now (the panel's retry button, bypasses the backoff). */
    mcpRetryConnect: async (name: string) => {
      await disconnectMcp(name); // drop any stale (parked) entry first
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
    /** Config provider aktif (key disamarkan, jangan pernah balas key penuh). */
    /** Lazy-config (D49): trio provider terisi? API boleh boot false; chat
     *  baru ditolak runTurn guard sampai user isi provider di Settings. */
    providerConfigured: () => Boolean(providerBaseUrl && providerApiKey && model),
    getProviderSettings: () => ({
      kind: providerKind,
      baseUrl: providerBaseUrl,
      model,
      fallbackModel: process.env.YUI_MODEL_FALLBACK ?? "",
      auxModel: process.env.YUI_AUX_MODEL ?? process.env.YUI_LEARN_MODEL ?? "",
      hasApiKey: Boolean(providerApiKey),
      keyPreview: providerApiKey ? `…${providerApiKey.slice(-4)}` : "",
    }),
    // P1-MDL: model per persona, override untuk UI Settings (sumber: file JSON).
 // price book, indikator biaya metering (per persona/model).
    getModelPrices: () => loadPriceBook(modelPricesFile),
    // Mode approval: GET/PUT (persist file, survive restart; global lintas sesi).
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
      // diterima & dipasang langsung dari sini, jalur terima di tab Skill hanya
      // ada saat project aktif, jadikan mapping self-sufficient).
      const skills = [
        ...listSkills(paths.skillsDir).map((s) => ({ name: s.name, description: s.description, status: s.status, category: s.category, slug: null as string | null })),
        ...listDrafts(paths.skillsDir).map((s) => ({
          name: s.name,
          description: s.description,
          status: s.status,
          category: s.category,
          slug: path.basename(s.dir),
        })),
      ];
      const personas = listPersonas(paths.personasDir, paths.workspacePath).map((p) => {
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
      const personas = listPersonas(paths.personasDir, paths.workspacePath);
      const persona = personas.find((p) => p.manifest.id === personaId);
      if (!persona) throw new Error(`persona tidak ditemukan: ${personaId}`);
      if (!listSkills(paths.skillsDir).some((s) => s.name === skill)) throw new Error(`skill tidak ditemukan: ${skill}`);
      const data = skillBindingsFile();
      data[personaId] = applyBindingAction(data[personaId], skill, persona.manifest.skills.bundled, action);
      saveSkillBindings(skillBindingsPath, data);
      return data[personaId]!;
    },
    updateModelPrice: (model: string, price: ModelPrice) => saveModelPrice(modelPricesFile, model, price),
 // budget & admission + attribution matrix.
    getBudgetStatus: () => admission.status(),
    updateBudget: (input: UpdateBudgetRequest) => {
      admission.updateConfig(input);
      return admission.status();
    },
    getUsageMatrix: (filter: UsageFilter = {}) => usageMatrixWithCost(usageLedger, modelPricesFile, filter),
 /** trace per turn, event store + ledger digabung jadi timeline. */
    getTrace: (sessionId: string) => buildTrace(store, usageLedger, sessionId),
 /** ++: activity feed project-wide (Logs tab, semua sesi persona). */
    getProjectActivity: (projectId: string, limit?: number) => buildProjectActivity(store, projectId, limit),
 /** (P2-WKS): workshop persisten per project, manager singleton. */
    workshop: workshopManager,
 /** dashboard progres terukur, agregasi server (task/run/roster/
     *  sinyal QA+approval). null bila project tak ada. */
    getProjectDashboard: (projectId: string) => {
      const p = projectStore.getProject(projectId);
      if (!p) return null;
      return buildProjectDashboard({
        tasks: projectStore.listTasks(projectId),
        events: projectStore.listEvents(projectId),
        roster: loadRoster(p.rootPath),
        runs: projectStore.listWorkflowRuns(projectId),
        signals: scanProjectSignals(store, projectId),
        delegationErrors: store.listDelegationJobs(projectId).filter((j) => j.status === "error").length,
      });
    },
    getModelRoutes: () => ({
      defaultModel: model,
      defaultFallback: process.env.YUI_MODEL_FALLBACK ?? "",
      overrides: loadModelOverrides(modelOverridesFile),
      personas: listPersonas(paths.personasDir, paths.workspacePath).map((p) => ({ id: p.manifest.id, name: p.manifest.name })),
    }),
    /** Simpan override model satu persona ("" = hapus → ikut default). loopCache.clear()
     *  supaya sesi baru langsung memakai route baru. */
    updateModelRoute: (personaId: string, o: { model?: string; fallback?: string }) => {
      if (!listPersonas(paths.personasDir, paths.workspacePath).some((p) => p.manifest.id === personaId)) throw new Error(`persona ${personaId} tidak dikenal`);
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
        provider = makeProvider(providerBaseUrl, providerApiKey);
        toWrite.YUI_PROVIDER_KIND = providerKind;
        process.env.YUI_PROVIDER_KIND = providerKind;
      }
      if (input.baseUrl?.trim()) {
        providerBaseUrl = input.baseUrl.trim();
        provider = makeProvider(providerBaseUrl, providerApiKey);
        // Nama var = persis var boot (bug lama: persist YUI_BASE_URL, boot
        // baca YUI_OPENAI_BASE_URL — swap hilang setelah restart).
        toWrite.YUI_OPENAI_BASE_URL = providerBaseUrl;
        process.env.YUI_OPENAI_BASE_URL = providerBaseUrl;
      }
      if (input.apiKey?.trim()) {
        providerApiKey = input.apiKey.trim();
        provider = makeProvider(providerBaseUrl, providerApiKey);
        toWrite.YUI_OPENAI_API_KEY = providerApiKey;
        process.env.YUI_OPENAI_API_KEY = providerApiKey;
      }
      // Bersihkan entri legacy (YUI_BASE_URL/YUI_API_KEY) dari .env lama.
      toWrite.YUI_BASE_URL = null;
      toWrite.YUI_API_KEY = null;
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
 // smoke ulang di background, model baru gagal smoke → fallback otomatis
        void runModelSmoke();
      }
      return { ok: true, note: "Sesi baru & turn berikutnya memakai config baru (loopCache dikosongkan; .env diperbarui)." };
    },
 // ---- Skills : draf → validasi → siap pakai ----
    listSkillsWithDrafts: () => {
      const drafts = safeList(() => listDrafts(paths.skillsDir));
      const skills = safeList(() => listSkills(paths.skillsDir));
      return {
        drafts: drafts.map((s) => ({ slug: path.basename(s.dir), name: s.name, description: s.description, body: s.body, usage: readUsage(s.dir), status: s.status, personas: s.personas })),
        skills: skills.map((s) => ({ name: s.name, description: s.description, usage: readUsage(s.dir), status: s.status, personas: s.personas, eval: readEval(s.dir) })),
      };
    },
 /** eval buta skill `tested` (nama/slug), fire-and-forget;
     *  hasil di-polling via listSkillsWithDrafts (field `eval`). */
    evalSkill: (nameOrSlug: string) => {
      const skill = listSkills(paths.skillsDir).find((s) => s.name === nameOrSlug || path.basename(s.dir) === nameOrSlug);
      if (!skill) throw new Error(`skill aktif '${nameOrSlug}' tidak ditemukan`);
      if (skill.status !== "tested") throw new Error(`skill '${skill.name}' berstatus ${skill.status}, hanya skill 'tested' yang bisa dieval (accept draft dulu)`);
      const ev = readEval(skill.dir);
      if (ev?.verdict === "pending") throw new Error("eval sedang berjalan, tunggu selesai");
      const mission = missionForSkill(loadMissions(paths.workspacePath), skill.name);
      if (!mission) throw new Error(`tidak ada misi dengan target skill '${skill.name}', eval buta butuh kriteria acceptance dari misi`);
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
    /** One-click install uv (installer resmi astral.sh), dipanggil UI dengan konfirmasi. */
    mcpInstallUv: async () => installUv(),
 // ---- Memory manager ----
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
    // ---- catalog & install ----
    /** The curated catalog for the MCP panel UI. */
    mcpCatalog: () => MCP_CATALOG,
    /** Install from the catalog -> write workspace overlay (persist) +
     *  reload in memory. NO auto-connect (fail-closed): the user must
     *  Trust it in the panel. */
    installMcpServer: (catalogId: string, env: Record<string, string>) => {
      if (!paths.mcpConfigPath) throw new Error("mcp.json tidak dikonfigurasi (YUI_MCP_CONFIG)");
      const { name } = installFromCatalog(paths.workspacePath, catalogId, env);
      mcpConfig = reloadMcpConfig();
      return { name, statuses: serverStatuses() };
    },
    /** Lepas server: putuskan koneksi (bila ada) + hapus dari config
     *  efektif (overlay; tombstone bila server base). */
    uninstallMcpServer: async (name: string) => {
      if (!paths.mcpConfigPath) throw new Error("mcp.json tidak dikonfigurasi (YUI_MCP_CONFIG)");
      await disconnectMcp(name);
      const removed = uninstallFromConfig(paths.workspacePath, name, paths.mcpConfigPath);
      mcpConfig = reloadMcpConfig();
      return { removed, statuses: serverStatuses() };
    },
 // ---- roster project ----
    getProjectRoster: (projectId: string) => loadRoster(projectRoot(projectId)),
 /** skill readiness persona di roster (assign gating), dari
     *  inventory skill global (tested/ready = siap; draft tidak dihitung). */
    getRosterReadiness: (projectId: string) =>
      computeReadiness(
        loadRoster(projectRoot(projectId)),
        listSkills(paths.skillsDir).map((s) => ({ name: s.name, category: s.frontmatter.metadata?.yui?.category, personas: s.personas, status: s.status })),
      ),
    saveProjectRoster: (projectId: string, roster: RosterEntryIn[]): RosterEntryIn[] => {
      projectRoot(projectId); // validasi project ada
      const known = new Set(listPersonas(paths.personasDir, paths.workspacePath).map((p) => p.manifest.id));
      const seen = new Set<string>();
      for (const r of roster) {
        if (!known.has(r.personaId)) throw new Error(`persona tidak ditemukan: ${r.personaId}`);
        if (seen.has(r.personaId)) throw new Error(`persona duplikat di roster: ${r.personaId}`);
        seen.add(r.personaId);
      }
      saveRoster(projectRoot(projectId), roster);
      projectStore.touchProject(projectId);
      return loadRoster(projectRoot(projectId));
    },
    // ---- team assembly: assign personas to the roster (merge) ----
    /** Merge personaIds ke roster project, entry lama utuh (role custom,
     * phases, binding MCP). Dipakai: welcome playground, delegasi Maestro,
     * dan workflow run (assign SEMUA persona). Role default = expertise. */
    assignProjectPersonas: (projectId: string, personaIds: string[]): RosterEntryIn[] =>
      rtMergeAssign(projectId, personaIds),
    /** Workflow mode: satu run = SELURUH tim (9 persona) ter-assign otomatis. */
    ensureFullProjectRoster: (projectId: string): RosterEntryIn[] =>
      rtAssignAll(projectId),
    // ---- workflow (P2-FLOW) ----
    workflowEngine,
    listWorkflowRuns: (projectId: string) => projectStore.listWorkflowRuns(projectId),
    getWorkflowRun: (runId: string) => projectStore.getWorkflowRun(runId),
 // ---- : browser read-only (tab Browser) ----
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
    /** Policy browser project (allowlist + allowAll), dipakai tab Browser. */
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
