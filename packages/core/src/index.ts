// @yui/core — public entry
import { createYuiRuntime } from "./runtime.js";

export type YuiRuntime = ReturnType<typeof createYuiRuntime>;
export * from "./provider/adapter.js";
export { OpenAICompatProvider } from "./provider/openai-compat.js";
export { registry, resetRegistryForTests } from "./registry.js";
export { EventBus } from "./bus.js";
export { SessionStore } from "./session/store.js";
export { makeEmitter, type Emit } from "./session/emit.js";
export { AgentLoop } from "./loop.js";
export { ApprovalEngine } from "./approval/engine.js";
export { listPersonas, loadPersona, type Persona } from "./personas/loader.js";
export { listSkills, loadSkill, type Skill, type SkillIndexEntry } from "./skills/loader.js";
export { buildSystemPrompt, CORE_SYSTEM_PROMPT } from "./prompt/builder.js";
export { connectMcpServer, connectMcpFromConfig, type McpServerConfig, type McpRegistry } from "./mcp/client.js";
export { createYuiRuntime, type YuiRuntimeConfig } from "./runtime.js";
export { resolvePaths, resolveRepoRoot } from "./paths.js";
export { appendUserPreferenceNote, userMdPath } from "./memory/usermd.js";
export { runChildPersona, type DelegationDeps } from "./delegation/runner.js";
