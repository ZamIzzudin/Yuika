// @yuika/api — P1-PRT-3/4: route portal.
// - POST /api/portal/pair   : host menukar pairing token portal → device keys
//   dibuat DI PROSES INI (private tak pernah keluar), claim REST portal,
//   simpan lokal (portal-device.db), start host worker relay.
// - GET  /api/portal/status : status link + relay + daftar remote (badge UI).
// - DELETE /api/portal/unlink: berhenti + hapus kredensial LOKAL (device masih
//   terdaftar di portal — unlink di sana via halaman Devices).
// - POST /api/remote-dev/claim: PROXY claim untuk halaman /dev/remote —
//   kunci dibuat di BROWSER (remote = device sendiri); API hanya meneruskan
//   public keys (menghindari CORS portal; portal tetap tak melihat private).
import type { FastifyInstance } from "fastify";
import { generateDeviceKeys } from "@yuika/crypto";
import { z } from "zod";
import { getPortalHost, defaultPortalUrl, defaultRelayUrl } from "../portal/service.js";
import { clearHostDevice, getHostDevice, getWebDevice, saveHostDevice } from "../portal/store.js";
import { getWebPresence } from "../portal/web-presence.js";

const PairRequest = z.object({
  token: z.string().min(20),
  name: z.string().max(64).optional(),
  kind: z.enum(["desktop", "mobile", "web"]).optional(),
  portalUrl: z.string().url().optional(),
  relayUrl: z.string().optional(),
});

const RemoteDevClaim = z.object({
  portalUrl: z.string().url(),
  token: z.string().min(20),
  kind: z.enum(["desktop", "mobile", "web"]),
  name: z.string().max(64).optional(),
  signPub: z.string(),
  dhPub: z.string(),
});

interface ClaimResponse { deviceId: string; accountId: string }

export async function claimAtPortal(portalUrl: string, body: unknown): Promise<ClaimResponse> {
  const res = await fetch(`${portalUrl.replace(/\/$/, "")}/api/devices/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: { deviceId?: string; accountId?: string; error?: string } = {};
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    /* body non-json */
  }
  if (!res.ok || !parsed.deviceId || !parsed.accountId) {
    const err = new Error(parsed.error ?? `portal claim gagal (HTTP ${res.status})`) as Error & { status?: number };
    err.status = res.status === 429 ? 429 : res.status >= 400 && res.status < 500 ? 400 : 502;
    throw err;
  }
  return { deviceId: parsed.deviceId, accountId: parsed.accountId };
}

export function registerPortalRoutes(app: FastifyInstance, getRt: () => import("@yuika/core").YuiRuntime): void {
  app.post("/api/portal/pair", async (req, reply) => {
    const body = PairRequest.parse(req.body);
    const portalUrl = body.portalUrl ?? defaultPortalUrl();
    const relayUrl = body.relayUrl ?? defaultRelayUrl();
    const keys = generateDeviceKeys(); // host keys hidup hanya di proses api
    const { deviceId, accountId } = await claimAtPortal(portalUrl, {
      token: body.token,
      kind: body.kind ?? "desktop",
      name: body.name ?? "Yuika host",
      signPub: keys.signPub,
      dhPub: keys.dhPub,
    });
    const record = {
      deviceId, accountId,
      kind: body.kind ?? ("desktop" as const),
      name: body.name ?? "Yuika host",
      signPriv: keys.signPriv, signPub: keys.signPub,
      dhPriv: keys.dhPriv, dhPub: keys.dhPub,
      portalUrl, relayUrl,
      linkedAt: Date.now(),
    };
    saveHostDevice(record);
    await getPortalHost().start(getRt(), record);
    return reply.code(200).send({ deviceId, accountId, relayUrl });
  });

  app.get("/api/portal/status", async () => {
    const svc = getPortalHost();
    const st = svc.status();
    // CP-4: device web auto-link (SSO) — presence di portal, terpisah dari host.
    const web = getWebDevice();
    const pres = getWebPresence().status();
    const webDevice = web
      ? { deviceId: web.deviceId, name: web.name, linkedAt: web.linkedAt, online: pres.deviceId === web.deviceId && pres.state === "authed" }
      : null;
    if (!st.linked) {
      const rec = getHostDevice();
      if (rec)
        return { linked: true, accountId: rec.accountId, deviceId: rec.deviceId, relayUrl: rec.relayUrl, relayState: "offline", remotes: [], webDevice, ...(st.note ? { note: st.note } : {}) };
      return { linked: false, accountId: null, deviceId: null, relayUrl: null, relayState: "offline", remotes: [], webDevice, ...(st.note ? { note: st.note } : {}) };
    }
    return { ...st, webDevice };
  });

  app.delete("/api/portal/unlink", async () => {
    await getPortalHost().stop();
    clearHostDevice();
    return { ok: true };
  });

  app.post("/api/remote-dev/claim", async (req, reply) => {
    const body = RemoteDevClaim.parse(req.body);
    const { deviceId, accountId } = await claimAtPortal(body.portalUrl, {
      token: body.token,
      kind: body.kind,
      name: body.name ?? "Dev remote",
      signPub: body.signPub,
      dhPub: body.dhPub,
    });
    return { deviceId, accountId };
  });
}
