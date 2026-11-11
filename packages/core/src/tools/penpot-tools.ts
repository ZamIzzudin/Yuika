// @yuika/core, P2-DSN-2: tools Penpot untuk persona Designer (fase design).
// Jalur v0: headless via RPC (create/update file + share-link), user
// memantau lewat viewer share-link (tab Design, P2-DSN-3). Konfigurasi via
// env YUI_PENPOT_URL + YUI_PENPOT_TOKEN (instance self-host); tanpa env →
// semua tool balas pesan "belum dikonfigurasi" (bukan error mentah).
import { z } from "zod";
import { registry } from "../registry.js";
import { createPenpotClient, penpotConfig, type PenpotClient } from "../penpot/client.js";
import { loadPenpotState, savePenpotState, type PenpotState } from "../penpot/state.js";

const MAX_SUMMARY_CHARS = 60_000;

const changesSchema = z.union([
  z.string().min(2).describe("Array `changes` Penpot sebagai string JSON"),
  z.array(z.record(z.string(), z.unknown())).min(1).describe("Array `changes` Penpot"),
]);

function notConfigured() {
  return {
    result: {
      error:
        "Penpot belum dikonfigurasi di host ini: set YUI_PENPOT_URL (origin instance self-host, mis. http://localhost:9001) + YUI_PENPOT_TOKEN (personal access token dari Penpot profile settings), lalu restart host. Tanpa itu fase design tetap bisa jalan lewat artefak file biasa.",
    },
    isError: true,
  };
}

function parseChanges(input: string | Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const arr = typeof input === "string" ? (JSON.parse(input) as unknown) : input;
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("changes harus array non-kosong (lihat skill penpot-designer-basics)");
  return arr as Array<Record<string, unknown>>;
}

/** Ringkas objek satu halaman: cukup untuk generate komponen (fase develop). */
function summarizePageObjects(data: Record<string, unknown>): Array<Record<string, unknown>> {
  const pages = Array.isArray(data.pages) ? (data.pages as Array<Record<string, unknown>>) : [];
  const out: Array<Record<string, unknown>> = [];
  for (const p of pages) {
    const objects = (p.objects ?? {}) as Record<string, Record<string, unknown>>;
    for (const [id, o] of Object.entries(objects)) {
      out.push({
        pageId: String(p.id),
        pageName: String(p.name ?? ""),
        id,
        name: o.name ?? "",
        type: o.type ?? "",
        x: o.x ?? 0,
        y: o.y ?? 0,
        width: o.width ?? 0,
        height: o.height ?? 0,
      });
    }
  }
  return out.slice(0, 300);
}

export function registerPenpotTools(workspacePath: string): void {
  const client = (): PenpotClient | null => {
    const cfg = penpotConfig();
    if (!cfg.baseUrl || !cfg.token) return null;
    return createPenpotClient(cfg);
  };

  registry.register({
    name: "penpot_status",
    description: "Cek koneksi Penpot: terkonfigurasi?, profil token, default team/project, daftar file desain (+ URL viewer share-link untuk embed).",
    parameters: z.object({}),
    handler: async () => {
      const c = client();
      if (!c) return notConfigured();
      const state = loadPenpotState(workspacePath);
      try {
        const profile = await c.getProfile();
        return {
          result: {
            baseUrl: penpotConfig().baseUrl,
            profile: { id: profile.id, name: profile.name, email: profile.email },
            defaultTeamId: state.defaultTeamId ?? null,
            defaultProjectId: state.defaultProjectId ?? null,
            files: Object.entries(state.files).map(([fileId, f]) => ({
              fileId,
              name: f.name,
              revn: f.revn,
              viewerUrl: f.shareId ? c.viewerUrl(f.shareId) : null,
            })),
          },
        };
      } catch (e) {
        return { result: { error: e instanceof Error ? e.message : String(e) }, isError: true };
      }
    },
  });

  registry.register({
    name: "penpot_setup_project",
    description: "Sekali per host: pilih team pertama token, cari/buat project Penpot untuk Yuika, simpan sebagai default (dipakai penpot_create_file).",
    parameters: z.object({ name: z.string().min(1).max(120).default("Yuika Designs") }),
    handler: async (args) => {
      const c = client();
      if (!c) return notConfigured();
      const state = loadPenpotState(workspacePath);
      try {
        const teams = await c.getTeams();
        if (!teams.length) throw new Error("token ini tidak punya team; buat team dulu di UI Penpot");
        const team = teams[0] as { id?: string; name?: string };
        const teamId = String(team.id);
        const projects = await c.getProjects(teamId);
        const existing = projects.find((p) => String(p.name) === args.name);
        const proj = existing
          ? { id: String(existing.id), name: args.name, teamId }
          : await c.createProject(teamId, args.name);
        state.defaultTeamId = teamId;
        state.defaultProjectId = proj.id;
        savePenpotState(workspacePath, state);
        return { result: { teamId, teamName: String(team.name ?? ""), projectId: proj.id, projectName: proj.name, created: !existing } };
      } catch (e) {
        return { result: { error: e instanceof Error ? e.message : String(e) }, isError: true };
      }
    },
  });

  registry.register({
    name: "penpot_create_file",
    description: "Buat file desain baru di project default + share-link viewer untuk halaman pertamanya; kembalikan fileId, page, dan viewerUrl (untuk di-embed/dibagikan ke user).",
    parameters: z.object({
      name: z.string().min(1).max(250),
      projectId: z.string().uuid().optional().describe("Default: project dari penpot_setup_project"),
    }),
    handler: async (args) => {
      const c = client();
      if (!c) return notConfigured();
      const state = loadPenpotState(workspacePath);
      const projectId = args.projectId ?? state.defaultProjectId;
      if (!projectId) {
        return { result: { error: "belum ada project default; panggil penpot_setup_project dulu" }, isError: true };
      }
      try {
        const file = await c.createFile(projectId, args.name);
        const firstPage = file.pages[0];
        if (!firstPage) throw new Error("file baru tanpa halaman (aneh, cek versi Penpot)");
        const share = await c.createShareLink(file.id, [firstPage.id], { whoInspect: "all" });
        state.files[file.id] = { name: args.name, shareId: share.id, revn: file.revn, pages: file.pages, updatedAt: Date.now() };
        state.lastFileId = file.id;
        savePenpotState(workspacePath, state);
        return { result: { fileId: file.id, name: file.name, revn: file.revn, page: firstPage, shareId: share.id, viewerUrl: c.viewerUrl(share.id, firstPage.id) } };
      } catch (e) {
        return { result: { error: e instanceof Error ? e.message : String(e) }, isError: true };
      }
    },
  });

  registry.register({
    name: "penpot_update_file",
    description: "Kirim vektor `changes` Penpot (protokol editor: add-obj/set-obj/mod-obj/del-obj, dst) ke file desain. revn otomatis dari cache; viewer share-link melihat hasilnya realtime. Kembalikan revn baru + viewerUrl.",
    parameters: z.object({
      changes: changesSchema,
      fileId: z.string().uuid().optional().describe("Default: file terakhir yang dibuat/dipakai"),
      revn: z.number().int().min(0).optional().describe("Override revn (default: cache state)"),
    }),
    handler: async (args) => {
      const c = client();
      if (!c) return notConfigured();
      let changes: Array<Record<string, unknown>>;
      try {
        changes = parseChanges(args.changes);
      } catch (e) {
        return { result: { error: `changes tidak valid: ${e instanceof Error ? e.message : String(e)}` }, isError: true };
      }
      const state: PenpotState = loadPenpotState(workspacePath);
      const fileId = args.fileId ?? state.lastFileId;
      const cached = fileId ? state.files[fileId] : undefined;
      if (!fileId || !cached) {
        return { result: { error: "file tidak dikenal; panggil penpot_create_file dulu (atau berikan fileId)" }, isError: true };
      }
      try {
        const r = await c.updateFile(fileId, changes, args.revn ?? cached.revn);
        cached.revn = r.revn;
        cached.updatedAt = Date.now();
        savePenpotState(workspacePath, state);
        const viewerUrl = cached.shareId ? c.viewerUrl(cached.shareId) : null;
        return { result: { fileId, revn: r.revn, applied: changes.length, viewerUrl } };
      } catch (e) {
        return { result: { error: e instanceof Error ? e.message : String(e) }, isError: true };
      }
    },
  });

  registry.register({
    name: "penpot_get_file",
    description: "Baca struktur file desain: halaman + ringkasan semua objek (id, name, type, posisi, ukuran) untuk generate komponen di fase develop. pageId opsional fokus satu halaman.",
    parameters: z.object({
      fileId: z.string().uuid().optional().describe("Default: file terakhir yang dipakai"),
      pageId: z.string().uuid().optional(),
    }),
    handler: async (args) => {
      const c = client();
      if (!c) return notConfigured();
      const state = loadPenpotState(workspacePath);
      const fileId = args.fileId ?? state.lastFileId;
      const cached = fileId ? state.files[fileId] : undefined;
      if (!fileId || !cached) {
        return { result: { error: "file tidak dikenal; panggil penpot_create_file dulu (atau berikan fileId)" }, isError: true };
      }
      try {
        const { summary, data } = await c.getFile(fileId);
        cached.revn = summary.revn; // refresh cache (membantu update setelah get)
        cached.pages = summary.pages;
        cached.updatedAt = Date.now();
        savePenpotState(workspacePath, state);
        let objects = summarizePageObjects(data);
        if (args.pageId) objects = objects.filter((o) => o.pageId === args.pageId);
        const out = {
          fileId,
          name: summary.name,
          revn: summary.revn,
          pages: summary.pages,
          objectCount: objects.length,
          objects,
          viewerUrl: cached.shareId ? c.viewerUrl(cached.shareId) : null,
        };
        const json = JSON.stringify(out);
        if (json.length > MAX_SUMMARY_CHARS) {
          return { result: { error: `file terlalu padat untuk satu pembacaan (${json.length} chars); panggil ulang dengan pageId per halaman` }, isError: true };
        }
        return { result: out };
      } catch (e) {
        return { result: { error: e instanceof Error ? e.message : String(e) }, isError: true };
      }
    },
  });
}
