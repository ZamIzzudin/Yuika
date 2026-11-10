// @yuika/api: host → portal push notification (D76, MOB-3). Saat approval
// requested, host meminta portal mengirim FCM ke device LAIN akun yang sama
// (target + sig auth di sisi portal, POST /api/push/notify).
//
// Best-effort by design: portal down / FCM belum dikonfigurasi → diam saja
// (remote UI tetap dapat approval.request live + replay pending saat join).
// Throttle sederhana per approvalId agar retry bus tidak spam portal.
import { randomBytes } from "node:crypto";
import { signChallenge } from "@yuika/crypto";
import type { HostDeviceRecord } from "./store.js";

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

const sentRecently = new Map<string, number>();
const THROTTLE_MS = 60_000;

export async function pushApprovalAtPortal(rec: HostDeviceRecord, p: PushPayload): Promise<boolean> {
  const key = p.data?.approvalId ?? `${p.title}|${p.body}`;
  const now = Date.now();
  if ((sentRecently.get(key) ?? 0) > now - THROTTLE_MS) return false;
  sentRecently.set(key, now);
  if (sentRecently.size > 256) {
    for (const [k, t] of sentRecently) if (t <= now - THROTTLE_MS) sentRecently.delete(k);
  }

  const nonce = randomBytes(16).toString("hex");
  const sig = signChallenge(rec.signPriv, rec.deviceId, nonce);
  try {
    const res = await fetch(`${rec.portalUrl.replace(/\/$/, "")}/api/push/notify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: rec.deviceId, nonce, sig, ...p }),
      signal: AbortSignal.timeout(6_000),
    });
    return res.ok;
  } catch {
    return false; // best-effort: jangan ganggu turn
  }
}
