// @yui/core — logging terstruktur (P0-INF-3): SATU logger pino untuk seluruh
// core, di-cache di globalThis (aturan repo: state module-level wajib
// globalThis — Next dev HMR & vitest sering memuat ulang modul; tanpa ini
// akan lahir banyak instance pino yang menulis duplikat).
//
// Output: JSON-lines ke stdout (machine-parseable). Level via YUI_LOG_LEVEL;
// default: "debug" saat YUI_TRACE aktif (baris [yui:trace] jadi logger.debug
// bermakna), "info" saat trace mati, "warn" di bawah vitest (output test
// bersih). traceId per turn = `turnId` yang di-bind via child logger:
//   const log = getLogger().child({ mod: "loop", sessionId, turnId });
// SEMUA baris log dari turn itu otomatis membawa sessionId+turnId — cukup
// grep satu id untuk menelusuri alur penuh.
import pino, { type Logger } from "pino";
import { env } from "./env.js";

type WithLogger = typeof globalThis & { __yuiLogger?: Logger };
const g = globalThis as WithLogger;

function defaultLevel(): string {
  if (env.logLevel) return env.logLevel;
  if (process.env.VITEST) return "warn";
  return env.trace ? "debug" : "info";
}

/** Logger root (singleton). Jangan tulis langsung — pakai `.child({ mod })`. */
export function getLogger(): Logger {
  if (!g.__yuiLogger) {
    g.__yuiLogger = pino({
      level: defaultLevel(),
      base: { app: "yui" }, // tanpa pid/hostname — noise untuk local-first app
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }
  return g.__yuiLogger;
}

/** Helper idiomatik: logger modul dengan binding tetap. */
export function moduleLogger(mod: string, bindings?: Record<string, unknown>): Logger {
  return getLogger().child({ mod, ...bindings });
}
