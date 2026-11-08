// (RS-1), router search: cache → site-router (intent-aware) → engine umum
// (searxng bila dikonfigurasi, ddg fallback nonofficial). Hasil selalu parsial +
// daftar provider yang gagal, agent memutuskan ganti query, bukan menabrak ulang.
import { createHash } from "node:crypto";
import type { ResearchCache } from "./cache.js";
import type { ResearchBudget } from "./budget.js";
import type { SearchProvider, SearchResult } from "./types.js";
import { wikipediaProvider } from "./providers/wikipedia.js";
import { githubProvider } from "./providers/github.js";
import { hnProvider } from "./providers/hn.js";
import { stackexProvider } from "./providers/stackex.js";
import { docsitesProvider } from "./providers/docsites.js";
import { ddgProvider } from "./providers/ddg.js";
import { searxngProvider } from "./providers/searxng.js";
import { withTimeout } from "./util.js";
import { newsProvider } from "./providers/news.js";
import { marketProvider } from "./providers/market.js";
import { socialProvider } from "./providers/social.js";

export const SEARCH_TTL_MS = 12 * 3600_000;

/** Urutan prioritas site-router: intent-spesifik dulu (news/market/social/docs),
 *  lalu umum. Engine umum (searxng/ddg) selalu di belakang hasil site-router. */
export const DEFAULT_PROVIDERS: SearchProvider[] = [
  newsProvider,
  marketProvider,
  socialProvider,
  docsitesProvider,
  wikipediaProvider,
  githubProvider,
  stackexProvider,
  hnProvider,
];

export interface SearchOutcome {
  results: SearchResult[];
  errors: Array<{ provider: string; error: string }>;
  cached: boolean;
}

export interface SearchOpts {
  limit?: number;
  cache?: ResearchCache;
  sessionId?: string;
  budget?: ResearchBudget;
  searxngUrl?: string;
  ddgEnabled?: boolean;
  /** inject untuk test */
  providers?: SearchProvider[];
  now?: number;
}

function dedupeKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url.toLowerCase();
  }
}

export async function researchSearch(query: string, opts: SearchOpts = {}): Promise<SearchOutcome> {
  const limit = Math.max(1, Math.min(opts.limit ?? 5, 10));
  const q = query.trim();
  const cacheKey = `search:v1:${createHash("sha256").update(`${q.toLowerCase()}:${limit}`).digest("hex")}`;
  const hit = opts.cache?.get<SearchOutcome>(cacheKey, SEARCH_TTL_MS, opts.now);
  if (hit) return { ...hit, cached: true };

  if (opts.sessionId && opts.budget) {
    const b = opts.budget.consume(opts.sessionId, "query", opts.now);
    if (!b.ok) {
      return {
        results: [],
        errors: [{ provider: "budget", error: `research query budget exhausted (${b.limit}/hour per session), refine the query or wait; cached results still work` }],
        cached: false,
      };
    }
  }

  const errors: SearchOutcome["errors"] = [];
  const byProvider: Array<{ priority: number; results: SearchResult[] }> = [];

  // 1) site-router, paralel, gagal satu tidak menjatuhkan lainnya
  const providers = opts.providers ?? DEFAULT_PROVIDERS;
  const matched = providers.filter((p) => {
    try {
      return p.matches(q);
    } catch {
      return false;
    }
  });
  const settled = await Promise.allSettled(matched.map((p) => p.search(q, { limit })));
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") byProvider.push({ priority: providers.indexOf(matched[i]!), results: r.value });
    else errors.push({ provider: matched[i]!.name, error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
  });

  // 2) engine umum, HANYA bila hasil site-router belum cukup (bug nyata 2026-11:
  // ddg selalu dipanggil & timeout 10 dtk menambah latensi tiap search, padahal
  // news/wikipedia sudah menjawab). searxng self-host (eksplisit dikonfigurasi
  // operator) tetap selalu dipanggil; ddg nonofficial = pelengkap terakhir + race 5 dtk.
  const enough = (n: number) => n >= Math.min(3, limit);
  const totalSoFar = () => byProvider.reduce((n, b) => n + b.results.length, 0);
  if (opts.searxngUrl) {
    try {
      byProvider.push({ priority: providers.length, results: await searxngProvider(opts.searxngUrl).search(q, { limit }) });
    } catch (e) {
      errors.push({ provider: "searxng", error: e instanceof Error ? e.message : String(e) });
      if (opts.ddgEnabled !== false && !enough(totalSoFar())) {
        try {
          byProvider.push({ priority: providers.length + 1, results: await withTimeout(ddgProvider.search(q, { limit }), 5_000, "ddg timed out (5s)") });
        } catch (e2) {
          errors.push({ provider: "ddg", error: e2 instanceof Error ? e2.message : String(e2) });
        }
      }
    }
  } else if (opts.ddgEnabled !== false && !enough(totalSoFar())) {
    try {
      byProvider.push({ priority: providers.length, results: await withTimeout(ddgProvider.search(q, { limit }), 5_000, "ddg timed out (5s)") });
    } catch (e) {
      errors.push({ provider: "ddg", error: e instanceof Error ? e.message : String(e) });
    }
  }

  // 3) merge: prioritas provider → dedupe URL → cap
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const { results: rs } of byProvider.sort((a, b) => a.priority - b.priority)) {
    for (const r of rs) {
      const k = dedupeKey(r.url);
      if (seen.has(k)) continue;
      seen.add(k);
      results.push(r);
      if (results.length >= limit) break;
    }
    if (results.length >= limit) break;
  }

  const outcome: SearchOutcome = { results, errors, cached: false };
  opts.cache?.set(cacheKey, "search", outcome, opts.now);
  return outcome;
}
