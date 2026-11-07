// @yuika/core — redaksi nilai vault AKTIF (P2-VLT-5, pola rokazo scrub hidden
// fields tapi LEBIH KETAT: proses-wide, bukan per-bot): begitu sebuah nilai
// di-decrypt untuk dipakai (secret_http / run_command env), nilai itu masuk
// registry aktif dan disamarkan dari SEMUA output tool (plain + base64 +
// urlencode + base64url) sampai proses berakhir. Nilai pendek (<6 char)
// dilewati supaya teks normal tidak rusak.
//
// Kombinasi dengan redact.ts (pola bentuk-baku): redactSecrets() duluan
// (kunci tak dikenal), lalu redactActive() (nilai yang SUDAH diketahui).
const g = globalThis as unknown as { __yuiVaultActive?: Map<string, number> };
const active = (g.__yuiVaultActive ??= new Map<string, number>());

export const VAULT_REDACTED = "«redacted(vault)»";

export function registerActiveSecret(value: string): void {
  if (!value || value.length < 6) return; // terlalu pendek → mangle teks normal
  active.set(value, (active.get(value) ?? 0) + 1);
}

export function releaseActiveSecret(value: string): void {
  if (!value) return;
  const n = active.get(value);
  if (n == null) return;
  if (n <= 1) active.delete(value);
  else active.set(value, n - 1);
}

/** Samarkan semua nilai vault aktif di teks (plain/base64/base64url/urlencode). */
export function redactActive(text: string): string {
  if (active.size === 0 || !text) return text;
  let out = text;
  for (const v of active.keys()) {
    const b64 = Buffer.from(v, "utf8").toString("base64");
    const b64url = b64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    const enc = encodeURIComponent(v);
    // dedup + buang varian terlalu pendek (mangle teks normal)
    const variants = [v, b64, b64url, enc].filter(
      (s, i, arr) => s.length >= 6 && arr.indexOf(s) === i,
    );
    for (const s of variants) {
      if (out.includes(s)) out = out.split(s).join(VAULT_REDACTED);
    }
  }
  return out;
}

/** Test helper. */
export function activeSecretCount(): number {
  return active.size;
}

/** Test helper — bersihkan registry. */
export function resetActiveSecretsForTests(): void {
  active.clear();
}
