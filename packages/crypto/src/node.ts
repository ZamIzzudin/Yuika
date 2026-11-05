// @yuika/crypto — backend Node (byte-exact dengan yuika-portal/packages/crypto).
// Spec: docs/portal/SPEC-PROTOCOL.md §3 (signChallenge) & §5 (envelope E2E).
// JANGAN ubah semantik — perubahan = proto bump (SPEC §12).
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign as edSign,
  verify as edVerify,
} from "node:crypto";
import { IV_LEN, KEY_LEN, TAG_LEN, type DeviceKeys } from "./shared.js";

// ── device keys ─────────────────────────────────────────────────────────────

/** Device ID baru + sepasang keypair (sign + DH). */
export function generateDeviceKeys(): DeviceKeys {
  const sign = generateKeyPairSync("ed25519");
  const dh = generateKeyPairSync("x25519");
  return {
    deviceId: `dev_${randomBytes(8).toString("hex")}`,
    signPriv: sign.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    signPub: sign.publicKey.export({ type: "spki", format: "pem" }).toString(),
    dhPriv: dh.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    dhPub: dh.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

// ── relay auth (sign) ───────────────────────────────────────────────────────

/** `sig = Ed25519(priv, deviceId|nonce)` base64 — auth relay SPEC §3. */
export function signChallenge(signPrivPem: string, deviceId: string, nonce: string): string {
  return edSign(
    null,
    Buffer.from(`${deviceId}|${nonce}`, "utf8"),
    createPrivateKey(signPrivPem),
  ).toString("base64");
}

/** Verifikasi challenge (dipakai relay / test double). */
export function verifyChallenge(
  signPubPem: string,
  deviceId: string,
  nonce: string,
  sigB64: string,
): boolean {
  try {
    return edVerify(
      null,
      Buffer.from(`${deviceId}|${nonce}`, "utf8"),
      createPublicKey(signPubPem),
      Buffer.from(sigB64, "base64"),
    );
  } catch {
    return false;
  }
}

// ── envelope E2E ────────────────────────────────────────────────────────────

function deriveKey(dhPrivPem: string, peerDhPubPem: string, aad: string): Buffer {
  const secret = diffieHellman({
    privateKey: createPrivateKey(dhPrivPem),
    publicKey: createPublicKey(peerDhPubPem),
  });
  return Buffer.from(
    hkdfSync("sha256", secret, Buffer.from(aad, "utf8"), Buffer.alloc(0), KEY_LEN),
  );
}

/**
 * Enkripsi E2E — return base64(iv ‖ ciphertext ‖ tag), AAD `from|to` (SPEC §5).
 * key = HKDF-SHA256(X25519(dhPriv, peerDhPub), salt=aad, info="", L=32).
 */
export function seal(
  from: { deviceId: string; dhPriv: string },
  to: { deviceId: string; dhPub: string },
  plaintext: string | Buffer,
): string {
  const aad = `${from.deviceId}|${to.deviceId}`;
  const key = deriveKey(from.dhPriv, to.dhPub, aad);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, ct, cipher.getAuthTag()]).toString("base64");
}

/** Buka envelope — throw jika kunci salah / AAD tak cocok / box dimanipulasi. */
export function open(
  to: { deviceId: string; dhPriv: string },
  from: { deviceId: string; dhPub: string },
  boxB64: string,
): Buffer {
  const aad = `${from.deviceId}|${to.deviceId}`;
  const key = deriveKey(to.dhPriv, from.dhPub, aad);
  const raw = Buffer.from(boxB64, "base64");
  if (raw.length < IV_LEN + TAG_LEN) throw new Error("box too short");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_LEN));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(raw.subarray(raw.length - TAG_LEN));
  return Buffer.concat([
    decipher.update(raw.subarray(IV_LEN, raw.length - TAG_LEN)),
    decipher.final(),
  ]);
}

// ── util ────────────────────────────────────────────────────────────────────

/** SHA-256 hex (vectors). */
export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export { type DeviceKeys };
