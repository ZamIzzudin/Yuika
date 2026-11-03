// @yui/contracts — REST payloads (DEMO-WEEK-1.md §5)
import { z } from "zod";
import { PersonaState } from "./events.js";
import { ProjectStatus } from "./project.js";

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
export const ApprovalDecisionRequest = z.object({ approved: z.boolean() });
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
