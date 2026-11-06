// @yuika/core — web tools: web_fetch utk riset agent. P2-STU-4: fetch agent
// juga tercatat di riwayat tab Browser project ("user melihat halaman yang
// sama dgn agent") bila sesi melekat ke project.
import { z } from "zod";
import { registry } from "../registry.js";
import type { ProjectStore } from "../project/store.js";
import type { ISessionStore } from "../session/store.js";

const fetchSchema = z.object({
  url: z.string().url(),
  maxChars: z.number().int().positive().max(20_000).default(8_000),
});

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function registerWebTools(deps?: { sessionStore: ISessionStore; projects: ProjectStore }): void {
  registry.register({
    name: "web_fetch",
    description: "Fetch URL dan ekstrak teksnya (HTML dipangkas). Untuk riset web.",
    parameters: fetchSchema,
    handler: async (args: z.infer<typeof fetchSchema>, ctx) => {
      const res = await fetch(args.url, {
        signal: AbortSignal.timeout(15_000),
        headers: { "user-agent": "Yuika/0.1 (demo)" },
      });
      const contentType = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      const text = contentType.includes("html") ? htmlToText(raw) : raw;
      // P2-STU-4: catat kunjungan agent utk tab Browser project (bila ada).
      if (deps) {
        try {
          const pid = deps.sessionStore.getSession(ctx.sessionId)?.projectId;
          if (pid) {
            const title = /<title[^>]*>([\s\S]{0,200}?)<\/title>/i.exec(raw)?.[1]?.trim() ?? null;
            deps.projects.addBrowserVisit({ projectId: pid, url: args.url, title, byRole: "agent" });
          }
        } catch {
          /* riwayat bersifat best-effort */
        }
      }
      return {
        result: { url: args.url, status: res.status, text: text.slice(0, args.maxChars) },
      };
    },
  });
}
