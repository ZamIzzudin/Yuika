// @yuika/core, konfigurasi terpusat & tervalidasi .
// SEMUA env numerik/boolean YUI_* diparse DI SATU TEMPAT dengan zod:
// nilai rusak (mis. YUI_MAX_ITER="abc") → FAIL-FAST saat modul ini pertama
// diakses, bukan jadi NaN yang bocor ke runtime (dulu: Number(env) diam-diam
// menghasilkan NaN → loop 0 iterasi / timeout 0). String (key/model/URL)
// dibiarkan string, validasi bentuknya di masing-masing konsumen.
import { z } from "zod";

const int = (def: number, min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined || v === "" ? def : Number(v)),
    z.number().int().min(min).max(max),
  );

const schema = z.object({
  /** Budget iterasi tool-round per turn. Default 32: model butuh banyak
   * ronde baca-konteks sebelum menulis; 16 (default lama) terlalu sering
   * mentok di tengah progres (D100). */
  maxIter: int(32, 1, 128),
  /** Cap iterasi saat mode hardcore/auto-approve, selesaikan sampai tuntas. */
  maxIterHardcore: int(64, 1, 1024),
  /** Deadline approval (ms); 0 = tanpa timeout. */
  approvalTimeoutMs: int(300_000, 0, 86_400_000),
  /** Timeout provider (ms), default 5 mnt: model reasoning + context MCP besar
   *  bisa >120 dtk sampai token pertama (fix "Socket timeout" 2026-11). */
  providerTimeoutMs: int(300_000, 1_000, 600_000),
 /** Estimasi jendela konteks model (token), acuan kompresi . */
  contextTokens: int(128_000, 4_000, 2_000_000),
  /** Kompresi: fraksi jendela pemicu ×1000 (700 = 70%). */
  compressThresholdPct: int(700, 10, 1000),
  /** Kompresi: berapa pesan TERBARU selalu utuh. */
  compressKeepRecent: int(6, 2, 64),
  /** Kompresi: minimal pesan sebelum layak dikompresi. */
  compressMinMessages: int(10, 4, 512),
  /** Trace loop ke stdout (1) / matikan (0). */
  trace: z.preprocess((v) => (v === undefined ? true : v !== "0" && v !== "false"), z.boolean()),
 /** Level logging terstruktur pino : trace|debug|info|warn|error|fatal.\n * Kosong = otomatis: "debug" saat YUI_TRACE aktif, selain itu "info"
   *  (di bawah vitest default "warn" agar output test bersih). */
  logLevel: z
    .string()
    .regex(/^(trace|debug|info|warn|error|fatal)$/, "harus level pino yang sah")
    .optional(),
  /** Learn nudge pasca-turn (0 = matikan). */
  learn: z.preprocess((v) => v !== "0", z.boolean()),
 /** retensi events (hari), lebih tua dari ini diarsipkan ke
   *  events_archive (tabel aktif tetap ramping; bacaan UNION agar replay
   *  tetap utuh). 0 = housekeeping mati. */
  eventsRetentionDays: int(30, 0, 3650),
 /** mode eksekusi `node` via run_command, auto (docker bila ada,
   * fallback lokal), docker (fail-closed), off (selalu lokal). Dibaca ulang
   * per pemanggilan tool (hot-reload test), validasi di sini = fail-fast boot. */
  sandbox: z.enum(["auto", "docker", "off"]).default("auto"),
  /** Image container sandbox (default node:24-bookworm-slim, basis sama dengan
   *  Dockerfile repo, biasanya sudah ter-pull). */
  sandboxImage: z.string().min(1).optional(),
  /** Log manusia-vs-mesin: 1 (default) = baris pretty `YUI HH:MM:SS [mod] msg k=v`
   *  di stdout, struktur stabil untuk find/tracing manual; 0 = JSON-lines asli
   *  pino (dipakai docker-compose: agregator log grep per field). */
  logPretty: z.preprocess((v) => v !== "0" && v !== "false", z.boolean()),
 /** driver penyimpanan sesi, sqlite (default; embedded, desktop/
   *  dev) atau postgres (server: multi-worker, skala besar). Lain-lain store
   *  (project/memory/skills) tetap SQLite di workspace, menyusul bertahap. */
  dbDriver: z.enum(["sqlite", "postgres"]).default("sqlite"),
  /** Koneksi Postgres, wajib bila dbDriver=postgres (divalidasi di bawah). */
  databaseUrl: z.string().min(1).optional(),
})
  .superRefine((v, ctx) => {
    if (v.dbDriver === "postgres" && !v.databaseUrl) {
      ctx.addIssue({ code: "custom", path: ["databaseUrl"], message: "YUI_DB_DRIVER=postgres butuh DATABASE_URL (postgres://user:pass@host:5432/db)" });
    }
  });

export type CoreEnv = z.infer<typeof schema>;

const raw = {
  maxIter: process.env.YUI_MAX_ITER,
  maxIterHardcore: process.env.YUI_MAX_ITER_HARDCORE,
  approvalTimeoutMs: process.env.YUI_APPROVAL_TIMEOUT_MS,
  providerTimeoutMs: process.env.YUI_PROVIDER_TIMEOUT_MS,
  contextTokens: process.env.YUI_CONTEXT_TOKENS,
  compressThresholdPct: process.env.YUI_COMPRESS_THRESHOLD_PCT,
  compressKeepRecent: process.env.YUI_COMPRESS_KEEP_RECENT,
  compressMinMessages: process.env.YUI_COMPRESS_MIN_MESSAGES,
  trace: process.env.YUI_TRACE,
  logLevel: process.env.YUI_LOG_LEVEL || undefined,
  learn: process.env.YUI_LEARN,
  eventsRetentionDays: process.env.YUI_EVENTS_RETENTION_DAYS,
  sandbox: process.env.YUI_SANDBOX as "auto" | "docker" | "off" | undefined,
  sandboxImage: process.env.YUI_SANDBOX_IMAGE || undefined,
  logPretty: process.env.YUI_LOG_PRETTY,
  dbDriver: process.env.YUI_DB_DRIVER as "sqlite" | "postgres" | undefined,
  databaseUrl: process.env.DATABASE_URL || undefined,
};

const parsed = schema.safeParse(raw);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`[yui] env YUI_* tidak valid (fail-fast): ${issues}`);
}
export const env: CoreEnv = parsed.data;
