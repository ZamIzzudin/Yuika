// Batch 7 (RS-1a) — DuckDuckGo lite/html sebagai ENGINE UMUM fallback (nonofficial,
// bisa berubah/rate-limit — makanya posisinya terakhir setelah API resmi, dan bisa
// dimatikan YUI_RESEARCH_DDG=0). Parser diekspor utk unit test (fixture).
import type { SearchProvider, SearchResult } from "../types.js";
import { decodeEntities, htmlToPlain, httpText } from "../util.js";

function unwrapDdgHref(href: string): string | null {
  // bentuk: //duckduckgo.com/l/?uddg=<encoded>&rut=...  atau langsung url absolut
  const m = /uddg=([^&"']+)/.exec(href);
  if (m) {
    try {
      return decodeURIComponent(m[1]!);
    } catch {
      return null;
    }
  }
  if (/^https?:\/\//.test(href)) return href;
  return null;
}

/** Parser halaman lite.duckduckgo.com/lite — tabel hasil sederhana. */
export function parseDdgLite(html: string, limit: number): SearchResult[] {
  const out: SearchResult[] = [];
  const linkRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) && out.length < limit) {
    const url = unwrapDdgHref(decodeEntities(m[1]!));
    const title = htmlToPlain(m[2]!);
    if (!url || !title) continue;
    out.push({ title, url, snippet: "", source: "ddg" });
  }
  // snippet: cell berikut link — pasangkan berurutan bila ada.
  const snips = [...html.matchAll(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g)].map((s) => htmlToPlain(s[1]!));
  out.forEach((r, i) => {
    if (snips[i]) r.snippet = snips[i]!.slice(0, 240);
  });
  return out;
}

/** Parser halaman html.duckduckgo.com/html — kartu result__a + result__snippet. */
export function parseDdgHtml(html: string, limit: number): SearchResult[] {
  const out: SearchResult[] = [];
  const blockRe = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]+class="result__a"|<\/body>|$)/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) && out.length < limit) {
    const url = unwrapDdgHref(decodeEntities(m[1]!));
    const title = htmlToPlain(m[2]!);
    if (!url || !title) continue;
    const snip = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(m[3]!);
    out.push({ title, url, snippet: snip ? htmlToPlain(snip[1]!).slice(0, 240) : "", source: "ddg" });
  }
  return out;
}

const BLOCK_MARKS = /challenge|captcha|anomaly|unfortunately|bots/i;

export const ddgProvider: SearchProvider = {
  name: "ddg",
  matches: () => true,
  search: async (query, opts) => {
    const q = encodeURIComponent(query);
    // endpoint 1: lite
    const lite = await httpText(`https://lite.duckduckgo.com/lite/?q=${q}`, { timeoutMs: 10_000 });
    if (lite.status === 200 && !BLOCK_MARKS.test(lite.text)) {
      const results = parseDdgLite(lite.text, opts.limit);
      if (results.length) return results;
    }
    // endpoint 2: html
    const html = await httpText(`https://html.duckduckgo.com/html/?q=${q}`, { timeoutMs: 10_000 });
    if (html.status === 200 && !BLOCK_MARKS.test(html.text)) {
      const results = parseDdgHtml(html.text, opts.limit);
      if (results.length) return results;
    }
    throw new Error("ddg blocked or no results (nonofficial endpoint — try again later or configure YUI_SEARXNG_URL)");
  },
};
