"use client";
// CP-3 SSO, halaman callback portal: ?code&state → tukar jadi sesi Yuika.
// Portal mengarahkan ke sini setelah user menekan Accept; token sesi Yuika
// disimpan seperti login biasa (localStorage via lib/api) lalu kembali ke /.
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiUrl, authFetch, setAuthToken } from "@/lib/api";
import { OrinPortrait } from "@/components/OrinPortrait";

export default function PortalCallbackPage() {
  return (
    // Suspense WAJIB untuk useSearchParams() saat prerender/export statis
    // (Next.js: "missing-suspense-with-csr-bounce" → build gagal tanpa ini).
    <Suspense
      fallback={
        <main className="flex h-dvh w-full items-center justify-center bg-canvas">
          <p className="text-caption text-muted">
            Completing portal sign-in…
          </p>
        </main>
      }
    >
      <PortalCallback />
    </Suspense>
  );
}

function PortalCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false); // StrictMode double-invoke guard

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      setError("Missing code/state from portal, restart sign-in.");
      return;
    }
    void (async () => {
      try {
        const r = await authFetch(apiUrl("/api/auth/portal/complete"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, state }),
        });
        const body = (await r.json().catch(() => ({}))) as {
          token?: string;
          error?: string;
        };
        if (!r.ok || !body.token)
          throw new Error(body.error ?? "portal sign-in failed");
        setAuthToken(body.token);
        router.replace("/");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [params, router]);

  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center gap-4 bg-canvas px-4 text-center">
      <OrinPortrait state={error ? "error" : "idle"} size={72} />
      {error ? (
        <>
          <p className="text-body text-primary">Portal sign-in failed</p>
          <p className="max-w-[360px] text-caption text-muted">{error}</p>
          <a
            href="/"
            className="rounded-pill border border-line px-4 py-1.5 text-caption text-dim transition-colors hover:text-primary"
          >
            Back to sign in
          </a>
        </>
      ) : (
        <p className="text-caption text-muted">Completing portal sign-in…</p>
      )}
    </main>
  );
}
