// Batch 7 (RS-1a), StackOverflow via StackExchange API (resmi, tanpa key).
import type { SearchProvider, SearchResult } from "../types.js";
import { decodeEntities, httpJson } from "../util.js";

interface SeSearch {
  items?: Array<{ title: string; link: string; score: number; answer_count: number; is_answered: boolean }>;
}

export const stackexProvider: SearchProvider = {
  name: "stackoverflow",
  matches: (q) => /stack ?overflow|stack ?exchange|stackoverflow|\berror\b|\bexception\b|traceback|\bbug\b/i.test(q),
  search: async (query, opts) => {
    const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(
      query,
    )}&site=stackoverflow&pagesize=${Math.min(opts.limit, 4)}`;
    const { data } = await httpJson<SeSearch>(url);
    return (data.items ?? []).map((it) => ({
      title: decodeEntities(it.title),
      url: it.link,
      snippet: `${it.score} score · ${it.answer_count} answers${it.is_answered ? " · answered" : ""}`,
      source: "stackoverflow",
    }));
  },
};
