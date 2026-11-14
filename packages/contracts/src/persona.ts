// @yuika/contracts, persona manifest schema
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
 /** nama model konkret (OpenAI-compatible id). Kosong = default env YUI_MODEL. */
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
 /** cap paralel MILIK SI PENDELEGASI (persona yang memegang
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
  /** F2 Persona Forge: persona custom (clone-template, dir workspace). */
  custom: z.boolean().default(false),
  /** F2: id persona basis (built-in) yang jadi template custom ini. */
  base: z.string().regex(/^[a-z0-9-]+$/).optional(),
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

// ── F1 (rename persona): override display name per-install, workspace-local ──

/** Entri rename persona (tanpa entri = default manifest). id internal tidak
 *  berubah, hanya tampilan nama + deskripsi. */
export const PersonaRename = z.object({
  personaId: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(40),
  /** null / kosong = kembali ke deskripsi default manifest. */
  description: z.string().max(120).nullable().default(null),
});
export type PersonaRename = z.infer<typeof PersonaRename>;

export const PersonaRenamesResponse = z.object({
  renames: z.array(PersonaRename.extend({ defaultName: z.string() })),
});
export type PersonaRenamesResponse = z.infer<typeof PersonaRenamesResponse>;

export const SetPersonaRenameRequest = PersonaRename;
export type SetPersonaRenameRequest = z.infer<typeof SetPersonaRenameRequest>;

// ── F2 (Persona Forge): persona custom clone-template ────────────────────

/** Id persona custom SELALU berawalan `custom-` (validasi + guard delete:
 * built-in tidak bisa dihapus lewat jalur custom). */
export const CUSTOM_PERSONA_ID_RE = /^custom-[a-z0-9-]+$/;

/** POST /api/personas/custom - forge persona baru dari template basis.
 *  Tools & delegation DIKUNCI dari basis (kekuatan plafon: custom tidak
 *  lebih kuang dari template-nya). Yang dibentuk user: nama, deskripsi,
 *  lapisan prompt (PERSONA.md), pilihan skill dari bank. */
export const CreateCustomPersonaRequest = z.object({
  baseId: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(40),
  description: z.string().min(1).max(120),
  personaMd: z.string().min(1).max(40_000),
  skills: z.array(z.string().min(1)).max(16),
  shape: OrinShapeKey.optional(),
});
export type CreateCustomPersonaRequest = z.infer<typeof CreateCustomPersonaRequest>;

/** PUT /api/personas/custom/:id - ubah lapisan user (nama/deskripsi/prompt/
 *  skills). Tools, basis, delegation, id: tidak bisa diubah. */
export const UpdateCustomPersonaRequest = z.object({
  name: z.string().min(1).max(40),
  description: z.string().min(1).max(120),
  personaMd: z.string().min(1).max(40_000),
  skills: z.array(z.string().min(1)).max(16),
});
export type UpdateCustomPersonaRequest = z.infer<typeof UpdateCustomPersonaRequest>;

/** Hasil create/update: persona custom (id + identitas + basis + tools). */
export const CustomPersonaResult = z.object({
  id: z.string().regex(CUSTOM_PERSONA_ID_RE),
  name: z.string(),
  description: z.string(),
  base: z.string(),
  custom: z.literal(true),
  /** Tools terkunci (salinan basis saat forge) - informatif utk UI. */
  tools: z.array(z.string()),
});
export type CustomPersonaResult = z.infer<typeof CustomPersonaResult>;

/** GET /api/personas/forge-kit - bahan baku wizard Persona Forge: seluruh
 *  persona (built-in + custom, dgn lapisan prompt & skills) + bank skill. */
export const ForgeKitPersona = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  personaMd: z.string(),
  skills: z.array(z.string()),
  custom: z.boolean(),
  base: z.string().optional(),
});
export type ForgeKitPersona = z.infer<typeof ForgeKitPersona>;

export const ForgeKit = z.object({
  personas: z.array(ForgeKitPersona),
  skills: z.array(z.object({ name: z.string(), description: z.string() })),
});
export type ForgeKit = z.infer<typeof ForgeKit>;

// ── P1-PER-5: blind test persona (anti "hanya kosmetik") ──────────────────

/** POST /api/personas/blindtest — mulai run: 2-6 persona × satu prompt uji. */
export const StartBlindTestRequest = z.object({
  personaIds: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(2).max(6),
  promptId: z.string().min(1),
});
export type StartBlindTestRequest = z.infer<typeof StartBlindTestRequest>;

/** POST /api/personas/blindtest/:id/guesses — tebakan penguji (letter→persona). */
export const SubmitBlindGuessesRequest = z.object({
  guesses: z.record(z.string().min(1).max(1), z.string().regex(/^[a-z0-9-]+$/)),
});
export type SubmitBlindGuessesRequest = z.infer<typeof SubmitBlindGuessesRequest>;
