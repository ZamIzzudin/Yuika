// @yui/core — error taxonomy konsisten (P0-INF-4): SEMUA error yang melintasi
// batas (provider → loop, tool → loop, internal) diklasifikasi ke SATU bentuk:
//   kind  : kategori penanganan (provider | tool | mcp | budget | abort | internal)
//   code  : string stabil untuk grep/alert (mis. PROVIDER_TIMEOUT, TOOL_EXEC)
//   retryable : apakah aman mencoba ulang otomatis (dipakai route fallback P0-CORE-2)
//
// `SessionErrorEvent` (contracts) membawa kind+code → UI/log/alert satu bahasa.
// Enam kind dipilih minimal & eksklusif: cukup untuk memutuskan tindakan
// (retry / fallback / tampilkan / matikan) tanpa kategori tumpang-tindih.
import { ERROR_KINDS } from "@yui/contracts";

export type ErrorKind = (typeof ERROR_KINDS)[number];
export { ERROR_KINDS };

/** Kode error stabil (bukan daftar tertutup — sumber boleh menambah). */
export const ErrorCodes = {
  // provider
  PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT",
  PROVIDER_NETWORK: "PROVIDER_NETWORK",
  PROVIDER_RATE_LIMIT: "PROVIDER_RATE_LIMIT",
  PROVIDER_AUTH: "PROVIDER_AUTH",
  PROVIDER_HTTP: "PROVIDER_HTTP", // status lain (4xx/5xx) — detail di message
  PROVIDER_NO_RESPONSE: "PROVIDER_NO_RESPONSE",
  PROVIDER_UNKNOWN: "PROVIDER_UNKNOWN",
  // tool / mcp
  TOOL_EXEC: "TOOL_EXEC",
  TOOL_NOT_FOUND: "TOOL_NOT_FOUND",
  MCP_DISCONNECTED: "MCP_DISCONNECTED",
  // budget / abort
  ITERATION_BUDGET_EXCEEDED: "ITERATION_BUDGET_EXCEEDED",
  ABORTED: "ABORTED",
  // internal
  INTERNAL: "INTERNAL",
} as const;
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Error bermakna lintas batas — selalu punya kind+code+retryable. */
export class YuiError extends Error {
  override readonly name = "YuiError";
  constructor(
    readonly kind: ErrorKind,
    readonly code: string,
    message: string,
    readonly opts?: { cause?: unknown; retryable?: boolean },
  ) {
    super(message, { cause: opts?.cause });
    this.retryable = opts?.retryable ?? kind === "provider"; // default: provider layak retry
  }
  readonly retryable: boolean;

  toJSON(): { kind: ErrorKind; code: string; message: string; retryable: boolean } {
    return { kind: this.kind, code: this.code, message: this.message, retryable: this.retryable };
  }
}

/** Error jaringan/transport umum Node/openai SDK → retryable. */
const NETWORK_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "FETCH_FAILED",
]);
/** Status HTTP provider yang layak dicoba ulang otomatis. */
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/** Bentuk minimal error openai SDK & MCP SDK tanpa import tipe (hindari coupling). */
interface HasStatus {
  status?: number;
  code?: string | number;
}

/** Klasifikasi error TIDAK dikenal → YuiError. `fallbackKind` dipakai bila
 *  bentuknya tak dikenali (loop provider-catch → "provider"; tool-catch → "tool").
 *  Idempoten: YuiError masuk → YuiError keluar. */
export function classifyError(err: unknown, fallbackKind: ErrorKind = "internal"): YuiError {
  if (err instanceof YuiError) return err;

  const cause = err;
  const e = err as Error & HasStatus;
  const msg = err instanceof Error ? err.message : String(err);
  const errName = err instanceof Error ? err.name : "";
  const rawCode = e?.code;

  // 1) Abort user (P0-CORE-1) — BUKAN error; pemanggil wajib cek kind "abort".
  if (
    (typeof rawCode === "string" && (rawCode === "ABORT_ERR" || rawCode === "ABORTED")) ||
    errName === "AbortError" ||
    signalLooksAborted(msg)
  ) {
    return new YuiError("abort", ErrorCodes.ABORTED, msg, { cause, retryable: false });
  }

  if (fallbackKind === "provider") {
    // 2) Jaringan/transport (kode errno Node / undici / "fetch failed").
    if (typeof rawCode === "string" && NETWORK_CODES.has(rawCode.toUpperCase())) {
      return new YuiError("provider", ErrorCodes.PROVIDER_NETWORK, msg, { cause });
    }
    if (/^fetch failed$/i.test(msg) || /socket (hang up|timeout)/i.test(msg)) {
      return new YuiError("provider", ErrorCodes.PROVIDER_NETWORK, msg, { cause });
    }
    // 3) HTTP APIError SDK (punya `status`).
    if (typeof e?.status === "number") {
      const retryable = RETRYABLE_STATUS.has(e.status);
      const code =
        e.status === 401 || e.status === 403
          ? ErrorCodes.PROVIDER_AUTH
          : e.status === 429
            ? ErrorCodes.PROVIDER_RATE_LIMIT
            : e.status === 408
              ? ErrorCodes.PROVIDER_TIMEOUT
              : ErrorCodes.PROVIDER_HTTP;
      return new YuiError("provider", code, msg, { cause, retryable });
    }
    // 4) Timeout SDK bentuk "Request timed out".
    if (/timed? ?out|deadline/i.test(msg)) {
      return new YuiError("provider", ErrorCodes.PROVIDER_TIMEOUT, msg, { cause });
    }
    return new YuiError("provider", ErrorCodes.PROVIDER_UNKNOWN, msg, { cause });
  }

  if (fallbackKind === "tool") {
    if (/^tool .*not found|unknown tool/i.test(msg)) {
      return new YuiError("tool", ErrorCodes.TOOL_NOT_FOUND, msg, { cause, retryable: false });
    }
    return new YuiError("tool", ErrorCodes.TOOL_EXEC, msg, { cause, retryable: false });
  }

  if (fallbackKind === "mcp") {
    return new YuiError("mcp", ErrorCodes.MCP_DISCONNECTED, msg, { cause, retryable: true });
  }

  return new YuiError("internal", ErrorCodes.INTERNAL, msg, { cause, retryable: false });
}

/** Heuristik pesan abort lintas runtime (openai SDK, undici, fetch). */
function signalLooksAborted(msg: string): boolean {
  return /was aborted|aborted by user|request aborted|user abort|this operation was aborted/i.test(msg);
}
