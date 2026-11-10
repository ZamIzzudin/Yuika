// @yuika/core, public entry
import { createYuiRuntime } from "./runtime.js";

export type YuiRuntime = ReturnType<typeof createYuiRuntime>;
export * from "./provider/adapter.js";
export { OpenAICompatProvider } from "./provider/openai-compat.js";
export { registry, resetRegistryForTests } from "./registry.js";
export { EventBus } from "./bus.js";
export { SessionStore } from "./session/store.js";
export { buildContextMessages, slimHistory, DEFAULT_COMPRESS, DEFAULT_SLIM, type CompressOptions, type CompressResult, type SlimOptions } from "./session/compress.js";
export { estimateTokens } from "./session/tokens.js";
export { env as coreEnv } from "./env.js";
export { getLogger, moduleLogger } from "./logger.js";
export { classifyError, YuiError, ErrorCodes, ERROR_KINDS, type ErrorKind, type ErrorCode } from "./errors.js";
export { makeEmitter, type Emit } from "./session/emit.js";
export { AgentLoop } from "./loop.js";
export {
  ApprovalEngine,
  getApprovalMode,
  setApprovalMode,
  listPendingApprovals,
  type ApprovalMode,
  type PendingApprovalInfo,
} from "./approval/engine.js";
export { listPersonas, loadPersona, type Persona } from "./personas/loader.js";
export { listSkills, loadSkill, type Skill, type SkillIndexEntry } from "./skills/loader.js";
export { buildSystemPrompt, CORE_SYSTEM_PROMPT } from "./prompt/builder.js";
export { connectMcpServer, connectMcpFromConfig, type McpServerConfig, type McpRegistry } from "./mcp/client.js";
export { MCP_CATALOG, catalogById } from "./mcp/catalog.js";
export { installFromCatalog, uninstallFromConfig, readMcpConfig } from "./mcp/install.js";
export { createYuiRuntime, type YuiRuntimeConfig } from "./runtime.js";
export { resolvePaths, resolveRepoRoot } from "./paths.js";
export { appendUserPreferenceNote, userMdPath } from "./memory/usermd.js";
export { runChildPersona, type DelegationDeps } from "./delegation/runner.js";
export { registerTodoTools } from "./tools/todo-tools.js";
// browser reader read-only (allowlist + SSRF guard + sanitizer).
export { BrowserReadError, readBrowserAllow, readBrowserPolicy, writeBrowserPolicy, readBrowserPage, assertBrowserUrlAllowed, hostAllowedBrowser, isPrivateIp, sanitizeBrowserHtml } from "./browser/reader.js";
// (RS): Research Engine, web_search provider chain + web_fetch pipeline
// (SSRF/robots/throttle/Readability, cache SQLite, budget per sesi).
export {
  researchSearch, researchFetch, researchConfig, researchPolicyFor, getResearchBudget,
  newResearchCache, ResearchBudget, ResearchError, type ResearchCache,
  isAllowedByRobots, parseRobots, robotsAllows, clearRobotsCache,
  DEFAULT_PROVIDERS, SEARCH_TTL_MS, PAGE_TTL_MS,
  type SearchResult, type FetchedPage, type SearchProvider, type SearchOutcome, type FetchOutcome, type ResearchConfig,
} from "./research/index.js";
// (P2-VLT, ): vault kredensial, AES-256-GCM per record, nilai tak
// pernah lewat jalur model/API/event; redaksi nilai aktif proses-wide.
export {
  VaultStore, loadVaultMasterKey, type VaultRecord, type VaultPutInput,
} from "./vault/store.js";
export {
  VaultManager, getVault, setVaultForTests, VAULT_FILL_TIMEOUT_MS,
  type VaultFillOutcome,
} from "./vault/manager.js";
export {
  registerActiveSecret, releaseActiveSecret, redactActive,
  activeSecretCount, resetActiveSecretsForTests, VAULT_REDACTED,
} from "./vault/redact.js";
export { registerVaultTools } from "./tools/vault-tools.js";
// terminal manager, sesi shared user (SSE api) & agent (tool).
export {
  ensureSession as ensureTerminalSession,
  type EnsureSessionOptions,
  writeInput as writeTerminalInput,
  subscribe as subscribeTerminal,
  listSessions as listTerminalSessions,
  getSession as getTerminalSession,
  killSession as killTerminalSession,
  killSessionsUnder as killTerminalSessionsUnder,
  logCommand as logTerminalCommand,
  listCommandLog as listTerminalCommandLog,
  type CommandLogEntry,
  closeAll as closeAllTerminals,
  runInSession as runInTerminalSession,
  type TerminalSessionInfo,
} from "./terminal/manager.js";
export { ProjectStore } from "./project/store.js";
// (P2-WKS): workshop persisten per project.
export { WorkshopManager, DockerWorkshopHost, LocalWorkshopHost, type WorkshopHost } from "./workshop/manager.js";
export { WorkshopStore } from "./workshop/store.js";
export { registerWorkshopTool } from "./tools/workshop-tool.js";
export { WorkflowEngine, type WorkflowEngineDeps, type StartRunOptions, type StartRunResult } from "./workflow/engine.js";

// (P2-SCR, ): shared live screen, lease fence (rokazo), CDP raw
// (global WebSocket Node 22+), manager Chromium per project×persona, takeover.
export { screenLeaseId, parseScreenLeaseId, canTakeScreenLease, canReleaseScreenLease } from "./screen/lease.js";
export {
  ensureScreen, stopScreen, closeAllScreens, listScreens, getScreenState,
  subscribeScreen, takeLease, yieldLease, leaseOwner,
  screenNavigate, screenClick, screenType, screenPress, screenScroll, screenSnapshot,
  openTakeoverRequest, resolveTakeover, listPendingTakeovers, screenKey,
  openLoginRequest, resolveLogin, listPendingLogins, screenFillLogin, screenEvalJson,
  loginTimeoutMs, qaWatch, type LoginFillResult,
  detectBrowserExec, takeoverTimeoutMs,
  type ScreenState, type ScreenFrame, type Snapshot,
} from "./screen/manager.js";
export { parseDevToolsUrl, CdpError } from "./screen/cdp.js";
export {
  RESET_EXIT_CODE,
  RESET_SCOPES,
  executePendingWipe,
  writeResetPending,
  resetArtifactPaths,
  pendingResetFile,
  resetLogFile,
  type ResetScope,
  type WipeResult,
} from "./reset.js";
export { registerScreenTools } from "./tools/screen-tools.js";
export { registerQaTools } from "./tools/qa-tools.js";
