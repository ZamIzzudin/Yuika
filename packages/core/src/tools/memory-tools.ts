// @yui/core — memory tools (P1-MEM-1 + P1-MEM-6): agent menyimpan catatan reusable.
// USER.md (scope user) / MEMORY.md (scope project) / memory/domains/<domain>.md
// (scope domain — keahlian persona lintas project, milik persona).
// Append terkurasi + dedupe (memory/manager). Tanpa approval: catatan
// additive & milik user (bisa dihapus lewat editor "Memori" kapan pun).
import { z } from "zod";
import { registry } from "../registry.js";
import { appendCurated } from "../memory/manager.js";
import type { SessionStore } from "../session/store.js";
import type { ProjectStore } from "../project/store.js";

const appendSchema = z.object({
  scope: z
    .enum(["user", "project", "domain"])
    .default("user")
    .describe(
      "user = preferensi lintas project; project = keputusan/pelajaran proyek ini; domain = keahlian bidangmu yang berlaku lintas project",
    ),
  note: z
    .string()
    .min(3)
    .max(400)
    .describe("satu catatan ringkas, spesifik, reusable — bukan ringkasan percakapan"),
});

export function registerMemoryTools(deps: {
  sessionStore: SessionStore;
  projects: ProjectStore;
  workspacePath: string;
  /** P1-MEM-6: domain persona pemanggil (dari manifest) — undefined bila tak tersedia. */
  domainOfPersona?: (personaId: string) => string | null;
}): void {
  registry.register({
    name: "memory_append",
    description:
      "Simpan catatan yang layak diingat jangka panjang: preferensi user (cara menjawab, gaya, batasan) atau keputusan/pelajaran project (stack yang dipilih, struktur folder, hasil riset kunci). Hanya untuk hal yang BENAR-BENAR reusable — jangan mencatat tugas sesaat. Catatan tampil di editor 'Memori' dan dibaca pada sesi berikutnya.",
    parameters: appendSchema,
    handler: async (args, ctx) => {
      const { scope, note } = appendSchema.parse(args);
      const session = deps.sessionStore.getSession(ctx.sessionId);
      if (!session) throw new Error("sesi tidak ditemukan");
      let projectRootPath: string | null = null;
      if (scope === "project") {
        const pid = session.projectId;
        if (!pid) throw new Error("scope project hanya untuk sesi yang melekat ke project");
        const project = deps.projects.getProject(pid);
        if (!project) throw new Error(`project tidak ditemukan: ${pid}`);
        projectRootPath = `${deps.workspacePath}/${project.rootPath}`;
      }
      // P1-MEM-6: scope domain → memori bidang persona pemanggil (lintas project).
      const domain = scope === "domain" ? deps.domainOfPersona?.(session.personaId) ?? null : null;
      if (scope === "domain" && !domain) throw new Error("domain persona tidak diketahui — scope domain tidak tersedia");
      const short = session.personaId.replace(/^yui-/, "");
      const personaName = `Yui ${short.charAt(0).toUpperCase()}${short.slice(1)}`;
      const written = appendCurated(deps.workspacePath, scope, note, personaName, projectRootPath, domain);
      const file = scope === "user" ? "USER.md" : scope === "project" ? "MEMORY.md" : `memory/domains/${domain}.md`;
      return {
        result: written ? `tercatat di ${file} — berlaku di sesi baru berikutnya (frozen per sesi)` : "di-skip: catatan serupa sudah ada (dedupe)",
      };
    },
  });
}
