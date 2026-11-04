// @yui/contracts — REST payloads (DEMO-WEEK-1.md §5)
import { z } from "zod";
import { PersonaState } from "./events.js";
import { ProjectStatus, RosterEntry, TaskStatus } from "./project.js";

export const PersonaInfo = z.object({
  id: z.string(),
  name: z.string(),
  expertise: z.string(),
  /** ≤ 60 char — standar deskripsi skill/persona (warisan Hermes, PLAN §7.2). */
  description: z.string().max(60),
  portrait: z.string().nullable(),
  states: z.array(PersonaState),
});
export type PersonaInfo = z.infer<typeof PersonaInfo>;

/** P1-PER-4: growth persona — DIKURASI dari data nyata (sesi/turn/task), bukan
 *  state gamifikasi palsu. Level dari `turns` (aktivitas paling jujur). */
export const PersonaGrowth = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  /** Sesi yang pernah dibuat persona ini. */
  sessions: z.number().int().nonnegative(),
  /** Turn selesai (event persona.state done milik persona). */
  turns: z.number().int().nonnegative(),
  /** Task project berstatus done yang di-assign ke persona. */
  tasksDone: z.number().int().nonnegative(),
  /** Nama level saat ini (dari kurva thresholds). */
  level: z.string(),
  /** Index level 0..levelCount-1 — untuk progress bar. */
  levelIndex: z.number().int().nonnegative(),
  levelCount: z.number().int().positive(),
  /** Batas `turns` untuk naik ke level berikutnya; null = level maksimum. */
  nextLevelAt: z.number().int().nonnegative().nullable(),
});
export type PersonaGrowth = z.infer<typeof PersonaGrowth>;

// POST /api/sessions
export const CreateSessionRequest = z.object({
  personaId: z.string().min(1),
  /** Sesi melekat ke project (P1-PRJ-2) — opsional: null = sesi workspace global. */
  projectId: z.string().min(1).nullish(),
});
export const CreateSessionResponse = z.object({
  sessionId: z.string(),
  persona: PersonaInfo,
  projectId: z.string().nullable(),
});

// POST /api/sessions/:id/message
export const SendMessageRequest = z.object({ text: z.string().min(1) });
export const SendMessageResponse = z.object({ accepted: z.literal(true) });

// POST /api/approvals/:id
export const ApprovalDecisionRequest = z.object({
  approved: z.boolean(),
  /** "Setujui & ingat": tool bebas-approval untuk sisa sesi (mengurangi round-trip user). */
  remember: z.boolean().optional(),
});
export const ApprovalDecisionResponse = z.object({ ok: z.literal(true) });

// GET /api/sessions/:id/events?since=<id>
export const EventReplayQuery = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
});

// ---- Projects (PLAN §13.1, P1-PRJ-1) ----

// POST /api/projects
export const CreateProjectRequest = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(280).default(""),
});

// PATCH /api/projects/:id
export const UpdateProjectRequest = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(280).optional(),
  status: ProjectStatus.optional(),
});

// GET/POST /api/projects/:id/tasks (P1-PRJ-4)
export const CreateTaskRequest = z.object({
  title: z.string().min(1).max(140),
  assignee: z.string().nullish(),
  /** Parent task id — null = root (P1-PRJ-7 TaskTree). */
  parentId: z.string().nullish(),
});

// PATCH /api/projects/:id/tasks/:taskId
export const UpdateTaskRequest = z.object({
  title: z.string().min(1).max(140).optional(),
  status: TaskStatus.optional(),
  assignee: z.string().nullable().optional(),
  addRefs: z.array(z.string()).optional(),
  /** Artefak node (masuk event TaskTree; P1-PRJ-7). */
  addArtefak: z.array(z.string()).optional(),
});

// GET/PUT /api/projects/:id/roster (P1-PRJ-3) — sumber: project.yaml di root project
export const SaveRosterRequest = z.object({
  roster: z.array(RosterEntry).min(0),
});
