// @yuika/core, logging terstruktur : SATU logger pino untuk seluruh
// core, di-cache di globalThis (aturan repo: state module-level wajib
// globalThis, Next dev HMR & vitest sering memuat ulang modul; tanpa ini
// akan lahir banyak instance pino yang menulis duplikat).
//
// Output: JSON-lines ke stdout (machine-parseable). Level via YUI_LOG_LEVEL;
// default: "debug" saat YUI_TRACE aktif (baris [yui:trace] jadi logger.debug
// bermakna), "info" saat trace mati, "warn" di bawah vitest (output test
// bersih). traceId per turn = `turnId` yang di-bind via child logger:
//   const log = getLogger().child({ mod: "loop", sessionId, turnId });
// SEMUA baris log dari turn itu otomatis membawa sessionId+turnId, cukup
// grep satu id untuk menelusuri alur penuh.
import pino, { type Logger } from "pino";
import { Writable } from "node:stream";
import { env } from "./env.js";

type WithLogger = typeof globalThis & { __yuiLogger?: Logger };
const g = globalThis as WithLogger;

function defaultLevel(): string {
  if (env.logLevel) return env.logLevel;
  if (process.env.VITEST) return "warn";
  return env.trace ? "debug" : "info";
}

// ---- Mode pretty (dev): baris tunggal mudah dibaca manusia, TAPI tetap
// terstruktur, struktur `YUI HH:MM:SS.mmm [mod] msg key=val …` stabil:
//   find "[mcp]"      → semua aktivitas modul itu
//   find "connected"  → peristiwa tertentu lintas modul
//   find "ses=1003"   → seluruh alur satu sesi (4 char terakhir sessionId)
//   find "ERROR/WARN" → hanya baris bermasalah
// JSON-lines asli tetap tersedia untuk mesin (YUI_LOG_PRETTY=0, dipakai
// docker-compose: agregator log grep-able per field).
function fmtVal(v: unknown): string {
  if (typeof v === "string") return /^\S*$/.test(v) ? v : JSON.stringify(v);
  if (v === null || v === undefined) return "-";
  if (typeof v === "object") {
    const s = JSON.stringify(v) ?? "-";
    return s.length > 120 ? s.slice(0, 117) + "…" : s;
  }
  return String(v);
}

function prettyLine(o: Record<string, unknown>): string {
  // time bisa epoch number (default pino) ATAU ISO string (isoTime), Date menerima
  // keduanya; guard NaN untuk data eksternal
  const d = new Date(o.time as string | number);
  const t = Number.isNaN(d.getTime()) ? "??:??:??.???" : d.toISOString().slice(11, 23); // HH:MM:SS.mmm
  const lvl = Number(o.level) >= 50 ? "ERROR " : Number(o.level) >= 40 ? "WARN " : "";
  const mod = o.mod ? `[${String(o.mod)}]` : "[core]";
  const ses = o.sessionId ? ` ses=${String(o.sessionId).slice(-4)}` : "";
  const skip = new Set(["level", "time", "app", "mod", "msg", "sessionId", "turnId"]);
  const kv = Object.entries(o)
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => `${k}=${fmtVal(v)}`)
    .join(" ");
  return `YUI ${t} ${lvl}${mod} ${o.msg ?? ""}${ses}${kv ? "  " + kv : ""}`.replace(/\s+$/, "");
}

const prettyStream = new Writable({
  write(chunk: Buffer, _enc, cb) {
    try {
      process.stdout.write(prettyLine(JSON.parse(String(chunk))) + "\n");
    } catch {
      process.stdout.write(chunk); // baris non-JSON, lewat apa adanya
    }
    cb();
  },
});

/** Logger root (singleton). Jangan tulis langsung, pakai `.child({ mod })`. */
export function getLogger(): Logger {
  if (!g.__yuiLogger) {
    const opts = {
      level: defaultLevel(),
      base: { app: "yui" }, // tanpa pid/hostname, noise untuk local-first app
      timestamp: pino.stdTimeFunctions.isoTime,
    };
    g.__yuiLogger = env.logPretty ? pino(opts, prettyStream) : pino(opts);
  }
  return g.__yuiLogger;
}

/** Helper idiomatik: logger modul dengan binding tetap. */
export function moduleLogger(mod: string, bindings?: Record<string, unknown>): Logger {
  return getLogger().child({ mod, ...bindings });
}
