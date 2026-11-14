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

// ── F2 (Persona Forge): persona custom - persona baru di luar built-in ──

/** Id persona custom SELALU berawalan `custom-` (validasi + guard delete:
 *  built-in tidak bisa dihapus lewat jalur custom). */
export const CUSTOM_PERSONA_ID_RE = /^custom-[a-z0-9-]+$/;

/** Katalog native functions yang boleh dipilih persona custom, dikelompokkan
 *  per kategori (UI Forge). Alat WORKFLOW/DELEGASI (delegate_task, consult)
 *  SENGAJA di luar daftar: persona custom = pelaksana mandiri, bukan
 *  orchestrator (konsisten dgn delegation.yaml terkunci can_spawn []). */
export const TOOL_CATEGORIES = [
  { id: "files", label: "Files & docs", tools: ["read_file", "write_file", "list_files", "search_files", "doc_read"] },
  { id: "terminal", label: "Terminal & commands", tools: ["terminal", "run_command", "run_in_workshop"] },
  { id: "browser", label: "Browser & screen", tools: ["browser_open", "browser_snapshot", "browser_click", "browser_type", "browser_press", "browser_scroll", "request_takeover", "request_login", "screen_status"] },
  { id: "design", label: "Design canvas", tools: ["design_list", "design_create_file", "design_get_file", "design_add_page", "design_add_shape", "design_update_shape", "design_delete_shape", "design_delete_page", "design_delete_file"] },
  { id: "web", label: "Web & research", tools: ["web_search", "web_fetch", "secret_http"] },
  { id: "skills", label: "Skills, memory & todos", tools: ["skills_list", "skill_view", "skill_propose", "memory_append", "session_search", "todo_list", "todo_add", "todo_update"] },
  { id: "vault", label: "Vault (secrets)", tools: ["vault_request", "vault_list", "vault_forget"] },
  { id: "qa", label: "QA watch", tools: ["qa_check", "qa_snapshot", "qa_watch"] },
] as const;

/** Flat daftar tool yang diizinkan utk persona custom (validasi create/
 *  update/import). Wildcard mcp__* TIDAK diizinkan - hanya native. */
export const CUSTOM_ALLOWED_TOOLS: readonly string[] = TOOL_CATEGORIES.flatMap((c) => [...c.tools]);

/** POST /api/personas/custom - buat persona baru (bukan clone): identitas +
 *  lapisan prompt + pilihan native functions + skills dari bank (+shape).
 *  Delegation tetap dikunci (can_spawn [], spawnable_by [user]). */
export const CreateCustomPersonaRequest = z.object({
  name: z.string().min(1).max(40),
  description: z.string().min(1).max(120),
  personaMd: z.string().min(1).max(40_000),
  tools: z.array(z.string().min(1)).min(1).max(48),
  skills: z.array(z.string().min(1)).max(16),
  shape: OrinShapeKey.optional(),
});
export type CreateCustomPersonaRequest = z.infer<typeof CreateCustomPersonaRequest>;

/** PUT /api/personas/custom/:id - ubah lapisan user SEMUANYA (termasuk
 *  pilihan native functions). Id, delegation, custom flag: tetap. */
export const UpdateCustomPersonaRequest = z.object({
  name: z.string().min(1).max(40),
  description: z.string().min(1).max(120),
  personaMd: z.string().min(1).max(40_000),
  tools: z.array(z.string().min(1)).min(1).max(48),
  skills: z.array(z.string().min(1)).max(16),
});
export type UpdateCustomPersonaRequest = z.infer<typeof UpdateCustomPersonaRequest>;

/** Hasil create/update: persona custom (id + identitas + tools aktif). */
export const CustomPersonaResult = z.object({
  id: z.string().regex(CUSTOM_PERSONA_ID_RE),
  name: z.string(),
  description: z.string(),
  base: z.string().optional(),
  custom: z.literal(true),
  tools: z.array(z.string()),
});
export type CustomPersonaResult = z.infer<typeof CustomPersonaResult>;

/** File share persona (export/import antar-install). Format = identitas +
 *  prompt + native functions + skills; SEMUA divalidasi ulang saat import
 *  (tidak ada kepercayaan buta pada file dari luar). */
export const PERSONA_SHARE_FORMAT = "yuika-persona";

export const PersonaShareFile = z.object({
  format: z.literal(PERSONA_SHARE_FORMAT),
  version: z.literal(1),
  name: z.string().min(1).max(40),
  description: z.string().min(1).max(120),
  personaMd: z.string().min(1).max(40_000),
  tools: z.array(z.string().min(1)).min(1).max(48),
  skills: z.array(z.string().min(1)).max(16),
  shape: OrinShapeKey.optional(),
});
export type PersonaShareFile = z.infer<typeof PersonaShareFile>;

/** GET /api/personas/forge-kit - bahan baku wizard Persona Forge (F2):
 *  persona lengkap (lapisan prompt + skills + tools) + bank skill +
 *  deskripsi native functions (tooltip). */
export const ForgeKitPersona = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  personaMd: z.string(),
  tools: z.array(z.string()),
  skills: z.array(z.string()),
  custom: z.boolean(),
  base: z.string().optional(),
});
export type ForgeKitPersona = z.infer<typeof ForgeKitPersona>;

export const ForgeKit = z.object({
  personas: z.array(ForgeKitPersona),
  skills: z.array(z.object({ name: z.string(), description: z.string() })),
  /** id -> deskripsi tool (tooltip; tool tak terdaftar = kosong). */
  nativeTools: z.record(z.string(), z.string()),
});
export type ForgeKit = z.infer<typeof ForgeKit>;
