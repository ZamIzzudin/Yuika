// @yuika/core — redaction secrets (P0-SEC-2, pola `redact` Hermes): nilai yang
// terlihat seperti kunci/token RAHASIA disamarkan SEBELUM masuk konteks agent
// (tool result → history → dikirim ke provider). Fail-closed: ragu-ragu →
// redact; teks normal tidak boleh berubah.
//
// Mengapa di tool result: stdout run_command & isi file adalah vektor bocor
// paling umum (script yang print env, file .env terbaca, grep menyentuh baris
// kunci). INPUT user/agent (write_file) TIDAK di-redact — memang ada isinya.

export const REDACTED = "«redacted»";

// Pola token bentuk-baku: prefix vendor dikenal + panjang aman.
const TOKEN_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bsk-[A-Za-z0-9_-]{16,}/g, label: "sk-…(API key)" },
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, label: "GitHub token" },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, label: "Slack token" },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, label: "AWS access key" },
  { re: /\bAIza[0-9A-Za-z_-]{30,}/g, label: "Google API key" },
  { re: /\bglpat-[A-Za-z0-9_-]{20,}/g, label: "GitLab token" },
  { re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, label: "JWT" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, label: "private key PEM" },
  { re: /\bBearer\s+[A-Za-z0-9._-]{16,}/gi, label: "Bearer token" },
];

// Assignment eksplisit: KEY=… / "secret": … — nama rahasia jelas, nilai panjang.
const ASSIGN_RE =
  /\b(api[_-]?key|apikey|secret|client[_-]?secret|access[_-]?token|auth[_-]?token|refresh[_-]?token|password|passwd)\b(["']?\s*[=:]\s*["']?)([^\s"']{8,})/gi;

/** Samarkan nilai rahasia di teks bebas. Idempotent (REDACTED tidak diubah lagi). */
export function redactSecrets(input: string): string {
  let out = input;
  for (const { re } of TOKEN_PATTERNS) out = out.replace(re, REDACTED);
  out = out.replace(ASSIGN_RE, (_m, name: string, sep: string) => `${name}${sep}${REDACTED}`);
  return out;
}
