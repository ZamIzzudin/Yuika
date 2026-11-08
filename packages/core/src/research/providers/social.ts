// Batch 7 (RS-1b), Social: sentimen publik tanpa login, Reddit RSS search +
// Bluesky public API (keduanya gratis). Best-effort: satu gagal → sumber lain
// tetap jalan (pattern hasil parsial). Platform tertutup (X/TikTok/IG) bukan
// sasaran di sini, jalurnya authenticated preview (LB-2), bukan scraping.
import type { SearchProvider, SearchResult } from "../types.js";
import { decodeEntities, htmlToPlain, httpJson, httpText } from "../util.js";

function atomField(tag: string, block: string): string {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  return m ? decodeEntities(m[1]!.replace(/<!\[CDATA\[|\]\]>/g, "")).trim() : "";
}

async function reddit(query: string, limit: number): Promise<SearchResult[]> {
  const { status, text } = await httpText(
    `https://www.reddit.com/search.rss?q=${encodeURIComponent(query)}&sort=top&t=month&limit=${Math.min(limit, 4)}`,
    { timeoutMs: 10_000 },
  );
  if (status >= 400) throw new Error(`reddit rss http ${status}`);
  const out: SearchResult[] = [];
  for (const entry of text.match(/<entry>[\s\S]*?<\/entry>/g) ?? []) {
    const title = atomField("title", entry);
    const linkM = /<link[^>]*href="([^"]+)"/.exec(entry);
    if (!title || !linkM) continue;
    const content = htmlToPlain(atomField("content", entry)).slice(0, 200);
    out.push({ title, url: linkM[1]!, snippet: content, source: "reddit" });
    if (out.length >= Math.min(limit, 4)) break;
  }
  return out;
}

interface BskySearch {
  posts?: Array<{ post: { uri: string; author: { handle: string }; record: { text: string } } }>;
}

async function bluesky(query: string, limit: number): Promise<SearchResult[]> {
  const { data } = await httpJson<BskySearch>(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 4)}`,
    { timeoutMs: 10_000 },
  );
  return (data.posts ?? []).map(({ post }) => {
    const rkey = post.uri.split("/").pop()!;
    return {
      title: post.record.text.slice(0, 100).replace(/\s+/g, " "),
      url: `https://bsky.app/profile/${post.author.handle}/post/${rkey}`,
      snippet: post.record.text.slice(0, 240).replace(/\s+/g, " "),
      source: "bluesky",
    };
  });
}

export const socialProvider: SearchProvider = {
  name: "social",
  matches: (q) => /sentimen|sentiment|opini|pendapat|reaksi|netizen|orang (bilang|kata)|what do people|public opinion|\bkomen\b|comment/i.test(q),
  search: async (query, opts) => {
    const [rd, bs] = await Promise.all([reddit(query, opts.limit).catch((e: Error) => { throw new Error(`reddit: ${e.message}`); }), bluesky(query, opts.limit).catch(() => [])]);
    return [...rd, ...bs];
  },
};
