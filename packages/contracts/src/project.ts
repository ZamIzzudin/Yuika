// @yui/contracts — project schema (PLAN §13.1–13.3, D14: project = entitas first-class).
// Project duduk DI ATAS workspace: sesi/persona/tool mengikat ke project, tasklist
// milik project. Roster & binding dideklarasikan di `project.yaml` (P1-PRJ-3/5) —
// kontrak di sini menjadi bentuk tervalidasi yang sama untuk loader maupun REST.
import { z } from "zod";

export const ProjectStatus = z.enum(["active", "archived"]);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

/** Ringkasan sesi untuk riwayat/resume percakapan project (P1-PRJ-6 UX). */
export const ProjectSessionSummary = z.object({
  sessionId: z.string(),
  personaId: z.string(),
  personaName: z.string(),
  createdAt: z.number(),
  lastEventAt: z.number(),
});
export type ProjectSessionSummary = z.infer<typeof ProjectSessionSummary>;

export const ProjectInfo = z.object({
  id: z.string().regex(/^p_[a-z0-9-]+$/, "project id: prefix p_ + lowercase/angka/strip"),
  name: z.string().min(1).max(80),
  description: z.string().max(280).default(""),
  status: ProjectStatus.default("active"),
  /** Root relatif terhadap workspace (mis. `projects/p_demo`) — isolasi penuh di P1-PRJ-2. */
  rootPath: z.string(),
  /** P1-DUN-1: ruang `dungeon` = arena latihan persona (sandbox, bukan produksi). */
  kind: z.enum(["project", "dungeon"]).default("project"),
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

/** `project.yaml` di root project — sumber roster (P1-PRJ-3) & binding MCP (P1-PRJ-5). */
export const ProjectManifest = z.object({
  roster: z.array(RosterEntry).default([]),
});
export type ProjectManifest = z.infer<typeof ProjectManifest>;

// ---- TaskTree (P1-PRJ-7, PLAN §13.7/D19) — hierarki pemantauan delegasi ----

export const TaskStatus = z.enum(["todo", "doing", "review", "done"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

/** Node tree: task → subtask → step → job agent. Diproyeksikan DARI event (replay gratis). */
export interface TaskNode {
  id: string;
  /** null = root task (kartu TaskList level atas). */
  parent: string | null;
  title: string;
  status: TaskStatus;
  assignee: string | null;
  /** Referensi pekerjaan: delegation job id / step / path. */
  refs: string[];
  /** Artefak nyata yang dihasilkan node (path file, link). */
  artefak: string[];
  /** Waktu mulai/diakhiri (ts event transisi status) — untuk tampilan durasi. */
  startedAt?: number;
  doneAt?: number;
  children: TaskNode[];
}

export const TaskNode: z.ZodType<TaskNode> = z.object({
  id: z.string(),
  parent: z.string().nullable(),
  title: z.string(),
  status: TaskStatus,
  assignee: z.string().nullable(),
  refs: z.array(z.string()),
  artefak: z.array(z.string()),
  startedAt: z.number().optional(),
  doneAt: z.number().optional(),
  children: z.array(z.lazy(() => TaskNode)),
});

/** Event stream project (tabel project_events) — sumber TaskTree; semua transisi task lewat sini. */
export const ProjectEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("task.node.created"),
    projectId: z.string(),
    taskId: z.string(),
    parent: z.string().nullable(),
    title: z.string(),
    assignee: z.string().nullable(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal("task.node.updated"),
    projectId: z.string(),
    taskId: z.string(),
    title: z.string().optional(),
    status: TaskStatus.optional(),
    assignee: z.string().nullable().optional(),
    addRefs: z.array(z.string()).optional(),
    addArtefak: z.array(z.string()).optional(),
    ts: z.number(),
  }),
]);
export type ProjectEvent = z.infer<typeof ProjectEvent>;

/** Edge delegasi antar-sesi (graf nyata dari event delegation.*) — sumber diagram Tim. */
export const DelegationEdge = z.object({
  /** Sesi pemberi tugas. */
  parentSessionId: z.string(),
  parentPersonaId: z.string(),
  /** Sesi anak yang mengerjakan (node di bawah pemberi tugas). */
  childSessionId: z.string(),
  personaId: z.string(),
  goal: z.string(),
  status: z.enum(["running", "done"]),
  /** State persona anak terakhir (thinking/working/idle) bila masih hidup. */
  state: z.string().nullish(),
  summary: z.string().nullish(),
  startedAt: z.number(),
  doneAt: z.number().nullish(),
});
export type DelegationEdge = z.infer<typeof DelegationEdge>;

// Tasklist per project (P1-PRJ-4 memakai kontrak ini; TaskTree = D19 menyusul).
// TaskList flat (P1-PRJ-4) — row di project_tasks.
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

/** P2-STU-3 v0: tab File — node tree (relPath pakai "/" lintas OS). */
export interface FileNode {
  name: string;
  relPath: string;
  dir: boolean;
  size: number;
  children?: FileNode[];
}
export const FileNode: z.ZodType<FileNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    relPath: z.string(),
    dir: z.boolean(),
    size: z.number().int(),
    children: z.array(FileNode).optional(),
  }),
);

// ---- Dungeon: arena latihan persona (P1-DUN-1..3, PLAN §13.8) ----

/** Format misi `mission.yaml` di workspace/dungeons/<slug>/. */
export const Mission = z.object({
  id: z.string().min(1),
  title: z.string().min(3).max(120),
  /** Persona yang dilatih (target skill milik dia — P1-DUN-2). */
  persona: z.string().min(3),
  goal: z.string().min(10),
  /** Sumber belajar: URL / path file di folder misi. */
  resources: z.array(z.string()).default([]),
  /** Kriteria lulus — dievaluasi blind (P1-DUN-3), v0: dibaca agent sebagai target. */
  acceptance: z.array(z.string()).min(1),
  targetSkill: z.object({ name: z.string().min(3), description: z.string().min(10) }),
  /** seed = bawaan; user = dibuat lewat halaman Dungeon (P1-DUN-4). */
  origin: z.enum(["seed", "user"]).default("seed"),
});
export type Mission = z.infer<typeof Mission>;

/** POST /api/dungeons/mission — latihan buatan user (P1-DUN-4):
 *  mode `research` = persona riset mandiri (sumber URL);
 *  mode `documents` = bahan ajar file (diunggah setelah misi dibuat). */
export const CreateMissionRequest = z.object({
  personaId: z.string().min(3),
  title: z.string().min(3).max(120),
  goal: z.string().min(10),
  skillName: z.string().min(3).max(64),
  skillDescription: z.string().min(10).max(200),
  mode: z.enum(["research", "documents"]).default("research"),
  /** URL sumber (mode research, opsional — agent boleh cari sendiri). */
  resources: z.array(z.string()).max(12).default([]),
  acceptance: z.array(z.string()).min(1).max(8),
});
export type CreateMissionRequest = z.infer<typeof CreateMissionRequest>;

/** Satu eksekusi misi (sesi sandbox; status dipolling UI). */
export const DungeonRun = z.object({
  id: z.string(),
  missionId: z.string(),
  sessionId: z.string().nullable(),
  projectId: z.string(),
  status: z.enum(["running", "done", "failed"]).default("running"),
  startedAt: z.number().int(),
  endedAt: z.number().int().nullable().default(null),
  summary: z.string().nullable().default(null),
});
export type DungeonRun = z.infer<typeof DungeonRun>;

/** Hasil eval buta satu skill (`.eval.json` di folder skill) — P1-DUN-3. */
export const SkillEval = z.object({
  verdict: z.enum(["pending", "pass", "fail"]),
  reason: z.string().nullable(),
  judgeSessionId: z.string(),
  at: z.number().int(),
});
export type SkillEval = z.infer<typeof SkillEval>;

/** P1-DUN-5: readiness satu fase untuk satu persona (skill siap = tested/ready). */
export const PhaseReadiness = z.object({
  phase: z.enum(WORKFLOW_PHASES),
  ready: z.boolean(),
  skills: z.array(z.string()).default([]),
});
export type PhaseReadiness = z.infer<typeof PhaseReadiness>;

/** Hasil hapus project + artefak terkait (P1-PRJ-8, request user).
 *  Skill persona yang lahir dari project INI TIDAK ikut dihapus (milik persona,
 *  hidup di packages/skills — keputusan user). Metering (usage ledger) juga
 *  dipertahankan — akuntansi jujur; projectId tinggal baris historis. */
export const DeleteProjectResult = z.object({
  ok: z.literal(true),
  projectId: z.string(),
  name: z.string(),
  kind: z.enum(["project", "dungeon"]),
  deleted: z.object({
    sessions: z.number().int(),
    events: z.number().int(),
    approvals: z.number().int(),
    tasks: z.number().int(),
    projectEvents: z.number().int(),
    revisions: z.number().int(),
    auditRows: z.number().int(),
    workspaceDir: z.string(),
  }),
  keptUsage: z.literal(true),
  keptSkills: z.literal(true),
});
export type DeleteProjectResult = z.infer<typeof DeleteProjectResult>;
