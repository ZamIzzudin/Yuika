// @yuika/crypto — primitif portal (shared, isomorfik).
// Spec: docs/portal/SPEC-PROTOCOL.md §5 (mirror FROZEN dari yuika-portal).
// Byte-format device credential & envelope WAJIB identik dengan
// `yuika-portal/packages/crypto` — diverifikasi golden vectors
// docs/portal/vectors/proto1.json (hash di docs/portal/README.md).
//
// File ini murni (tanpa node:crypto / DOM) — dipakai backend node (src/node.ts)
// dan web (src/web.ts, WebCrypto).

/** Kredential device: sign (Ed25519) + DH (X25519), PEM PKCS8/SPKI. */
export interface DeviceKeys {
  deviceId: string;
  /** Ed25519 PKCS8/SPKI PEM — private TIDAK pernah keluar dari device. */
  signPriv: string;
  signPub: string;
  /** X25519 PKCS8/SPKI PEM. */
  dhPriv: string;
  dhPub: string;
}

export const IV_LEN = 12;
export const KEY_LEN = 32;
export const TAG_LEN = 16;

// ── bytes ⇄ base64 (murni, tanpa Buffer — jalan di browser & node) ─────────

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToB64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2]!;
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]!;
    out += b1 === undefined ? "=" : B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]!;
    out += b2 === undefined ? "=" : B64[b2 & 63]!;
  }
  return out;
}

export function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(new ArrayBuffer(Math.floor((clean.length * 3) / 4)));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64.indexOf(clean[i]!);
    const c1 = B64.indexOf(clean[i + 1] ?? "A");
    const c2 = B64.indexOf(clean[i + 2] ?? "A");
    const c3 = B64.indexOf(clean[i + 3] ?? "A");
    out[o++] = (c0 << 2) | (c1 >> 4);
    if (clean[i + 2] && clean[i + 2] !== "=") out[o++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (clean[i + 3] && clean[i + 3] !== "=") out[o++] = ((c2 & 3) << 6) | c3;
  }
  return out.subarray(0, o);
}

const textEncoder = new TextEncoder();
/** Uint8Array di atas ArrayBuffer murni (kompatibel BufferSource DOM lib). */
export function utf8(s: string): Uint8Array<ArrayBuffer> {
  const e = textEncoder.encode(s);
  const out = new Uint8Array(new ArrayBuffer(e.length));
  out.set(e);
  return out;
}

/** UTF-8 decode bytes → string (aman untuk konten envelope). */
export function fromUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// ── PEM (PKCS8/SPKI) — format identik export node:crypto ──────────────────

export function pemEncode(der: Uint8Array, label: "PRIVATE KEY" | "PUBLIC KEY"): string {
  const b64 = bytesToB64(der);
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

export function pemDecode(pem: string): Uint8Array<ArrayBuffer> {
  const m = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .trim();
  return b64ToBytes(m);
}
