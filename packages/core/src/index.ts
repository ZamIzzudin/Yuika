// @yuika/core — public entry
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
export { ApprovalEngine, getApprovalMode, setApprovalMode, type ApprovalMode } from "./approval/engine.js";
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
// P2-STU-2: terminal manager — sesi shared user (SSE api) & agent (tool).
export {
  ensureSession as ensureTerminalSession,
  writeInput as writeTerminalInput,
  subscribe as subscribeTerminal,
  listSessions as listTerminalSessions,
  getSession as getTerminalSession,
  killSession as killTerminalSession,
  closeAll as closeAllTerminals,
  runInSession as runInTerminalSession,
  type TerminalSessionInfo,
} from "./terminal/manager.js";
export { ProjectStore } from "./project/store.js";
export { WorkflowEngine, type WorkflowEngineDeps, type StartRunOptions, type StartRunResult } from "./workflow/engine.js";
