"use client";
// P1-PRT-3 — seksi Settings → Portal: pairing host + status link + remote list.
// Kunci device HOST dibuat di proses api (bukan browser) — halaman ini hanya
// menyerahkan pairing token (QR/copy dari portal web) ke /api/portal/pair.
import { useCallback, useEffect, useState } from "react";
import { apiUrl, authFetch } from "@/lib/api";
import { Button, Card, Field, TextInput } from "@/components/ui";
import { toastErr, toastOk } from "@/components/ui/toast";
import { Skeleton } from "@/components/Skeleton";

interface PortalStatus {
  linked: boolean;
  accountId: string | null;
  deviceId: string | null;
  relayUrl: string | null;
  relayState: "offline" | "connecting" | "authed" | "closed";
  remotes: Array<{ deviceId: string; kind: string; name: string }>;
  /** CP-4: browser auto-link (SSO) — presence, terpisah dari host manual. */
  webDevice: { deviceId: string; name: string; linkedAt: number } | null;
}

export function PortalSettings() {
  const [st, setSt] = useState<PortalStatus | null>(null);
  const [token, setToken] = useState("");
  const [portalUrl, setPortalUrl] = useState("http://localhost:3100");
  const [name, setName] = useState("Yuika host");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authFetch(apiUrl("/api/portal/status"));
      if (res.ok) setSt((await res.json()) as PortalStatus);
    } catch {
      /* retry saat buka */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);

  async function pair() {
    setBusy(true);
    try {
      const res = await authFetch(apiUrl("/api/portal/pair"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: token.trim(), portalUrl: portalUrl.trim(), name: name.trim() || "Yuika host" }),
      });
      const body = (await res.json()) as { error?: string; deviceId?: string };
      if (!res.ok) {
        // Pesan portal "token is for kind 'web'" → arahkan ke tujuan benar:
        // token Web = remote browser (/dev/remote), bukan pairing host ini.
        const m = body.error?.match(/for kind '(\w+)'/i);
        if (m && m[1] && m[1].toLowerCase() !== "desktop") {
          toastErr(
            `${body.error} — this input pairs Yuika as a host: generate a Desktop token (Portal → Devices). ${m[1] === "web" ? "Web tokens are for the Remote page (/dev/remote)." : ""}`,
          );
        } else {
          toastErr(body.error ?? "pairing failed");
        }
        return;
      }
      toastOk(`Host linked as ${body.deviceId}`);
      setToken("");
      await load();
    } catch {
      toastErr("could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    try {
      const res = await authFetch(apiUrl("/api/portal/unlink"), { method: "DELETE" });
      if (!res.ok) {
        toastErr(((await res.json()) as { error?: string }).error ?? "unlink failed");
        return;
      }
      toastOk("Host unlinked locally (unlink at the portal Devices page too)");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!st) return <Skeleton lines={4} />;

  return (
    <section aria-label="Portal" className="flex flex-col gap-4">
      <p className="text-caption text-dim">
        Link this Yuika instance to your Yuika Portal account, then control it from another
        device (phone, second browser). Keys stay on this host; traffic is end-to-end
        encrypted through the relay.
      </p>

      {st.webDevice && !st.linked && (
        <p className="text-caption text-dim">
          Web session auto-linked by portal sign-in: <span className="font-mono">{st.webDevice.deviceId}</span>
        </p>
      )}

      {st.linked ? (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-body font-semibold text-primary">
                Linked host
              </p>
              <p className="font-mono text-caption text-dim">{st.deviceId}</p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption ${
                st.relayState === "authed"
                  ? "border-emerald-500/40 text-emerald-400"
                  : "border-amber-500/40 text-amber-400"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${st.relayState === "authed" ? "bg-emerald-400" : "bg-amber-400"}`}
                aria-hidden
              />
              relay {st.relayState === "authed" ? "connected" : st.relayState}
            </span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-caption text-dim">
            <dt>Account</dt>
            <dd className="font-mono">{st.accountId}</dd>
            <dt>Relay</dt>
            <dd className="truncate font-mono">{st.relayUrl}</dd>
            <dt>Remote devices</dt>
            <dd>
              {st.remotes.length === 0 ? (
                "none connected"
              ) : (
                <span className="text-emerald-400">
                  {st.remotes.length} connected: {st.remotes.map((r) => r.name).join(", ")}
                </span>
              )}
            </dd>
            <dt>Web session</dt>
            <dd>
              {st.webDevice ? (
                <span className="text-emerald-400">auto-linked · {st.webDevice.deviceId}</span>
              ) : (
                "not linked — sign in via Yuika Portal to auto-link this browser"
              )}
            </dd>
          </dl>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => void unlink()} disabled={busy}>
              Unlink this host
            </Button>
          </div>
          <p className="text-caption text-dim">
            Unlinking here removes local credentials only — also unlink the device slot at the
            portal Devices page before pairing a replacement.
          </p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3 p-4">
          <ol className="flex flex-col gap-1 text-caption text-dim">
            <li>1. Register or sign in at your Yuika Portal account.</li>
            <li>2. Open Devices, add a pairing token — choose the <span className="text-primary">Desktop</span> kind (this app is a host).</li>
            <li>3. Paste the token below (valid for 2 minutes, single use).</li>
          </ol>
          <p className="text-caption text-faint">
            Web tokens are not for this input — they pair a remote browser at the{" "}
            <span className="font-mono">/dev/remote</span> page.
          </p>
          <Field label="Portal URL">
            <TextInput value={portalUrl} onChange={(e) => setPortalUrl(e.target.value)} spellCheck={false} />
          </Field>
          <Field label="Host name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
          </Field>
          <Field label="Pairing token" hint="from the portal Devices page (QR copy-paste)">
            <TextInput value={token} onChange={(e) => setToken(e.target.value)} placeholder="43-character token" spellCheck={false} />
          </Field>
          <Button onClick={() => void pair()} disabled={busy || token.trim().length < 20}>
            {busy ? "Pairing…" : "Pair this host"}
          </Button>
        </Card>
      )}
    </section>
  );
}
