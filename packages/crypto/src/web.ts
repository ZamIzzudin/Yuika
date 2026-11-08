// @yuika/crypto, backend WebCrypto (browser, async).
// Identik byte-format dengan backend node (@yuika/crypto), diverifikasi
// golden vectors (suite vectors.test.ts menjalankan backend INI terhadap
// vectors yang sama). Dipakai klien remote web/mobile (WebCrypto).
//
// Syarat: WebCrypto dengan Ed25519 + X25519 (Chromium ≥137, Node ≥18 webcrypto).
const subtle = globalThis.crypto.subtle;

import {
  IV_LEN,
  KEY_LEN,
  TAG_LEN,
  bytesToB64,
  b64ToBytes,
  fromUtf8,
  pemDecode,
  pemEncode,
  utf8,
  type DeviceKeys,
} from "./shared.js";

function randomHex(n: number): string {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// ── device keys ─────────────────────────────────────────────────────────────

/** Device ID baru + sepasang keypair (Ed25519 + X25519), PEM PKCS8/SPKI. */
export async function generateDeviceKeys(): Promise<DeviceKeys> {
  const sign = (await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const dh = (await subtle.generateKey({ name: "X25519" }, true, ["deriveBits"])) as CryptoKeyPair;
  return {
    deviceId: `dev_${randomHex(8)}`,
    signPriv: pemEncode(new Uint8Array(await subtle.exportKey("pkcs8", sign.privateKey)), "PRIVATE KEY"),
    signPub: pemEncode(new Uint8Array(await subtle.exportKey("spki", sign.publicKey)), "PUBLIC KEY"),
    dhPriv: pemEncode(new Uint8Array(await subtle.exportKey("pkcs8", dh.privateKey)), "PRIVATE KEY"),
    dhPub: pemEncode(new Uint8Array(await subtle.exportKey("spki", dh.publicKey)), "PUBLIC KEY"),
  };
}

// ── relay auth (sign) ───────────────────────────────────────────────────────

export async function signChallenge(signPrivPem: string, deviceId: string, nonce: string): Promise<string> {
  const key = await subtle.importKey("pkcs8", pemDecode(signPrivPem), { name: "Ed25519" }, false, ["sign"]);
  const sig = await subtle.sign({ name: "Ed25519" }, key, utf8(`${deviceId}|${nonce}`));
  return bytesToB64(new Uint8Array(sig));
}

export async function verifyChallenge(
  signPubPem: string,
  deviceId: string,
  nonce: string,
  sigB64: string,
): Promise<boolean> {
  try {
    const key = await subtle.importKey("spki", pemDecode(signPubPem), { name: "Ed25519" }, false, ["verify"]);
    return await subtle.verify(
      { name: "Ed25519" },
      key,
      b64ToBytes(sigB64),
      utf8(`${deviceId}|${nonce}`),
    );
  } catch {
    return false;
  }
}

// ── envelope E2E ────────────────────────────────────────────────────────────

async function deriveKey(dhPrivPem: string, peerDhPubPem: string, aad: string): Promise<CryptoKey> {
  const priv = await subtle.importKey("pkcs8", pemDecode(dhPrivPem), { name: "X25519" }, false, ["deriveBits"]);
  const pub = await subtle.importKey("spki", pemDecode(peerDhPubPem), { name: "X25519" }, false, []);
  const secret = new Uint8Array(await subtle.deriveBits({ name: "X25519", public: pub }, priv, 256));
  const hkdfKey = await subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]);
  // HKDF-SHA256(secret, salt=aad, info="", L=32), selaras node hkdfSync.
  const keyBits = await subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: utf8(aad), info: new Uint8Array(0) },
    hkdfKey,
    KEY_LEN * 8,
  );
  return subtle.importKey("raw", new Uint8Array(keyBits), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** base64(iv ‖ ct ‖ tag), AAD `from|to` (SPEC §5). */
export async function seal(
  from: { deviceId: string; dhPriv: string },
  to: { deviceId: string; dhPub: string },
  plaintext: string,
): Promise<string> {
  const aad = `${from.deviceId}|${to.deviceId}`;
  const key = await deriveKey(from.dhPriv, to.dhPub, aad);
  const iv = new Uint8Array(IV_LEN);
  crypto.getRandomValues(iv);
  // WebCrypto AES-GCM output = ciphertext ‖ tag, layout identik node (iv ‖ ct ‖ tag).
  const ct = new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8(aad) }, key, utf8(plaintext)),
  );
  const box = new Uint8Array(IV_LEN + ct.length);
  box.set(iv, 0);
  box.set(ct, IV_LEN);
  return bytesToB64(box);
}

/** Buka envelope, throw jika kunci/AAD salah. */
export async function open(
  to: { deviceId: string; dhPriv: string },
  from: { deviceId: string; dhPub: string },
  boxB64: string,
): Promise<string> {
  const aad = `${from.deviceId}|${to.deviceId}`;
  const key = await deriveKey(to.dhPriv, from.dhPub, aad);
  const raw = b64ToBytes(boxB64);
  if (raw.length < IV_LEN + TAG_LEN) throw new Error("box too short");
  const iv = raw.subarray(0, IV_LEN);
  const ct = raw.subarray(IV_LEN);
  const pt = await subtle.decrypt({ name: "AES-GCM", iv, additionalData: utf8(aad) }, key, ct);
  return fromUtf8(new Uint8Array(pt));
}

export async function sha256Hex(s: string): Promise<string> {
  const digest = new Uint8Array(await subtle.digest("SHA-256", utf8(s)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}
