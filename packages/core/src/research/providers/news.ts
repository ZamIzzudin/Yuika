// Batch 7 (RS-1b), News: Google News RSS (publik & stabil, tanpa key).
// Menjawab use case "kasus berita / jadwal acara / kondisi terkini".
import type { SearchProvider, SearchResult } from "../types.js";
import { decodeEntities, htmlToPlain, httpText } from "../util.js";

function extract(tag: string, block: string): string {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  if (!m) return "";
  return decodeEntities(m[1]!.replace(/<!\[CDATA\[|\]\]>/g, "")).trim();
}

export function parseNewsRss(xml: string, limit: number): SearchResult[] {
  const out: SearchResult[] = [];
  for (const item of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const title = extract("title", item);
    const link = extract("link", item);
    if (!title || !link) continue;
    const pub = extract("pubDate", item);
    const desc = htmlToPlain(extract("description", item)).slice(0, 180);
    out.push({ title, url: link, snippet: `${desc}${pub ? `, ${pub}` : ""}`.slice(0, 240), source: "news" });
    if (out.length >= limit) break;
  }
  return out;
}

export const newsProvider: SearchProvider = {
  name: "news",
  matches: (q) => /berita|news|kasus|kejadian|terbaru|terkini|update|jadwal|konser|festival|acara|event|peluncuran|launch|hari ini|minggu ini|bulan ini/i.test(q),
  search: async (query, opts) => {
    const q = encodeURIComponent(query);
    const { status, text } = await httpText(`https://news.google.com/rss/search?q=${q}&hl=id&gl=ID&ceid=ID:id`, { timeoutMs: 10_000 });
    if (status >= 400) throw new Error(`google news rss http ${status}`);
    const results = parseNewsRss(text, Math.min(opts.limit, 5));
    if (!results.length) throw new Error("google news rss: no items (query mungkin terlalu spesifik)");
    return results;
  },
};
