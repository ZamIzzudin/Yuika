// @yui/contracts — project schema (PLAN §13.1–13.3, D14: project = entitas first-class).
// Project duduk DI ATAS workspace: sesi/persona/tool mengikat ke project, tasklist
// milik project. Roster & binding dideklarasikan di `project.yaml` (P1-PRJ-3/5) —
// kontrak di sini menjadi bentuk tervalidasi yang sama untuk loader maupun REST.
import { z } from "zod";

export const ProjectStatus = z.enum(["active", "archived"]);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

export const ProjectInfo = z.object({
  id: z.string().regex(/^p_[a-z0-9-]+$/, "project id: prefix p_ + lowercase/angka/strip"),
  name: z.string().min(1).max(80),
  description: z.string().max(280).default(""),
  status: ProjectStatus.default("active"),
  /** Root relatif terhadap workspace (mis. `projects/p_demo`) — isolasi penuh di P1-PRJ-2. */
  rootPath: z.string(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type ProjectInfo = z.infer<typeof ProjectInfo>;

// Roster & binding — dipakai `project.yaml` loader (P1-PRJ-3) dan UI project home.
export const McpToolBinding = z.object({
  /** Nama server MCP di mcp.json. */
  server: z.string().min(1),
  /** Pola tool; `*` = semua tool server (D17: binding granular project×persona×tool). */
  tools: z.array(z.string()).default(["*"]),
});
export type McpToolBinding = z.infer<typeof McpToolBinding>;

/** Fase workflow template 7 fase (D15) — roster entry menandai fase aktif persona. */
export const WORKFLOW_PHASES = [
  "planning",
  "research",
  "design",
  "develop",
  "testing",
  "documentation",
  "delivery",
] as const;
export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number];

export const RosterEntry = z.object({
  personaId: z.string().regex(/^[a-z0-9-]+$/),
  /** Peran persona DALAM project ini (bukan keahlian globalnya). */
  role: z.string().min(1),
  phases: z.array(z.enum(WORKFLOW_PHASES)).default([]),
  mcp: z.array(McpToolBinding).default([]),
});
export type RosterEntry = z.infer<typeof RosterEntry>;

// Tasklist per project (P1-PRJ-4 memakai kontrak ini; TaskTree = D19 menyusul).
export const TaskStatus = z.enum(["todo", "doing", "review", "done"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const TaskItem = z.object({
  id: z.string().regex(/^t_[a-z0-9-]+$/),
  projectId: z.string(),
  title: z.string().min(1).max(140),
  status: TaskStatus.default("todo"),
  /** Persona assignee (id persona di roster); null = belum di-assign. */
  assignee: z.string().nullable().default(null),
  /** Referensi artefak (path workspace / job id / event id) — dipakai TaskTree (D19). */
  refs: z.array(z.string()).default([]),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type TaskItem = z.infer<typeof TaskItem>;
