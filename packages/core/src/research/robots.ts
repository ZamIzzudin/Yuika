// Batch 7 (RS-2) — robots.txt guard untuk fetch riset: fetch → parse → cache 1 jam.
// Kesopanan riset: 404/timeout = diizinkan (standar umum), Disallow dihormati
// untuk group "*". Wildcard * dan anchor $ didukung.
const ROBOTS_TTL_MS = 60 * 60 * 1000;

interface RobotsEntry {
  ts: number;
  /** null = robots.txt tidak tersedia/bermasalah → semua diizinkan */
  rules: Array<{ allow: boolean; pattern: string }> | null;
}

const cache = new Map<string, RobotsEntry>();

export function clearRobotsCache(): void {
  cache.clear();
}

/** Ekstrak aturan group "*" (agent lain diabaikan — kita satu agen). */
export function parseRobots(text: string): Array<{ allow: boolean; pattern: string }> | null {
  const rules: Array<{ allow: boolean; pattern: string }> = [];
  let inStar = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = (rawKey ?? "").trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      inStar = value.split(",").some((ua) => ua.trim() === "*");
    } else if (inStar && (key === "disallow" || key === "allow")) {
      if (key === "disallow" && value === "") continue; // "Disallow:" = izinkan semua
      rules.push({ allow: key === "allow", pattern: value });
    }
  }
  return rules.length ? rules : null;
}

/** Match path terhadap pattern robots (dari awal path; * = bebas; $ = ujung). */
export function robotsPatternMatch(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp("^" + body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + (anchored ? "$" : ""));
  return re.test(path);
}

export function robotsAllows(rules: Array<{ allow: boolean; pattern: string }> | null, path: string): boolean {
  if (!rules) return true;
  // Aturan paling spesifik (pattern terpanjang yang cocok) menang; tak ada yang cocok → boleh.
  let best: { allow: boolean; pattern: string } | null = null;
  for (const r of rules) {
    if (robotsPatternMatch(r.pattern, path) && (!best || r.pattern.length > best.pattern.length)) best = r;
  }
  return best ? best.allow : true;
}

async function fetchRobots(origin: string): Promise<Array<{ allow: boolean; pattern: string }> | null> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(6_000),
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
    });
    if (res.status >= 400) return null;
    return parseRobots((await res.text()).slice(0, 256 * 1024));
  } catch {
    return null; // jaringan gagal → perlakukan seperti tak ada robots
  }
}

/** Apakah GET halaman ini diizinkan robots.txt host-nya? (cache 1 jam) */
export async function isAllowedByRobots(url: URL, now = Date.now()): Promise<boolean> {
  const origin = url.origin;
  const hit = cache.get(origin);
  let rules: Array<{ allow: boolean; pattern: string }> | null;
  if (hit && now - hit.ts < ROBOTS_TTL_MS) {
    rules = hit.rules;
  } else {
    rules = await fetchRobots(origin);
    cache.set(origin, { ts: now, rules });
  }
  return robotsAllows(rules, url.pathname + url.search);
}
