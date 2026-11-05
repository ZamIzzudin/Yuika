// @yui/core — session_search tool (P1-MEM-5): agent menelusuri riwayat
// percakapan sesi-sesi sebelumnya — jawaban atas "kita pernah bahas X di mana?".
// Scope default = project sesi ini; "all" = lintas proyek (tetap satu user/workspace).
import { z } from "zod";
import { registry } from "../registry.js";
import type { ISessionStore } from "../session/store.js";

export function registerSessionSearchTools(store: ISessionStore): void {
  registry.register({
    name: "session_search",
    description:
      "Cari di riwayat percakapan sesi-sesi sebelumnya (pesan user & assistant). Pakai bila butuh keputusan/konteks lama — mis. 'keputusan warna kemarin', 'link referensi dari riset minggu lalu'. Bukan untuk file (itu read_file) atau catatan memori (itu MEMORY.md).",
    parameters: z.object({
      query: z.string().min(2).max(200),
      scope: z.enum(["project", "all"]).default("project"),
      limit: z.number().int().min(1).max(20).default(8),
    }),
    handler: async (args, ctx) => {
      const session = store.getSession(ctx.sessionId);
      const projectId = args.scope === "project" ? (session?.projectId ?? null) : null;
      const hits = store.searchMessages({ query: args.query, projectId, limit: args.limit });
      if (!hits.length) {
        return { result: { hits: [], note: `tidak ada hasil untuk "${args.query}" — coba kata kunci lain atau perpendek` } };
      }
      return {
        result: {
          hits: hits.map((h) => ({
            sessionId: h.sessionId,
            persona: h.personaId,
            role: h.role,
            snippet: h.snippet,
            at: new Date(h.createdAt).toISOString().slice(0, 16).replace("T", " "),
          })),
          note: `${hits.length} hasil (${args.scope === "project" ? "proyek ini" : "semua sesi"}) — konteks penuh: minta user buka sesi, atau lanjutkan dari snippet`,
        },
      };
    },
  });
}
