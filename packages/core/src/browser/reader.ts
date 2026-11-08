// @yuika/core, P2-STU-4: browser reader read-only (security review = gerbang).
// Proxy server-side utk tab Browser: fetch HTML utk DIRENDER (user melihat apa
// yang agent riset), BUKAN eksekusi. Pertahanan berlapis:
//   1. Allowlist domain per project (`.yuika/browser.json` → env → default)
//   2. SSRF guard: host private/loopback/link-local/metadata diblok KECUALI
//      YUI_BROWSER_ALLOW_PRIVATE=1 (dev/test eksplisit)
//   3. Redirect manual (max 4 hop), SETIAP hop divalidasi ulang (SSRF via redirect)
//   4. Content-type whitelist (hanya text/html & text/plain) + size cap 2 MB
//   5. Sanitizer: script/iframe/object/embed/form dihapus, on*= & javascript:
//      dinetralkan, URL relatif di-rewrite absolut (img/a/link)
// Render tetap di iframe sandbox kosong (tanpa allow-scripts/same-origin),
// pertahanan ke-6 di sisi klien.
import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

export const BROWSER_DEFAULT_ALLOW = ["example.com"];

/** Policy browser per-project (FLOW user 2026-11: "semua URL bisa diakses").
 *  allowAll = lewati cek host (SSRF guard IP-private TETAP jalan, pertahanan
 *  non-negotiable). Disimpan `.yuika/browser.json` → { allow, allowAll }. */
export interface BrowserPolicy {
  allow: string[];
  allowAll: boolean;
}

export class BrowserReadError extends Error {
  constructor(
    readonly code:
      | "bad_url"
      | "scheme_denied"
      | "host_denied"
      | "private_blocked"
      | "too_many_redirects"
      | "content_type_denied"
      | "too_large"
      | "fetch_failed"
      | "timeout",
    message: string,
  ) {
    super(message);
    this.name = "BrowserReadError";
  }
}

/** Allowlist efektif utk workspace (pola sama dgn egress.ts). */
export function readBrowserAllow(workspacePath: string): string[] {
  return readBrowserPolicy(workspacePath).allow;
}

/** Policy lengkap (allowlist + mode allow-all) utk workspace. */
export function readBrowserPolicy(workspacePath: string): BrowserPolicy {
  const env = process.env.YUI_BROWSER_ALLOW?.trim();
  const file = path.join(workspacePath, ".yuika", "browser.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { allow?: unknown; allowAll?: unknown };
    const allow = Array.isArray(parsed.allow) && parsed.allow.length && parsed.allow.every((h) => typeof h === "string")
      ? parsed.allow.map(String)
      : null;
    if (allow) return { allow, allowAll: parsed.allowAll === true };
    if (parsed.allowAll === true) return { allow: env ? env.split(",").map((s) => s.trim()).filter(Boolean) : [...BROWSER_DEFAULT_ALLOW], allowAll: true };
  } catch {
    /* file opsional */
  }
  if (env)
    return {
      allow: env.split(",").map((s) => s.trim()).filter(Boolean),
      allowAll: false,
    };
  return { allow: [...BROWSER_DEFAULT_ALLOW], allowAll: false };
}

/** Tulis policy project (`.yuika/browser.json`). */
export function writeBrowserPolicy(workspacePath: string, policy: BrowserPolicy): void {
  const dir = path.join(workspacePath, ".yuika");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "browser.json"), JSON.stringify(policy, null, 2) + "\n", "utf8");
}

/** Hostname cocok allowlist (eksak atau suffix `.`). */
export function hostAllowedBrowser(host: string, allow: string[]): boolean {
  const h = host.toLowerCase();
  return allow.some((e0) => {
    const e = e0.toLowerCase();
    return e === h || (e.startsWith(".") && h.endsWith(e));
  });
}

/** IP literal private/loopback/link-local/CGNAT/metadata? */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const o = ip.split(".").map(Number);
    const [a, b] = [o[0] ?? 0, o[1] ?? 0];
    if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (v6.startsWith("fe80:") || v6.startsWith("fc") || v6.startsWith("fd")) return true; // link-local / ULA
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7)); // IPv4-mapped
  return false;
}

/** Hostname (nama DNS) resolve → semua alamat private diblok (guard SSRF dasar;
 *  rebinding penuh butuh pinning koneksi, catat di security review v0). */
export async function hostnameIsPrivate(host: string): Promise<boolean> {
  if (net.isIP(host)) return isPrivateIp(host);
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  try {
    // dns.lookup Node TIDAK punya timeout bawaan, resolver bermasalah (VPN/ISP)
    // bisa menggantung call selamanya (bug nyata: turn Scholar mati 2026-11).
    // Race 5 dtk; gagal resolve → anggap bukan private (fetch akan melaporkan error jaringan).
    const lookup = dns.lookup(host, { all: true });
    const bail = new Promise<never>((_, rej) => {
      const t = setTimeout(() => rej(new Error("dns lookup timeout")), 5_000);
      t.unref?.();
    });
    const res = await Promise.race([lookup, bail]);
    return res.some((a) => isPrivateIp(a.address));
  } catch {
    return false; // biarkan fetch yang melaporkan error jaringan
  }
}

/** Validasi URL utk dibaca (throw BrowserReadError bila ditolak). */
export async function assertBrowserUrlAllowed(
  rawUrl: string,
  opts: { allow: string[]; allowAll?: boolean; allowPrivate?: boolean },
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BrowserReadError("bad_url", `URL tidak valid: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BrowserReadError("scheme_denied", `hanya http/https (dapat: ${url.protocol})`);
  }
  if (!opts.allowAll && !hostAllowedBrowser(url.hostname, opts.allow)) {
    throw new BrowserReadError("host_denied", `domain tidak di allowlist project: ${url.hostname} (aktifkan \"Allow all domains\" di tab Browser utk membuka bebas)`);
  }
  if (!opts.allowPrivate && (await hostnameIsPrivate(url.hostname))) {
    throw new BrowserReadError("private_blocked", `host private/loopback diblok SSRF guard: ${url.hostname}`);
  }
  return url;
}

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 4;

/** Sanitizer HTML read-only: buang eksekusi + netralkan handler, rewrite URL
 *  relatif → absolut agar gambar/tautan tetap tampil di iframe sandbox. */
export function sanitizeBrowserHtml(html: string, base: URL): string {
  let out = html;
  // Blok eksekusi & konten pihak ketiga berbahaya
  out = out.replace(/<(script|iframe|object|embed|form|template)[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  out = out.replace(/<(script|iframe|object|embed|form|template)\b[^>]*\/?>/gi, "");
  // Inline event handler (onclick=…, onerror=…) & javascript:/vbscript:/data: URL
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  out = out.replace(/(href|src)\s*=\s*(["'])\s*(javascript|vbscript|data)\s*:[^"']*\2/gi, '$1="#"');
  // URL relatif → absolut (img/a/link/video/audio/source)
  out = out.replace(/(\s(?:href|src)\s*=\s*)(["'])(?!https?:|#|data:image\/|\/\/)([^"']+)\2/gi, (_m, pre, q, rel) => {
    try {
      return `${pre}${q}${new URL(rel, base).href}${q}`;
    } catch {
      return `${pre}${q}#${q}`;
    }
  });
  return out;
}

export interface BrowserPage {
  url: string; // URL FINAL setelah redirect
  contentType: string;
  title: string;
  html: string; // sudah disanitasi
}

/** Baca halaman utk tab Browser (read-only). Setiap hop redirect divalidasi. */
export async function readBrowserPage(
  rawUrl: string,
  opts: { allow: string[]; allowAll?: boolean; allowPrivate?: boolean },
): Promise<BrowserPage> {
  let url = await assertBrowserUrlAllowed(rawUrl, opts);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        headers: { "user-agent": "Yuika-Browser/0.1 (+read-only research view)", accept: "text/html,text/plain,*/*" },
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") throw new BrowserReadError("timeout", "waktu habis (15s)");
      throw new BrowserReadError("fetch_failed", `gagal fetch: ${(e as Error).message}`);
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) throw new BrowserReadError("fetch_failed", "redirect tanpa location");
      if (hop === MAX_REDIRECTS) throw new BrowserReadError("too_many_redirects", `lebih dari ${MAX_REDIRECTS} redirect`);
      url = await assertBrowserUrlAllowed(new URL(loc, url).href, opts);
      continue;
    }
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (contentType !== "text/html" && contentType !== "text/plain") {
      throw new BrowserReadError("content_type_denied", `tipe konten tidak diizinkan: ${contentType || "(kosong)"}`);
    }
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new BrowserReadError("too_large", `respons > ${MAX_BYTES} byte`);
    const raw = (await res.text()).slice(0, MAX_BYTES);
    const title = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(raw)?.[1]?.trim() ?? url.hostname;
    const html =
      contentType === "text/plain"
        ? `<html><body><pre>${raw.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c)}</pre></body></html>`
        : sanitizeBrowserHtml(raw, url);
    return { url: url.href, contentType, title, html };
  }
  throw new BrowserReadError("too_many_redirects", "redirect chain habis"); // unreachable
}
