// @yuika/core — web tools (Batch 7 · Research Engine):
//  · web_search — provider chain (wikipedia/github/hn/stackex/docsites/news/market/
//    social + searxng/ddg fallback); hasil parsial + daftar provider gagal.
//  · web_fetch  — pipeline riset: SSRF/policy guard (browser/reader) + robots +
//    throttle domain + Readability→markdown; cache + budget per sesi.
// P2-STU-4 tetap: fetch agent tercatat di riwayat tab Browser project.
import { z } from "zod";
import { registry } from "../registry.js";
import type { ProjectStore } from "../project/store.js";
import type { ISessionStore } from "../session/store.js";
import type { ResearchCache } from "../research/cache.js";
import { researchConfig, getResearchBudget, researchFetch, researchPolicyFor, researchSearch } from "../research/index.js";
import { ResearchError } from "../research/types.js";
import { withTimeout } from "../research/util.js";

const searchSchema = z.object({
  query: z.string().min(2).max(300),
  limit: z.number().int().min(1).max(10).default(5),
});

const fetchSchema = z.object({
  url: z.string().url(),
  maxChars: z.number().int().positive().max(20_000).default(8_000),
});

/** Pesan tool ENGLISH (dibaca agent) — kode error tetap machine-readable. */
function friendlyError(e: ResearchError): string {
  switch (e.code) {
    case "host_denied":
      return `Blocked by project browser policy: ${e.message} — ask the owner to allow the domain (Browser tab policy file)`;
    case "private_blocked":
      return `Blocked by SSRF guard: ${e.message}`;
    case "robots_denied":
      return e.message;
    case "budget_exceeded":
      return e.message;
    default:
      return `${e.code}: ${e.message}`;
  }
}

export function registerWebTools(deps?: {
  sessionStore: ISessionStore;
  projects: ProjectStore;
  /** cache riset dari runtime (SQLite lintas project); kosong → in-memory */
  cache?: ResearchCache;
}): void {
  const config = () => researchConfig();
  const cache = deps?.cache;

  registry.register({
    name: "web_search",
    description:
      "Search the web (free providers: news, market prices, social posts, Wikipedia, GitHub, StackOverflow, docs sites; general engine fallback). Returns results with title/url/snippet/source. Use before guessing URLs; then web_fetch the best sources.",
    parameters: searchSchema,
    handler: async (args, ctx) => {
      if (config().off) {
        return { result: { results: [], errors: [], note: "research disabled by operator (YUI_RESEARCH_OFF)" } };
      }
      // Watchdog (bug nyata 2026-11): await internal tanpa deadline (DNS, stream)
      // bisa menggantung turn selamanya — tool WAJIB selalu balik.
      const outcome = await withTimeout(
        researchSearch(args.query, {
          limit: args.limit,
          cache,
          sessionId: ctx.sessionId,
          budget: getResearchBudget(),
          searxngUrl: config().searxngUrl,
          ddgEnabled: config().ddgEnabled,
        }),
        25_000,
        "web_search timed out (25s watchdog)",
      );
      return {
        result: {
          results: outcome.results,
          errors: outcome.errors,
          cached: outcome.cached,
          note: outcome.errors.length
            ? "partial results — failed providers listed in errors; refine the query instead of retrying the same one"
            : undefined,
        },
      };
    },
  });

  registry.register({
    name: "web_fetch",
    description:
      "Fetch a web page and extract clean markdown (Readability; falls back to plain text). Respects robots.txt, per-domain rate limits, SSRF guards, and the project browser policy. For research after web_search.",
    parameters: fetchSchema,
    handler: async (args, ctx) => {
      if (config().off) {
        return { result: { error: "disabled", message: "research disabled by operator (YUI_RESEARCH_OFF)" }, isError: true };
      }
      try {
        // Watchdog: pipeline punya timeout per-hop 20 dtk, tapi DNS/redirect/stream
        // bisa bocor — jamin tool selalu menyelesaikan turn.
        const outcome = await withTimeout(
          researchFetch(args.url, {
            policy: researchPolicyFor(ctx.workspacePath),
            maxChars: args.maxChars,
            cache,
            sessionId: ctx.sessionId,
            budget: getResearchBudget(),
            domainDelayMs: config().domainDelayMs,
          }),
          45_000,
          "web_fetch timed out (45s watchdog)",
        );
        // P2-STU-4: catat kunjungan agent utk riwayat tab Browser project.
        if (deps) {
          try {
            const pid = deps.sessionStore.getSession(ctx.sessionId)?.projectId;
            if (pid) deps.projects.addBrowserVisit({ projectId: pid, url: outcome.page.url, title: outcome.page.title || null, byRole: "agent" });
          } catch {
            /* riwayat bersifat best-effort */
          }
        }
        return {
          result: {
            url: outcome.page.url,
            status: outcome.status,
            title: outcome.page.title,
            text: outcome.page.markdown,
            extractor: outcome.extractor,
            cached: outcome.cached,
          },
        };
      } catch (e) {
        if (e instanceof ResearchError) {
          return { result: { error: e.code, message: friendlyError(e) }, isError: true };
        }
        return { result: { error: "fetch_failed", message: (e as Error).message }, isError: true };
      }
    },
  });
}
