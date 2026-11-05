// P0-SEC-2: redaction secrets — kunci/token di tool result (stdout run_command,
// isi read_file, baris search_files) disamarkan SEBELUM masuk konteks agent;
// teks normal tidak berubah; fail-closed (ragu → redact).
import { describe, expect, it } from "vitest";
import { redactSecrets, REDACTED } from "../redact.js";

describe("redactSecrets (P0-SEC-2)", () => {
  it("token bentuk-baku vendor disamarkan", () => {
    const cases = [
      "sk-abcdefghijklmnopqrstuvwx",
      "ghp_" + "a".repeat(36),
      "AKIA" + "A".repeat(16), // prefix + 16 char pas
      "AIza" + "a".repeat(35),
      "glpat-" + "a".repeat(20),
      "eyJ" + "b".repeat(24) + "." + "c".repeat(16) + "." + "d".repeat(16),
    ];
    for (const c of cases) {
      expect(redactSecrets(`key = ${c} done`)).toBe(`key = ${REDACTED} done`);
    }
  });

  it("assignment bernama rahasia → nilai disamarkan (bentuk = dan JSON)", () => {
    expect(redactSecrets("API_KEY=supersecretvalue123")).toBe(`API_KEY=${REDACTED}`);
    expect(redactSecrets('"password": "rahasia-panjang-99"')).toBe(`"password": "${REDACTED}"`);
    expect(redactSecrets("client_secret: abcdefgh12345678")).toBe(`client_secret: ${REDACTED}`);
    expect(redactSecrets("Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456")).toBe(`Authorization: ${REDACTED}`); // kata "Bearer" ikut disamarkan — lebih aman
  });

  it("teks normal TIDAK berubah (no false positive)", () => {
    const benign = [
      "task ke-3: tulis skrip",
      "token usage: 1234 keluar",
      "harga = 25000, diskon = sk-kecil",
      "sk-kecil (terlalu pendek → bukan key)",
      "NODE_ENV=development",
      `progress: ${REDACTED} sudah idempotent`,
    ];
    for (const t of benign) {
      expect(redactSecrets(t)).toBe(t);
    }
  });

  it("blok private key PEM disamarkan utuh", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\nMIIEow...\n-----END RSA PRIVATE KEY-----";
    expect(redactSecrets(`file:\n${pem}\nselesai`)).toBe(`file:\n${REDACTED}\nselesai`);
  });
});
