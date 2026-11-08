// D51: GET /api/meta — versi build studio + indikator update (self-host).
// - version dibaca dari package.json root (satu sumber kebenaran, di-release
//   via git tag v*).
// - latest diambil dari GitHub Releases (API publik, tanpa auth, cache 1 jam,
//   dijalankan SERVER-side sehingga bebas CORS & tak membocorkan IP user ke
//   pihak ketiga selain IP VPS). Kegagalan jaringan BUKAN error: latest=null,
//   UI cukup menampilkan versi lokal.
// Route ini DIKECUALIKAN dari gerbang auth (informasi versi bersifat publik,
// bergali sebelum login untuk debugging upgrade).
import fs from "node:fs";
import type { FastifyInstance } from "fastify";

interface MetaState {
  latest: string | null;
  releaseUrl: string | null;
  checkedAt: number;
}

const DEFAULT_RELEASES_API =
  "https://api.github.com/repos/ZamIzzudin/Yuika/releases/latest";
const CACHE_MS = Number(process.env.YUI_META_CACHE_MS ?? 3_600_000);

let cache: MetaState = { latest: null, releaseUrl: null, checkedAt: 0 };

/** "v1.2.3" / "1.2.3" → [1,2,3]; selain itu null. */
function parseSemver(tag: string): number[] | null {
  const m = tag.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function isNewer(candidate: string, current: string): boolean {
  const a = parseSemver(candidate);
  const b = parseSemver(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! > b[i]!;
  }
  return false;
}

function readVersion(): string {
  // apps/api/src/routes/meta.ts → ../../../package.json = repo root
  // (di container: /app/package.json, di dev: root repo).
  const file = new URL("../../../package.json", import.meta.url);
  try {
    return (JSON.parse(fs.readFileSync(file, "utf8")) as { version?: string })
      .version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const version = readVersion();

async function refreshLatest(): Promise<MetaState> {
  const now = Date.now();
  if (now - cache.checkedAt < CACHE_MS) return cache;
  if (process.env.YUI_UPDATE_CHECK === "0") {
    cache = { latest: null, releaseUrl: null, checkedAt: now };
    return cache;
  }
  const api = process.env.YUI_RELEASES_API ?? DEFAULT_RELEASES_API;
  try {
    const r = await fetch(api, {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const body = (await r.json()) as { tag_name?: string; html_url?: string };
    cache = {
      latest: body.tag_name?.trim() ?? null,
      releaseUrl: body.html_url ?? null,
      checkedAt: now,
    };
  } catch {
    // offline / rate-limited: pertahankan hasil lama, jangan gagalkan request
    cache = { ...cache, checkedAt: now };
  }
  return cache;
}

export function registerMetaRoutes(app: FastifyInstance): void {
  app.get("/api/meta", async (_req, reply) => {
    const state = await refreshLatest();
    return reply.send({
      version,
      latest: state.latest,
      updateAvailable: state.latest ? isNewer(state.latest, version) : false,
      releaseUrl: state.releaseUrl,
    });
  });
}

/** Test-only: reset cache antar suite. */
export function _resetMetaCacheForTests(): void {
  cache = { latest: null, releaseUrl: null, checkedAt: 0 };
}
