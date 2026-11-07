// Batch 7 (RS-2) — pipeline fetch halaman riset:
//   SSRF/policy guard (browser/reader) → robots.txt → throttle domain →
//   fetch (redirect tervalidasi) → cap ukuran → Readability→markdown (fallback plain).
// Cache halaman 72 jam; budget page per sesi (cache hit tidak dihitung).
import fs from "node:fs";
import path from "node:path";
import TurndownService from "turndown";
import { DOMParser } from "linkedom";
import { Readability } from "@mozilla/readability";
import { assertBrowserUrlAllowed, BrowserReadError, isPrivateIp, readBrowserPolicy } from "../browser/reader.js";
import type { ResearchCache } from "./cache.js";
import type { ResearchBudget } from "./budget.js";
import { FetchedPage, ResearchError, type ResearchErrorKind } from "./types.js";
import { BROWSER_UA, domainThrottle, htmlToPlain } from "./util.js";
import { isAllowedByRobots } from "./robots.js";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const MAX_STORED_CHARS = 200_000;
export const PAGE_TTL_MS = 72 * 3600_000;

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
turndown.remove(["script", "style", "noscript", "iframe"]);

/** Policy riset utk workspace project: file .yuika/browser.json dipakai bila ADA
 *  (pilihan eksplisit project — berbagi dgn tab Browser); tanpa file = web terbuka.
 *  SSRF guard (IP private/loopback) JALAN TERUS di kedua kasus. */
export function researchPolicyFor(workspacePath: string): { allow: string[]; allowAll: boolean; allowPrivate?: boolean } {
  const allowPrivate = /^(1|true)$/i.test(process.env.YUI_BROWSER_ALLOW_PRIVATE ?? ""); // dev/test (sama dgn reader)
  try {
    if (fs.existsSync(path.join(workspacePath, ".yuika", "browser.json"))) {
      return { ...readBrowserPolicy(workspacePath), allowPrivate };
    }
  } catch {
    /* baca gagal → default terbuka */
  }
  return { allow: [], allowAll: true, allowPrivate };
}

/** Readability di atas linkedom — gagal/kosong → null (fallback plain). */
function extractReadable(html: string, url: string): { title: string; markdown: string } | null {
  try {
    // Cast structural: linkedom Document ≠ lib.dom Document (api env tanpa DOM lib).
    const dom = new DOMParser().parseFromString(html, "text/html");
    type Parsed = { title?: string; content?: string } | null;
    const Read = Readability as unknown as new (doc: unknown) => { parse(): Parsed };
    const article = new Read(dom).parse();
    if (!article?.content || article.content.length < 200) return null;
    const md = turndown.turndown(article.content);
    if (!md || md.trim().length < 100) return null;
    return { title: article.title ?? "", markdown: md };
  } catch {
    return null;
  }
}

export interface FetchOutcome {
  page: FetchedPage;
  cached: boolean;
  status: number;
  contentType: string;
  extractor: "readability" | "plain";
}

export interface FetchOpts {
  policy: { allow: string[]; allowAll?: boolean; allowPrivate?: boolean };
  maxChars?: number;
  cache?: ResearchCache;
  sessionId?: string;
  budget?: ResearchBudget;
  domainDelayMs?: number;
  now?: number;
}

const PLAIN_TYPES = new Set([
  "text/plain", "text/markdown", "application/json", "application/xml", "text/xml", "application/yaml", "text/yaml",
]);

export async function researchFetch(rawUrl: string, opts: FetchOpts): Promise<FetchOutcome> {
  const maxChars = Math.min(opts.maxChars ?? 8_000, 20_000);
  const cacheKey = `page:v1:${rawUrl.trim()}`;
  const hit = opts.cache?.get<FetchOutcome>(cacheKey, PAGE_TTL_MS, opts.now);
  if (hit) {
    return { ...hit, cached: true, page: { ...hit.page, markdown: hit.page.markdown.slice(0, maxChars) } };
  }

  if (opts.sessionId && opts.budget) {
    const b = opts.budget.consume(opts.sessionId, "page", opts.now);
    if (!b.ok) {
      throw new ResearchError("budget_exceeded", `research page budget habis (${b.limit}/jam per sesi) — tunggu sebentar atau kurangi jumlah halaman`);
    }
  }

  const policy = { allow: opts.policy.allow, allowAll: opts.policy.allowAll, allowPrivate: opts.policy.allowPrivate };
  // Reader melempar BrowserReadError — bungkus jadi ResearchError (kode sama) supaya
  // pesan tool konsisten dari satu lapisan.
  const guarded = (raw: string): Promise<URL> =>
    assertBrowserUrlAllowed(raw, policy).catch((e: unknown) => {
      if (e instanceof BrowserReadError) throw new ResearchError(e.code as ResearchErrorKind, e.message);
      throw e;
    });
  let url = await guarded(rawUrl);

  // robots: selalu dicek (server tanpa robots.txt = 404 = diizinkan — dev server aman;
  // hasil di-cache 1 jam). Cache research (hit) melewati tahap ini.
  if (!(await isAllowedByRobots(url, opts.now))) {
    throw new ResearchError("robots_denied", `robots.txt ${url.hostname} melarang pengambilan ${url.pathname} — kutip snippet hasil search atau cari sumber lain`);
  }

  await domainThrottle(url.hostname, opts.domainDelayMs ?? 1_000);

  let res: Response;
  for (let hop = 0; ; hop++) {
    if (hop > MAX_REDIRECTS) throw new ResearchError("too_many_redirects", `lebih dari ${MAX_REDIRECTS} redirect`);
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "user-agent": BROWSER_UA,
          accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8",
          "accept-language": "en,id;q=0.8",
        },
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") throw new ResearchError("timeout", "waktu habis (20s)");
      throw new ResearchError("fetch_failed", `gagal fetch: ${(e as Error).message}`);
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) throw new ResearchError("fetch_failed", "redirect tanpa location");
      url = await guarded(new URL(loc, url).href); // tiap hop divalidasi ulang
      continue;
    }
    break;
  }

  const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) {
    throw new ResearchError("too_large", `respons > ${MAX_BYTES} byte`);
  }
  const raw = (await res.text()).slice(0, MAX_BYTES);

  let title = "";
  let body = "";
  let extractor: FetchOutcome["extractor"] = "plain";
  if (contentType === "text/html" || contentType === "application/xhtml+xml") {
    const r = extractReadable(raw, url.href);
    if (r) {
      title = r.title;
      body = r.markdown;
      extractor = "readability";
    } else {
      title = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(raw)?.[1]?.trim() ?? "";
      body = htmlToPlain(raw);
    }
  } else if (PLAIN_TYPES.has(contentType)) {
    title = decodeURIComponent(url.pathname.split("/").pop() || "") || url.hostname;
    body = raw;
  } else {
    throw new ResearchError("content_type_denied", `tipe konten tidak didukung riset: ${contentType || "(kosong)"}`);
  }

  const outcome: FetchOutcome = {
    page: { url: url.href, title: title || url.hostname, markdown: body.slice(0, MAX_STORED_CHARS), fetchedAt: new Date(opts.now ?? Date.now()).toISOString() },
    cached: false,
    status: res.status,
    contentType,
    extractor,
  };
  opts.cache?.set(cacheKey, "page", outcome, opts.now);
  return { ...outcome, page: { ...outcome.page, markdown: outcome.page.markdown.slice(0, maxChars) } };
}
