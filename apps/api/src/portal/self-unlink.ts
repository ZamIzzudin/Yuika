// @yuika/api: device melepaskan dirinya sendiri dari portal (sign-out
// symmetry). POST {portal}/api/devices/unlink-self {deviceId, nonce, sig}
// — sig = Ed25519(deviceId|nonce) diverifikasi portal terhadap sign_pub
// tersimpan (identik auth relay SPEC §3). Portal sweep (≤2s) memutus
// socket relay yang masih hidup; baris device hilang dari halaman Devices.
//
// Best-effort by design: portal down / endpoint lama (404) TIDAK memblokir
// sign-out — hanya device tetap terdaftar di portal (unlink manual di sana,
// perilaku lama). Kunci device TETAP tersimpan lokal: login berikutnya
// re-claim idempotent dengan deviceId stabil.
import { randomBytes } from "node:crypto";
import { signChallenge } from "@yuika/crypto";
import type { HostDeviceRecord } from "./store.js";

export async function unlinkSelfAtPortal(rec: HostDeviceRecord): Promise<boolean> {
  const nonce = randomBytes(16).toString("hex");
  const sig = signChallenge(rec.signPriv, rec.deviceId, nonce);
  try {
    const res = await fetch(`${rec.portalUrl.replace(/\/$/, "")}/api/devices/unlink-self`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: rec.deviceId, nonce, sig }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok && res.status !== 404) {
      // 404 = device sudah tidak ada di portal (mis. di-unlink manual) → sukses
      return false;
    }
    return true;
  } catch {
    return false; // portal unreachable — biarkan unlink manual
  }
}
