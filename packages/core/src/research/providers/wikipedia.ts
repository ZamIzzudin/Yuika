// Batch 7 (RS-1a), Wikipedia search API (resmi, gratis, tanpa key). id + en paralel.
import type { SearchProvider, SearchResult } from "../types.js";
import { htmlToPlain, httpJson } from "../util.js";

interface WikiSearch {
  query?: { search?: Array<{ title: string; snippet: string }> };
}

async function byLang(lang: "id" | "en", query: string, limit: number): Promise<SearchResult[]> {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query,
  )}&srlimit=${Math.min(limit, 4)}&format=json&origin=*`;
  const { data } = await httpJson<WikiSearch>(url);
  return (data.query?.search ?? []).map((hit) => ({
    title: hit.title,
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`,
    snippet: htmlToPlain(hit.snippet).slice(0, 240),
    source: `wikipedia:${lang}`,
  }));
}

export const wikipediaProvider: SearchProvider = {
  name: "wikipedia",
  // Topik umum (non-teknis sekalipun) → ensiklopedia sering jadi pijakan pertama.
  matches: () => true,
  search: async (query, opts) => {
    const [id, en] = await Promise.all([byLang("id", query, opts.limit), byLang("en", query, opts.limit)]);
    return [...id, ...en];
  },
};
