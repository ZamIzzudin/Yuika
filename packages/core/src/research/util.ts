// Batch 7 (RS) — util bersama provider riset: UA, fetch wrapper, strip HTML.

/** UA browser desktop untuk halaman umum & endpoint nonofficial (fungsi dulu —
 *  sebagian endpoint menolak UA non-browser; identitas jujur dipakai untuk API resmi). */
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** UA jujur untuk API resmi (Wikipedia, GitHub, CoinGecko, …). */
export const RESEARCH_UA = "YuikaResearch/0.1 (+self-host research agent)";

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));
}

export function htmlToPlain(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export async function httpJson<T>(url: string, opts: { ua?: string; timeoutMs?: number } = {}): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    headers: { "user-agent": opts.ua ?? RESEARCH_UA, accept: "application/json" },
  });
  return { status: res.status, data: (await res.json()) as T };
}

export async function httpText(
  url: string,
  opts: { ua?: string; timeoutMs?: number; accept?: string } = {},
): Promise<{ status: number; text: string }> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000),
    headers: { "user-agent": opts.ua ?? BROWSER_UA, accept: opts.accept ?? "text/html,application/xhtml+xml,*/*;q=0.8" },
  });
  return { status: res.status, text: (await res.text()).slice(0, 2 * 1024 * 1024) };
}

/** Race promise dengan deadline — guard watchdog utk await yang bisa menggantung
 *  (DNS, stream lambat). Label jadi pesan error. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(label)), ms);
  });
  return Promise.race([p, guard]).finally(() => clearTimeout(t)) as Promise<T>;
}

/** Throttle per-domain (RS-2): jeda minimum antar request ke host yang sama.
 *  RESERVASI SEKALI lalu tidur sampai slot — caller paralel tidak pernah
 *  me-re-queue dirinya (bug lama: waiter menambah slot tiap bangun → livelock). */
const nextSlot = new Map<string, number>();

export async function domainThrottle(host: string, minMs: number): Promise<void> {
  if (minMs <= 0) return;
  const now = Date.now();
  const slot = Math.max(nextSlot.get(host) ?? 0, now);
  nextSlot.set(host, slot + minMs); // reservasi atomik (JS single-thread, tanpa await di antara)
  const wait = slot - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
