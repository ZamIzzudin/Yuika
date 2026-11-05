// @yui/core — konfigurasi terpusat & tervalidasi (P0-INF-2).
// SEMUA env numerik/boolean YUI_* diparse DI SATU TEMPAT dengan zod:
// nilai rusak (mis. YUI_MAX_ITER="abc") → FAIL-FAST saat modul ini pertama
// diakses, bukan jadi NaN yang bocor ke runtime (dulu: Number(env) diam-diam
// menghasilkan NaN → loop 0 iterasi / timeout 0). String (key/model/URL)
// dibiarkan string — validasi bentuknya di masing-masing konsumen.
import { z } from "zod";

const int = (def: number, min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined || v === "" ? def : Number(v)),
    z.number().int().min(min).max(max),
  );

const schema = z.object({
  /** Budget iterasi tool-round per turn. */
  maxIter: int(16, 1, 128),
  /** Cap iterasi saat mode hardcore/auto-approve — selesaikan sampai tuntas. */
  maxIterHardcore: int(64, 1, 1024),
  /** Deadline approval (ms); 0 = tanpa timeout. */
  approvalTimeoutMs: int(300_000, 0, 86_400_000),
  /** Timeout provider (ms) — default 5 mnt: model reasoning + context MCP besar
   *  bisa >120 dtk sampai token pertama (fix "Socket timeout" 2026-11). */
  providerTimeoutMs: int(300_000, 1_000, 600_000),
  /** Estimasi jendela konteks model (token) — acuan kompresi (P0-CORE-4). */
  contextTokens: int(128_000, 4_000, 2_000_000),
  /** Kompresi: fraksi jendela pemicu ×1000 (700 = 70%). */
  compressThresholdPct: int(700, 10, 1000),
  /** Kompresi: berapa pesan TERBARU selalu utuh. */
  compressKeepRecent: int(6, 2, 64),
  /** Kompresi: minimal pesan sebelum layak dikompresi. */
  compressMinMessages: int(10, 4, 512),
  /** Trace loop ke stdout (1) / matikan (0). */
  trace: z.preprocess((v) => (v === undefined ? true : v !== "0" && v !== "false"), z.boolean()),
  /** Level logging terstruktur pino (P0-INF-3): trace|debug|info|warn|error|fatal.\n   *  Kosong = otomatis: "debug" saat YUI_TRACE aktif, selain itu "info"
   *  (di bawah vitest default "warn" agar output test bersih). */
  logLevel: z
    .string()
    .regex(/^(trace|debug|info|warn|error|fatal)$/, "harus level pino yang sah")
    .optional(),
  /** Learn nudge pasca-turn (0 = matikan). */
  learn: z.preprocess((v) => v !== "0", z.boolean()),
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
};

const parsed = schema.safeParse(raw);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`[yui] env YUI_* tidak valid (fail-fast): ${issues}`);
}
export const env: CoreEnv = parsed.data;
