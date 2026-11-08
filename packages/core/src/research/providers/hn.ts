// (RS-1a), Hacker News via Algolia (API publik, toleran rate limit).
import type { SearchProvider, SearchResult } from "../types.js";
import { httpJson } from "../util.js";

interface HnSearch {
  hits?: Array<{ objectID: string; title: string | null; url: string | null; points: number; num_comments: number }>;
}

export const hnProvider: SearchProvider = {
  name: "hackernews",
  matches: (q) => /\bhacker ?news\b|\bhn\b|\bdiscussion\b|\bthread\b|opinion/i.test(q),
  search: async (query, opts) => {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${Math.min(opts.limit, 4)}`;
    const { data } = await httpJson<HnSearch>(url);
    return (data.hits ?? [])
      .filter((h) => h.title)
      .map((h) => ({
        title: h.title!,
        url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
        snippet: `${h.points} points · ${h.num_comments} comments`,
        source: "hackernews",
      }));
  },
};
