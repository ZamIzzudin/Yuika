// (RS-1a), SearXNG self-host (multi-engine, output JSON). Opsional:
// aktif hanya bila YUI_SEARXNG_URL dikonfigurasi (settings.yml harus mengaktifkan
// formats: [html, json]).
import type { SearchProvider, SearchResult } from "../types.js";
import { httpJson } from "../util.js";

interface SxResponse {
  results?: Array<{ title?: string; url?: string; content?: string }>;
}

export function searxngProvider(baseUrl: string): SearchProvider {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    name: "searxng",
    matches: () => true,
    search: async (query, opts) => {
      const { data } = await httpJson<SxResponse>(`${base}/search?q=${encodeURIComponent(query)}&format=json`, { timeoutMs: 10_000 });
      return (data.results ?? [])
        .filter((r) => r.url && r.title)
        .slice(0, opts.limit)
        .map((r) => ({
          title: r.title!,
          url: r.url!,
          snippet: (r.content ?? "").slice(0, 240),
          source: "searxng",
        }));
    },
  };
}
