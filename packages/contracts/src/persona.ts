// @yuika/contracts, persona manifest schema (PLAN §7.2)
// Loader (@yuika/core) menggabungkan persona.yaml + PERSONA.md + toolsets.yaml + skills.yaml
// + delegation.yaml menjadi bentuk tervalidasi ini.
import { z } from "zod";
import { PersonaState } from "./events.js";

const AssetSpec = z.object({
  portrait: z.string().nullable().default(null),
  /** Placeholder demo: null artinya pakai fallback CSS (DEMO-WEEK-1 §9). */
  riv: z.string().nullable().default(null),
  expressions: z
    .array(PersonaState)
    .default(["idle", "thinking", "working", "awaiting_input", "done", "error", "celebrating"]),
});

const ModelRoute = z.object({
  quality: z.enum(["low", "medium", "high"]),
  /** P1-MDL-1: nama model konkret (OpenAI-compatible id). Kosong = default env YUI_MODEL. */
  name: z.string().optional(),
  fallback: z.string().optional(),
});

const MemoryPolicy = z.object({
  domain: z.string(),
  learn: z.boolean().default(true),
});

const SkillsBinding = z.object({
  bundled: z.array(z.string()).default([]),
  recommended: z.array(z.string()).default([]),
});

const DelegationRules = z.object({
  can_spawn: z.array(z.string()).default([]),
  spawnable_by: z.array(z.string()).default(["user"]),
  /** P1-DEL-1: cap paralel MILIK SI PENDELEGASI (persona yang memegang
   *  delegate_task), berlaku pada delegation.yaml persona tsb.; persona anak
   *  tanpa delegate_task mengabaikannya. Dikombinasikan min() dengan cap
   *  budget workspace (Settings → Metering). */
  max_concurrent: z.number().int().min(1).max(16).optional(),
});

export const PersonaManifest = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "persona id: lowercase, angka, strip"),
  name: z.string().min(1),
  version: z.string().default("0.1.0"),
  expertise: z.string().min(1),
  tags: z.array(z.string()).default([]),
  description: z.string().max(120),
  assets: AssetSpec.prefault({}),
  model: z
    .object({ primary: ModelRoute, aux: ModelRoute })
    .default({ primary: { quality: "high" }, aux: { quality: "low" } }),
  memory: MemoryPolicy,
  skills: SkillsBinding.prefault({}),
  delegation: DelegationRules.prefault({}),
  /** Daftar tool aktif; dukung wildcard prefix `mcp__*` (filter di registry). */
  tools: z.array(z.string()).default([]),
});
export type PersonaManifest = z.infer<typeof PersonaManifest>;

/** Bentuk geometri maskot Orin (v8), 15 bentuk; urutan = indeks input Rive
 *  `shape` 0–14 (satu sumber kebenaran bersama SHAPE_ORDER di web).
 *  Menu Persona: user dapat mengganti bentuk per persona (persist di
 *  workspace/persona-shapes.json, override di atas default PERSONA_SHAPE). */
export const ORIN_SHAPE_KEYS = [
  "orb",
  "cloud",
  "blob",
  "square",
  "tri",
  "pill",
  "bean",
  "drop",
  "star",
  "flower",
  "hex",
  "trap",
  "diamond",
  "dome",
  "tube",
] as const;
export const OrinShapeKey = z.enum(ORIN_SHAPE_KEYS);
export type OrinShapeKey = z.infer<typeof OrinShapeKey>;

/** Entri override bentuk persona (persona tanpa entri = default manifest). */
export const PersonaShapeOverride = z.object({
  personaId: z.string().regex(/^[a-z0-9-]+$/),
  shape: OrinShapeKey,
});
export type PersonaShapeOverride = z.infer<typeof PersonaShapeOverride>;

export const PersonaShapesResponse = z.object({
  shapes: z.array(PersonaShapeOverride),
});
export type PersonaShapesResponse = z.infer<typeof PersonaShapesResponse>;

export const SetPersonaShapeRequest = z.object({
  personaId: z.string().regex(/^[a-z0-9-]+$/),
  shape: OrinShapeKey,
});
export type SetPersonaShapeRequest = z.infer<typeof SetPersonaShapeRequest>;
