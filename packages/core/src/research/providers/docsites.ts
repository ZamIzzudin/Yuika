// (RS-1a), docsites: query yang menyebut domain dokumen (react.dev, nodejs.org,
// …) → cari halaman lewat llms.txt; fallback sitemap.xml. Provider ringan utk
// "dokumentasi resmi lebih otoritatif daripada aggregator" (PERSONA scholar).
import type { SearchProvider, SearchResult } from "../types.js";
import { httpText } from "../util.js";

const DOMAIN_RE = /(?:^|\s)((?:[a-z0-9][a-z0-9-]*\.)+(?:com|org|dev|io|net|app|ai|co|gg|sh|me|xyz|studio))(?=[\s,.]|$)/i;
const SKIP_HOSTS = /^(www\.)?(google|duckduckgo|bing|youtube|facebook|instagram|twitter|x|tiktok|reddit|wikipedia|news\.google|linkedin)\./i;

export function pickDocsDomain(query: string): { domain: string; keywords: string } | null {
  const m = DOMAIN_RE.exec(query);
  if (!m) return null;
  const domain = m[1]!.toLowerCase();
  if (SKIP_HOSTS.test(domain)) return null;
  return { domain, keywords: query.replace(m[1]!, " ").replace(/[^\p{L}\p{N}\s-]/gu, " ").trim() };
}

function scoreLine(line: string, keywords: string[]): number {
  const low = line.toLowerCase();
  return keywords.filter((k) => k.length > 2 && low.includes(k)).length;
}

async function fromLlmsTxt(domain: string, keywords: string, limit: number): Promise<SearchResult[]> {
  const { status, text } = await httpText(`https://${domain}/llms.txt`, { timeoutMs: 8_000 });
  if (status >= 400 || !text) return [];
  const out: SearchResult[] = [];
  const lines = text.split(/\r?\n/).slice(0, 2000); // llms.txt bisa panjang, cap awal cukup
  const kw = keywords.split(/\s+/);
  for (const line of lines) {
    const m = /^\s*[-*]\s*\[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?/.exec(line);
    if (!m) continue;
    const score = scoreLine(`${m[3] ?? ""} ${m[1]!}`, kw);
    if (score === 0) continue;
    out.push({ title: m[1]!, url: new URL(m[2]!, `https://${domain}/`).href, snippet: (m[3] ?? "official docs").slice(0, 240), source: `docs:${domain}` });
    if (out.length >= limit) break;
  }
  return out;
}

export const docsitesProvider: SearchProvider = {
  name: "docsites",
  matches: (q) => pickDocsDomain(q) !== null,
  search: async (query, opts) => {
    const picked = pickDocsDomain(query);
    if (!picked) return [];
    const limit = Math.min(opts.limit, 4);
    try {
      const viaLlms = await fromLlmsTxt(picked.domain, picked.keywords, limit);
      if (viaLlms.length) return viaLlms;
    } catch {
      /* lanjut sitemap */
    }
    // fallback: sitemap.xml, ambih <loc> yang mengandung kata kunci (slug).
    const { status, text } = await httpText(`https://${picked.domain}/sitemap.xml`, { timeoutMs: 8_000 });
    if (status >= 400) return [];
    const kw = picked.keywords.split(/\s+/).filter((k) => k.length > 2);
    const out: SearchResult[] = [];
    for (const loc of text.match(/<loc>([^<]+)<\/loc>/g) ?? []) {
      const url = loc.replace(/<\/?loc>/g, "");
      const slug = decodeURIComponent(url).toLowerCase();
      if (!kw.some((k) => slug.includes(k))) continue;
      out.push({
        title: slug.split("/").filter(Boolean).pop() ?? url,
        url,
        snippet: `official docs page (${picked.domain})`,
        source: `docs:${picked.domain}`,
      });
      if (out.length >= limit) break;
    }
    return out;
  },
};
