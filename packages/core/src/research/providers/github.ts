// Batch 7 (RS-1a), GitHub repo search (API resmi, unauth 10 req/menit, cukup utk riset).
import type { SearchProvider, SearchResult } from "../types.js";
import { httpJson } from "../util.js";

interface GhSearch {
  total_count?: number;
  items?: Array<{ full_name: string; description: string | null; stargazers_count: number; language: string | null; html_url: string }>;
}

export const githubProvider: SearchProvider = {
  name: "github",
  matches: (q) => /\bgithub\b|\brepo\b|\brepositor/i.test(q),
  search: async (query, opts) => {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${Math.min(
      opts.limit,
      4,
    )}&sort=stars`;
    const { data } = await httpJson<GhSearch>(url, { ua: "YuikaResearch/0.1" });
    return (data.items ?? []).map((r) => ({
      title: r.full_name,
      url: r.html_url,
      snippet: `${r.description ?? ""}, ★${r.stargazers_count}${r.language ? ` · ${r.language}` : ""}`.trim().slice(0, 240),
      source: "github",
    }));
  },
};
