// Kontrak payload remote (SALINAN VERBATIM dari
// docs/portal/CONTRACTS-REMOTE.md, FROZEN v1, mirror yuika-portal).
// Isi envelope E2E (SPEC-PROTOCOL §5); OPAQUE bagi relay & portal.
// Mengubah shape/enum = proto v2 (SPEC-PROTOCOL §12), jangan edit sepihak.
//
// Amandemen aditif v1.1 (SCR-7, 2026-11): +act watch_screen/unwatch_screen,
// +ev screen.state/screen.frame, +field host.state.screens (opsional).
// Murni aditif: remote lama mem-BUANG ev tak dikenal (safeParse skip), host
// lama membalas error unknown_action, tidak ada hapus/ganti shape.
//
// Amandemen aditif v1.2 (remote mission-control, 2026-11): remote mobile
// jadi project-oriented. +act list_projects / project.detail / project.tasks
// / project.files / project.file.read / project.team / project.activity /
// project.sessions / personas.list / settings.get / settings.usage /
// settings.mcp / settings.update / provider.update / model.route.update /
// mcp.retry / mcp.trust / reset.run / terminal.list / terminal.open /
// terminal.input / terminal.close / list_screens / session.create
// (+ send_prompt.projectId opsional). +ev projects.list / project.* /
// personas.list / settings.state / settings.usage / settings.mcp /
// reset.acked / terminal.list / terminal.state / terminal.output /
// screens.list. Tetap murni aditif (aturan forward-compat §1/§2).
//
// Amandemen aditif v1.3 (chat attachments, D89 2026-11): +act session.upload
// (upload lampiran chat VIA RELAY, di-chunk agar lolos MAX_FRAME 256KB:
// field `chunk` = FRAGMEN base64 (potongan string base64 utuh di sisi
// remote, split kelipatan 4), `part`/`parts` = urutan), +ev
// session.upload.progress {received} utk tiap fragmen non-final, +ev
// session.uploaded {path, bytes} utk fragmen final (path relatif
// workspace; scope: sesi proyek → <root>/uploads/, global →
// workspace/uploads/). Tetap murni aditif.
//
// Aturan (CONTRACTS §1): action ber-rid dibalas event ber-rid sama; delta
// ber-seq per sessionId (resume via subscribe{sinceSeq}); ping_host→pong_host
// tiap 20 dtk; unknown act → event error code "unknown_action".
import { z } from "zod";
import { BudgetStatus, UsageMatrixRow } from "./budget.js";
import { UsageSummary } from "./usage.js";
import { DelegationJob, ProjectInfo, RosterEntry, TaskNode } from "./project.js";
import { McpServerStatus } from "./mcp.js";
import { ProviderSettings } from "./settings.js";

export const RemoteAction = z.discriminatedUnion("act", [
  z.object({
    proto: z.literal(1),
    act: z.literal("send_prompt"),
    rid: z.string(),
    sessionId: z.string(),
    personaId: z.string().optional(),
    /** v1.2: dipakai HANYA saat sesi tak dikenal & personaId diisi
     * (sesi baru menempel ke project ini). */
    projectId: z.string().nullable().optional(),
    message: z.string(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("steer"),
    rid: z.string(),
    sessionId: z.string(),
    note: z.string(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("cancel"),
    rid: z.string(),
    sessionId: z.string(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("approve"),
    rid: z.string(),
    approvalId: z.string(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("reject"),
    rid: z.string(),
    approvalId: z.string(),
    reason: z.string().optional(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("list_sessions"),
    rid: z.string(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("subscribe"),
    rid: z.string(),
    sessions: z.array(z.string()),
    /** resume: seq terakhir yang diterima remote per sesi (map sessionId→seq) */
    sinceSeq: z.record(z.string(), z.number().int()).optional(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("unsubscribe"),
    rid: z.string(),
    sessions: z.array(z.string()),
  }),
  // SCR-7 (v1.1): remote menonton live screen persona di host, 1fps JPEG,
  // read-only (tanpa input/lease di v0).
  z.object({
    proto: z.literal(1),
    act: z.literal("watch_screen"),
    rid: z.string(),
    /** screen key "projectId/personaId" */
    key: z.string(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("unwatch_screen"),
    rid: z.string(),
  }),
  z.object({
    proto: z.literal(1),
    act: z.literal("ping_host"),
    rid: z.string(),
  }),
  // ── Amandemen v1.2: mission-control project-oriented (mobile) ────────
  z.object({ proto: z.literal(1), act: z.literal("list_projects"), rid: z.string() }),
  z.object({ proto: z.literal(1), act: z.literal("project.detail"), rid: z.string(), projectId: z.string() }),
  z.object({ proto: z.literal(1), act: z.literal("project.tasks"), rid: z.string(), projectId: z.string() }),
  z.object({ proto: z.literal(1), act: z.literal("project.files"), rid: z.string(), projectId: z.string() }),
  z.object({ proto: z.literal(1), act: z.literal("project.file.read"), rid: z.string(), projectId: z.string(), relPath: z.string() }),
  z.object({ proto: z.literal(1), act: z.literal("project.team"), rid: z.string(), projectId: z.string() }),
  z.object({ proto: z.literal(1), act: z.literal("project.activity"), rid: z.string(), projectId: z.string(), limit: z.number().int().optional() }),
  z.object({ proto: z.literal(1), act: z.literal("project.sessions"), rid: z.string(), projectId: z.string() }),
  z.object({ proto: z.literal(1), act: z.literal("personas.list"), rid: z.string() }),
  /** Sesi baru (persona dipilih remote, bukan diambil dari sesi lama).
   * projectId wajib utk project non-dungeon yang punya roster (aturan studio). */
  z.object({
    proto: z.literal(1), act: z.literal("session.create"), rid: z.string(),
    personaId: z.string(), projectId: z.string().nullable().optional(),
    message: z.string().optional(),
  }),
  z.object({ proto: z.literal(1), act: z.literal("settings.get"), rid: z.string() }),
  z.object({ proto: z.literal(1), act: z.literal("settings.usage"), rid: z.string() }),
  z.object({ proto: z.literal(1), act: z.literal("settings.mcp"), rid: z.string() }),
  /** Mutasi ringan: mode approval (safety/hardcore) + budget. */
  z.object({
    proto: z.literal(1), act: z.literal("settings.update"), rid: z.string(),
    approvalMode: z.enum(["ask", "auto"]).optional(),
    budget: z.record(z.string(), z.unknown()).optional(),
  }),
  /** Swap provider panas (persist .env di host; key hanya dikirim, tak pernah
   *  dikirim balik — jawaban settings.state memuat keyPreview saja). */
  z.object({
    proto: z.literal(1), act: z.literal("provider.update"), rid: z.string(),
    kind: z.string().optional(), baseUrl: z.string().optional(),
    apiKey: z.string().optional(), model: z.string().optional(),
    fallbackModel: z.string().nullish(), auxModel: z.string().nullish(),
  }),
  z.object({
    proto: z.literal(1), act: z.literal("model.route.update"), rid: z.string(),
    personaId: z.string(), model: z.string().optional(), fallback: z.string().optional(),
  }),
  z.object({ proto: z.literal(1), act: z.literal("mcp.retry"), rid: z.string(), name: z.string() }),
  z.object({
    proto: z.literal(1), act: z.literal("mcp.trust"), rid: z.string(),
    server: z.string(), trusted: z.boolean(), denyTools: z.array(z.string()).optional(),
  }),
  /** Reset data host (D70). confirm WAJIB "RESET". Host menjawab
   *  reset.acked LALU keluar (engine restart); remote melihat host_offline. */
  z.object({
    proto: z.literal(1), act: z.literal("reset.run"), rid: z.string(),
    scope: z.enum(["work", "factory"]), confirm: z.literal("RESET"),
  }),
  z.object({ proto: z.literal(1), act: z.literal("terminal.list"), rid: z.string() }),
  z.object({
    proto: z.literal(1), act: z.literal("terminal.open"), rid: z.string(),
    projectId: z.string().nullable().optional(),
  }),
  z.object({ proto: z.literal(1), act: z.literal("terminal.input"), id: z.string(), data: z.string() }),
  /** Lepas langganan remote (sesi terminal SHARED tetap hidup di host). */
  z.object({ proto: z.literal(1), act: z.literal("terminal.close"), rid: z.string(), id: z.string() }),
  z.object({ proto: z.literal(1), act: z.literal("list_screens"), rid: z.string() }),
  // v1.3: lampiran chat via relay — base64 utuh dipecah fragmen (kelipatan 4
  // karakter) karena MAX_FRAME relay 256KB; fragmen FINAL dibalas
  // session.uploaded, non-final dibalas session.upload.progress.
  z.object({
    proto: z.literal(1),
    act: z.literal("session.upload"),
    rid: z.string(),
    sessionId: z.string(),
    name: z.string(),
    /** index fragmen 0-based; total fragmen. */
    part: z.number().int().min(0),
    parts: z.number().int().min(1),
    /** fragmen base64 (panjang kelipatan 4). */
    chunk: z.string(),
  }).refine((a) => a.part < a.parts, { message: "part must be < parts" }),
]);
export type RemoteAction = z.infer<typeof RemoteAction>;

export const RemoteEvent = z.discriminatedUnion("ev", [
  z.object({
    proto: z.literal(1),
    ev: z.literal("host.state"),
    /** persona roster ringkas + sesi aktif, dikirim saat remote join */
    sessions: z.array(z.object({
      sessionId: z.string(),
      title: z.string(),
      personaId: z.string(),
      updatedAt: z.number().int(),
    })),
    /** SCR-7 (v1.1): live screen aktif di host (opsional, remote lama abaikan). */
    screens: z.array(z.object({
      key: z.string(),
      personaId: z.string(),
      url: z.string(),
      title: z.string(),
      status: z.enum(["starting", "running", "stopped", "failed"]),
      viewers: z.number().int(),
      watchers: z.number().int(),
    })).optional(),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("session.list"),
    rid: z.string(),
    sessions: z.array(z.object({
      sessionId: z.string(),
      title: z.string(),
      personaId: z.string(),
      updatedAt: z.number().int(),
    })),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("session.snapshot"),
    rid: z.string().optional(),
    sessionId: z.string(),
    /** transcript ringkas (≤ 50 pesan terakhir) untuk render cepat */
    messages: z.array(z.object({
      role: z.enum(["user", "assistant", "tool"]),
      personaId: z.string().optional(),
      text: z.string(),
      at: z.number().int(),
    })),
    latestSeq: z.number().int(),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("message.delta"),
    sessionId: z.string(),
    seq: z.number().int(),
    delta: z.string(),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("message.done"),
    sessionId: z.string(),
    seq: z.number().int(),
    finish: z.enum(["stop", "error", "cancelled"]),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("approval.request"),
    sessionId: z.string().optional(),
    approvalId: z.string(),
    title: z.string(),
    summary: z.string(),
    risk: z.enum(["low", "medium", "high"]),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("approval.resolved"),
    approvalId: z.string(),
    resolution: z.enum(["approved", "rejected", "timeout"]),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("delegation.update"),
    sessionId: z.string().optional(),
    jobId: z.string(),
    state: z.enum(["started", "progress", "done", "error", "paused"]),
    detail: z.string().optional(),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("error"),
    rid: z.string().optional(),
    code: z.string(),
    message: z.string(),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("pong_host"),
    rid: z.string(),
  }),
  // v1.3: balasan per-fragmen upload (non-final).
  z.object({
    proto: z.literal(1),
    ev: z.literal("session.upload.progress"),
    rid: z.string(),
    /** jumlah fragmen yang sudah diterima host. */
    received: z.number().int(),
  }),
  // v1.3: upload selesai (fragmen final) — path relatif workspace.
  z.object({
    proto: z.literal(1),
    ev: z.literal("session.uploaded"),
    rid: z.string(),
    path: z.string(),
    bytes: z.number().int(),
  }),
  // SCR-7 (v1.1): remote watch, state saat mulai/berubah; frame ~1fps.
  z.object({
    proto: z.literal(1),
    ev: z.literal("screen.state"),
    rid: z.string().optional(),
    key: z.string(),
    url: z.string(),
    title: z.string(),
    status: z.enum(["starting", "running", "stopped", "failed"]),
    viewers: z.number().int(),
    watchers: z.number().int(),
    leaseOwner: z.string().nullable(),
  }),
  z.object({
    proto: z.literal(1),
    ev: z.literal("screen.frame"),
    key: z.string(),
    /** base64 JPEG, di-throttle 1fps + dedupe frame identik di host. */
    data: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    ts: z.number().int(),
  }),
  // ── Amandemen v1.2: mission-control project-oriented (mobile) ────────
  z.object({
    proto: z.literal(1), ev: z.literal("projects.list"), rid: z.string(),
    projects: z.array(z.object({
      project: ProjectInfo,
      taskStats: z.object({ todo: z.number().int(), doing: z.number().int(), done: z.number().int(), review: z.number().int() }),
      activeDelegations: z.number().int(),
      sessions: z.array(z.object({
        sessionId: z.string(), personaId: z.string(), title: z.string(), updatedAt: z.number().int(),
      })),
    })),
  }),
  z.object({
    proto: z.literal(1), ev: z.literal("project.detail"), rid: z.string(),
    project: ProjectInfo,
    taskStats: z.object({ todo: z.number().int(), doing: z.number().int(), done: z.number().int(), review: z.number().int() }),
    activeDelegations: z.number().int(),
  }),
  z.object({
    proto: z.literal(1), ev: z.literal("project.tasks"), rid: z.string(),
    projectId: z.string(), tree: z.array(TaskNode),
  }),
  z.object({
    proto: z.literal(1), ev: z.literal("project.files"), rid: z.string(),
    projectId: z.string(),
    tree: z.array(z.object({
      name: z.string(), relPath: z.string(), dir: z.boolean(),
      size: z.number().int(),
      children: z.array(z.lazy(() => z.unknown())).optional(),
    })),
  }),
  z.object({
    proto: z.literal(1), ev: z.literal("project.file"), rid: z.string(),
    projectId: z.string(), relPath: z.string(),
    content: z.string(), truncated: z.boolean(),
  }),
  z.object({
    proto: z.literal(1), ev: z.literal("project.team"), rid: z.string(),
    projectId: z.string(),
    roster: z.array(RosterEntry),
    delegations: z.array(DelegationJob),
  }),
  z.object({
    proto: z.literal(1), ev: z.literal("project.activity"), rid: z.string(),
    projectId: z.string(),
    entries: z.array(z.object({
      at: z.number().int(), sessionId: z.string(), personaId: z.string(),
      kind: z.enum(["tool", "screen", "vault", "delegation", "approval", "qa"]),
      label: z.string(), isError: z.boolean().optional(),
    })),
  }),
  z.object({
    proto: z.literal(1), ev: z.literal("project.sessions"), rid: z.string(),
    projectId: z.string(),
    sessions: z.array(z.object({
      sessionId: z.string(), personaId: z.string(), title: z.string(), updatedAt: z.number().int(),
    })),
  }),
  z.object({
    proto: z.literal(1), ev: z.literal("personas.list"), rid: z.string(),
    personas: z.array(z.object({ id: z.string(), name: z.string(), model: z.string().nullable() })),
  }),
  z.object({
    proto: z.literal(1), ev: z.literal("settings.state"), rid: z.string().optional(),
    approvalMode: z.enum(["ask", "auto"]),
    budget: BudgetStatus,
    provider: ProviderSettings,
    modelRoutes: z.object({
      defaultModel: z.string(), defaultFallback: z.string(),
      overrides: z.record(z.string(), z.object({ model: z.string(), fallback: z.string() })),
      personas: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
    resetPending: z.boolean(),
  }),
  z.object({
    proto: z.literal(1), ev: z.literal("settings.usage"), rid: z.string(),
    summary: UsageSummary, matrix: z.array(UsageMatrixRow),
  }),
  z.object({
    proto: z.literal(1), ev: z.literal("settings.mcp"), rid: z.string(),
    servers: z.array(McpServerStatus),
  }),
  z.object({
    proto: z.literal(1), ev: z.literal("reset.acked"), rid: z.string(),
    scope: z.enum(["work", "factory"]),
  }),
  z.object({
    proto: z.literal(1), ev: z.literal("terminal.list"), rid: z.string(),
    sessions: z.array(z.object({
      id: z.string(), backend: z.enum(["docker", "local"]),
      workspacePath: z.string(), createdAt: z.number().int(),
      lastActivity: z.number().int(), exited: z.boolean(),
    })),
  }),
  z.object({
    proto: z.literal(1), ev: z.literal("terminal.state"), rid: z.string(),
    id: z.string(),
    info: z.object({
      id: z.string(), backend: z.enum(["docker", "local"]),
      workspacePath: z.string(), createdAt: z.number().int(),
      lastActivity: z.number().int(), exited: z.boolean(),
    }),
    /** ekor buffer host (replay), sudah dipotong host. */
    replay: z.string(),
  }),
  z.object({
    proto: z.literal(1), ev: z.literal("terminal.output"),
    id: z.string(), data: z.string(),
  }),
  z.object({
    proto: z.literal(1), ev: z.literal("screens.list"), rid: z.string(),
    screens: z.array(z.object({
      key: z.string(), personaId: z.string(), url: z.string(), title: z.string(),
      status: z.enum(["starting", "running", "stopped", "failed"]),
      viewers: z.number().int(), watchers: z.number().int(),
    })),
  }),
]);
export type RemoteEvent = z.infer<typeof RemoteEvent>;
