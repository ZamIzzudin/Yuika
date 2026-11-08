// Batch 7 (RS), Research Engine: parsers (robots/ddg/news), router fallback chain,
// budget, cache TTL, fetcher pipeline (SSRF + robots + Readability via server lokal),
// tool web_search/web_fetch. Semua hermetic, TANPA network eksternal.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { parseRobots, robotsAllows, clearRobotsCache, isAllowedByRobots } from "../research/robots.js";
import { parseDdgLite } from "../research/providers/ddg.js";
import { parseNewsRss } from "../research/providers/news.js";
import { pickDocsDomain } from "../research/providers/docsites.js";
import { researchSearch } from "../research/search.js";
import { ResearchBudget } from "../research/budget.js";
import { newResearchCache, SqliteResearchCache } from "../research/cache.js";
import { researchFetch } from "../research/fetcher.js";
import { domainThrottle, withTimeout } from "../research/util.js";
import { ResearchError } from "../research/types.js";
import type { SearchProvider, SearchResult } from "../research/types.js";
import { registry, resetRegistryForTests } from "../registry.js";
import { registerWebTools } from "../tools/web-tools.js";

const servers: http.Server[] = [];
afterEach(() => {
  clearRobotsCache();
  vi.unstubAllGlobals();
  return Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

function serve(handler: http.RequestListener): Promise<string> {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    servers.push(s);
    s.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(s.address() as AddressInfo).port}`));
  });
}

// ── parsers ──────────────────────────────────────────────────────────────────
describe("RS robots parser", () => {
  it("group * + wildcard * + anchor $", () => {
    const rules = parseRobots(
      ["User-agent: Googlebot", "Disallow: /g", "User-agent: *", "Disallow: /private", "Disallow: /tmp*secret", "Allow: /tmp/public$", "Disallow:"] // Disallow kosong diabaikan
        .join("\n"),
    )!;
    expect(rules).not.toBeNull();
    expect(robotsAllows(rules, "/home")).toBe(true);
    expect(robotsAllows(rules, "/private/x")).toBe(false);
    expect(robotsAllows(rules, "/tmp/xsecret")).toBe(false);
    expect(robotsAllows(rules, "/tmp/public")).toBe(true);
    expect(robotsAllows(rules, "/tmp/public/deep")).toBe(true); // anchor $ tak cocok → tak ada rule → boleh
    expect(parseRobots("User-agent: *\nDisallow:")).toBeNull(); // tak ada aturan efektif
  });

  it("robots.txt tak tersedia → diizinkan (via isAllowedByRobots)", async () => {
    const origin = await serve((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    expect(await isAllowedByRobots(new URL(`${origin}/x`))).toBe(true);
  });
});

describe("RS ddg + news parsers", () => {
  it("parseDdgLite: uddg unwrap + snippet pasangan", () => {
    const html = [
      `<tr><td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Freact.dev%2Flearn&amp;rut=h1">React Learn</a></td></tr>`,
      `<tr><td class="result-snippet">React docs <b>learn</b> page</td></tr>`,
      `<tr><td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa">Example A</a></td></tr>`,
      `<tr><td class="result-snippet">second</td></tr>`,
    ].join("");
    const rs = parseDdgLite(html, 5);
    expect(rs.map((r) => r.url)).toEqual(["https://react.dev/learn", "https://example.com/a"]);
    expect(rs[0]!.title).toBe("React Learn");
    expect(rs[0]!.snippet).toContain("React docs learn page");
  });

  it("parseNewsRss: CDATA + pubDate", () => {
    const xml = `<rss><channel>
      <item><title><![CDATA[Jadwal Konser Jakarta November 2026]]></title><link>https://news.example/konser</link><pubDate>Mon, 2 Nov 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Tiket tersedia&lt;/p&gt;</description></item>
      <item><title>Item tanpa link</title></item>
    </channel></rss>`;
    const rs = parseNewsRss(xml, 5);
    expect(rs.length).toBe(1);
    expect(rs[0]!.title).toContain("Konser Jakarta");
    expect(rs[0]!.url).toBe("https://news.example/konser");
    expect(rs[0]!.snippet).toContain("Tiket tersedia");
    expect(rs[0]!.snippet).toContain("Nov 2026");
  });

  it("pickDocsDomain: domain dipilih, host umum di-skip", () => {
    expect(pickDocsDomain("cara useEffect di react.dev dong")?.domain).toBe("react.dev");
    expect(pickDocsDomain("cari di youtube.com")).toBeNull();
    expect(pickDocsDomain("tanpa domain")).toBeNull();
  });
});

// ── router ───────────────────────────────────────────────────────────────────
function fake(name: string, results: SearchResult[] | Error, matches = true) {
  return {
    name,
    matches: () => matches,
    calls: 0,
    async search(): Promise<SearchResult[]> {
      (this as { calls: number }).calls++;
      if (results instanceof Error) throw results;
      return results;
    },
  } as SearchProvider & { calls: number };
}

const R = (url: string, title = url): SearchResult => ({ title, url, snippet: "s", source: "t" });

describe("RS router (researchSearch)", () => {
  it("merge prioritas + dedupe host/path + cap + hasil parsial + error provider", async () => {
    const a = fake("A", [R("https://x.com/a"), R("https://x.com/b")]);
    const b = fake("B", new Error("boom"));
    const c = fake("C", [R("https://X.com/a/"), R("https://y.com/c")]); // duplikat dgn A
    const out = await researchSearch("q", { providers: [a, b, c], ddgEnabled: false, limit: 3 });
    expect(out.results.map((r) => r.url)).toEqual(["https://x.com/a", "https://x.com/b", "https://y.com/c"]);
    expect(out.errors).toEqual([{ provider: "B", error: "boom" }]);
    expect(out.cached).toBe(false);
  });

  it("cache hit: provider tak dipanggil ulang", async () => {
    const a = fake("A", [R("https://x.com/a")]);
    const cache = newResearchCache(); // in-memory
    const o1 = await researchSearch("q", { providers: [a], ddgEnabled: false, cache });
    const o2 = await researchSearch("q", { providers: [a], ddgEnabled: false, cache });
    expect(o1.cached).toBe(false);
    expect(o2.cached).toBe(true);
    expect(a.calls).toBe(1);
    expect(o2.results.length).toBe(1);
  });

  it("budget query habis → hasil kosong + error budget (tanpa memanggil provider)", async () => {
    const a = fake("A", [R("https://x.com/a")]);
    const budget = new ResearchBudget(1, 1);
    const o1 = await researchSearch("q", { providers: [a], ddgEnabled: false, budget, sessionId: "s1" });
    expect(o1.results.length).toBe(1);
    const o2 = await researchSearch("q2", { providers: [a], ddgEnabled: false, budget, sessionId: "s1" });
    expect(o2.results).toEqual([]);
    expect(o2.errors[0]!.provider).toBe("budget");
    expect(a.calls).toBe(1); // o2 tak jalan ke provider
  });
});

// ── budget & cache ───────────────────────────────────────────────────────────
describe("RS budget & cache", () => {
  it("budget sliding window per sesi", () => {
    const b = new ResearchBudget(2, 2, 1000);
    expect(b.consume("s", "query", 0).ok).toBe(true);
    expect(b.consume("s", "query", 100).ok).toBe(true);
    expect(b.consume("s", "query", 200).ok).toBe(false);
    expect(b.consume("s", "page", 200).ok).toBe(true); // kind terpisah
    expect(b.consume("s2", "query", 200).ok).toBe(true); // sesi terpisah
    expect(b.consume("s", "query", 1001).ok).toBe(true); // window lewat
  });

  it("cache TTL + sqlite roundtrip", () => {
    const mem = newResearchCache();
    mem.set("k", "search", { v: 1 }, 100);
    expect(mem.get("k", 500, 200)).toEqual({ v: 1 }); // usia 100 < ttl 500
    expect(mem.get("k", 50, 200)).toBeNull(); // usia 100 > ttl 50
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-rs-"));
    const sq = new SqliteResearchCache(path.join(dir, "c.db"));
    sq.set("k", "page", { v: 2 }, 1_000); // now = 1000
    expect(sq.get("k", 9999, 1_500)).toEqual({ v: 2 }); // usia 500 < ttl
    expect(sq.get("k", 100, 1_500)).toBeNull(); // usia 500 > ttl
    sq.close();
  });
});

// ── fetcher (server lokal) ───────────────────────────────────────────────────
describe("RS fetcher pipeline", () => {
  const OPEN = { allow: [] as string[], allowAll: true, allowPrivate: true };

  it("SSRF: IP private diblok walau allowAll (tanpa allowPrivate)", async () => {
    const base = await serve((_req, res) => res.end("x"));
    await expect(researchFetch(base, { policy: { allow: [], allowAll: true } })).rejects.toMatchObject({ code: "private_blocked" });
  });

  it("HTML → Readability markdown (linkedom) + judul", async () => {
    const base = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><html><head><title>Jadwal Konser Jakarta</title></head><body><nav>menu</nav><article><h1>Jadwal Konser Jakarta November 2026</h1>` +
          `<p>November 2026 akan menjadi bulan yang ramai dengan berbagai konser internasional di Jakarta, mulai dari stadion hingga arena indoor yang berkapasitas puluhan ribu penonton setiap malamnya.</p>` +
          `<p>Beberapa artis dunia telah mengumumkan jadwal tur mereka melalui kanal media sosial resmi masing-masing sejak awal tahun, dengan tiket yang dijual melalui platform resmi penjualan daring.</p>` +
          `<p>Penggemar disarankan memeriksa halaman resmi penyelenggara untuk jadwal terkini karena perubahan tanggal dapat terjadi sewaktu-waktu tanpa pemberitahuan yang lama sebelumnya.</p>` +
          `</article></body></html>`,
      );
    });
    const out = await researchFetch(`${base}/page`, { policy: OPEN, domainDelayMs: 0 });
    expect(out.extractor).toBe("readability");
    expect(out.page.title).toContain("Jadwal Konser");
    expect(out.page.markdown).toContain("# Jadwal Konser Jakarta November 2026");
    expect(out.page.markdown).toContain("November 2026");
    expect(out.status).toBe(200);
  });

  it("robots.txt melarang path → robots_denied; path lain jalan", async () => {
    const base = await serve((req, res) => {
      if (req.url === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("User-agent: *\nDisallow: /private\n");
      } else {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html><body><p>halaman biasa dengan teks cukup panjang untuk dibaca orang yang membencinya.</p></body></html>");
      }
    });
    await expect(researchFetch(`${base}/private/data`, { policy: OPEN, domainDelayMs: 0 })).rejects.toMatchObject({ code: "robots_denied" });
    const ok = await researchFetch(`${base}/public`, { policy: OPEN, domainDelayMs: 0 });
    expect(ok.status).toBe(200);
  });

  it("redirect divalidasi ulang; content-type json → plain", async () => {
    const base = await serve((req, res) => {
      if (req.url === "/r") {
        res.writeHead(302, { location: "/data.json" });
        res.end();
      } else if (req.url === "/data.json") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ hello: "world" }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    const out = await researchFetch(`${base}/r`, { policy: OPEN, domainDelayMs: 0 });
    expect(out.page.url).toContain("/data.json");
    expect(out.extractor).toBe("plain");
    expect(out.page.markdown).toContain('"hello"');
  });

  it("content-type tidak didukung → ditolak; cache hit tak mengonsumsi budget", async () => {
    const base = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(Buffer.from([1, 2, 3]));
    });
    await expect(researchFetch(base, { policy: OPEN, domainDelayMs: 0 })).rejects.toMatchObject({ code: "content_type_denied" });

    const page = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("teks sederhana");
    });
    const cache = newResearchCache();
    const budget = new ResearchBudget(1, 1);
    const o1 = await researchFetch(page, { policy: OPEN, domainDelayMs: 0, cache, budget, sessionId: "s" });
    expect(o1.cached).toBe(false);
    const o2 = await researchFetch(page, { policy: OPEN, domainDelayMs: 0, cache, budget, sessionId: "s" });
    expect(o2.cached).toBe(true); // budget page habis, tapi cache hit tak dihitung
    expect(budget.consume("s", "page").ok).toBe(false);
  });

  it("budget page habis → budget_exceeded", async () => {
    const base = await serve((_req, res) => res.end("x"));
    await expect(
      researchFetch(base, { policy: OPEN, domainDelayMs: 0, budget: new ResearchBudget(10, 0), sessionId: "s" }),
    ).rejects.toMatchObject({ code: "budget_exceeded" });
  });
});

// ── tools ────────────────────────────────────────────────────────────────────
const SAVED_DDG = process.env.YUI_RESEARCH_DDG;
const SAVED_OFF = process.env.YUI_RESEARCH_OFF;
const SAVED_PRIV = process.env.YUI_BROWSER_ALLOW_PRIVATE;

describe("RS tools (web_search / web_fetch)", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-rs-tool-"));
    process.env.YUI_RESEARCH_DDG = "0";
    delete process.env.YUI_RESEARCH_OFF;
    resetRegistryForTests();
    registerWebTools();
  });
  afterEach(() => {
    if (SAVED_DDG === undefined) delete process.env.YUI_RESEARCH_DDG;
    else process.env.YUI_RESEARCH_DDG = SAVED_DDG;
    if (SAVED_OFF === undefined) delete process.env.YUI_RESEARCH_OFF;
    else process.env.YUI_RESEARCH_OFF = SAVED_OFF;
    if (SAVED_PRIV === undefined) delete process.env.YUI_BROWSER_ALLOW_PRIVATE;
    else process.env.YUI_BROWSER_ALLOW_PRIVATE = SAVED_PRIV;
  });
  const ctx = () => ({ sessionId: "s1", turnId: "t1", workspacePath: dir, emit: () => {}, requestApproval: async () => true });

  it("web_search: provider wikipedia (fetch di-stub) + partial errors jujur", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes("id.wikipedia.org")) {
          return new Response(JSON.stringify({ query: { search: [{ title: "Pembelajaran mesin", snippet: "<b>ML</b> adalah cabang AI" }] } }), { status: 200 });
        }
        if (url.includes("en.wikipedia.org")) {
          return new Response(JSON.stringify({ query: { search: [{ title: "Machine learning", snippet: "ML is a <i>field</i> of AI" }] } }), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );
    const res = await registry.dispatch("web_search", { query: "machine learning", limit: 5 }, ctx());
    const out = res.result as { results: SearchResult[]; errors: unknown[] };
    expect(out.results.map((r) => r.source).sort()).toEqual(["wikipedia:en", "wikipedia:id"]);
    expect(out.results[0]!.title.length).toBeGreaterThan(0);
    expect(out.errors).toEqual([]);
  });

  it("web_search: YUI_RESEARCH_OFF → note, tanpa network", async () => {
    process.env.YUI_RESEARCH_OFF = "1";
    const res = await registry.dispatch("web_search", { query: "apa saja" }, ctx());
    expect((res.result as { note?: string }).note).toContain("disabled");
  });

  it("web_fetch: halaman lokal (allowPrivate env) → markdown + tercatat", async () => {
    process.env.YUI_BROWSER_ALLOW_PRIVATE = "1";
    const base = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        `<html><head><title>Dok Riset</title></head><body><article><h1>Topik Riset</h1>` +
          `<p>Paragraf pertama yang cukup panjang agar Readability menganggap ini artikel sungguhan dan tidak membuangnya begitu saja.</p>` +
          `<p>Paragraf kedua menambahkan konteks tambahan supaya total konten melewati ambang panjang minimum ekstraktor.</p>` +
          `<p>Paragraf ketiga untuk keamanan ekstraksi karena beberapa halaman pendek ditolak oleh algoritma pembacaan.</p>` +
          `</article></body></html>`,
      );
    });
    const res = await registry.dispatch("web_fetch", { url: base, maxChars: 4000 }, ctx());
    const out = res.result as { title: string; text: string; extractor: string; status: number };
    expect(out.extractor).toBe("readability");
    expect(out.title).toBe("Dok Riset");
    expect(out.text).toContain("# Topik Riset");
    expect(out.status).toBe(200);
  });

  it("web_fetch: IP private tanpa env → pesan error rapi (isError, english)", async () => {
    delete process.env.YUI_BROWSER_ALLOW_PRIVATE;
    const base = await serve((_req, res) => res.end("x"));
    const res = await registry.dispatch("web_fetch", { url: base }, ctx());
    expect(res.isError).toBe(true);
    expect((res.result as { error: string }).error).toBe("private_blocked");
    expect((res.result as { message: string }).message).toMatch(/SSRF/);
  });
});

// ── fix 2026-11 (laporan user: turn Scholar menggantung) ────────────────────\n
describe("RS fix: throttle livelock + watchdog + ddg kondisional", () => {
  it("domainThrottle: 2 call paralel host sama selesai (tanpa livelock) + jeda terjaga", async () => {
    const t0 = Date.now();
    await Promise.all([domainThrottle("x.test", 150), domainThrottle("x.test", 150)]);
    const ms = Date.now() - t0;
    expect(ms).toBeGreaterThanOrEqual(140); // call ke-2 tetap jeda
    expect(ms).toBeLessThan(5_000); // tapi TIDAK livelock (bug lama: menunggu selamanya)
  });

  it("withTimeout: lolos nilai; race deadline → reject", async () => {
    await expect(withTimeout(Promise.resolve(7), 50, "x")).resolves.toBe(7);
    await expect(withTimeout(new Promise(() => {}), 80, "boom")).rejects.toThrow("boom");
  });

  it("router: hasil site-router cukup (>=3) → ddg TIDAK dipanggil; kurang → dipanggil", async () => {
    const ddgCalls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        ddgCalls.push(String(input));
        return new Response(
          '<a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fddg.test%2Fr&amp;rut=x">DDG R</a>',
          { status: 200 },
        );
      }),
    );
    const enough = fake("A", [R("https://a.test/1"), R("https://a.test/2"), R("https://a.test/3")]);
    const o1 = await researchSearch("q", { providers: [enough], ddgEnabled: true, limit: 5 });
    expect(ddgCalls.filter((u) => u.includes("duckduckgo")).length).toBe(0); // dilewati, cukup
    expect(o1.results.length).toBe(3);

    const thin = fake("B", [R("https://b.test/1")]);
    const o2 = await researchSearch("q2", { providers: [thin], ddgEnabled: true, limit: 5 });
    expect(ddgCalls.filter((u) => u.includes("duckduckgo")).length).toBe(1); // dipanggil, hasil tipis
    expect(o2.results.some((r) => r.source.includes("ddg"))).toBe(true);
  });
});
