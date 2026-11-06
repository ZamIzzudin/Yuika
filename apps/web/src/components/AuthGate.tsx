"use client";
// AuthGate — gerbang sign-in di depan workspace. Portal-only (CP-3):
// akun & signup hidup di yuika-portal; Yuika tidak punya form kredensial.
// Selama server belum punya user (mode terbuka) children langsung dirender;
// user pertama lahir dari portal sign-in pertama, setelah itu wajib login.
// Token disimpan di localStorage (authFetch memakai).
import { useEffect, useState } from "react";
import { Globe, Key, SignIn } from "@phosphor-icons/react";
import type { AuthStatusT } from "@yuika/contracts";
import { apiUrl, authFetch, clearAuthToken } from "@/lib/api";
import { OrinPortrait } from "./OrinPortrait";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatusT | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await authFetch(apiUrl("/api/auth/me"));
        const s = (await r.json()) as AuthStatusT;
        if (alive) setStatus(s);
      } catch {
        if (alive)
          setStatus({
            user: null,
            authRequired: false,
            portalUrl: "http://localhost:3100",
          }); // API mati → biarkan app jalan (errornya muncul di data fetch)
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function logout() {
    clearAuthToken();
    await authFetch(apiUrl("/api/auth/logout"), { method: "POST" }).catch(
      () => undefined,
    );
    setStatus((s) => (s ? { ...s, user: null, authRequired: true } : s));
  }

  /** CP-3 SSO: minta URL authorize lalu arahkan browser ke portal
   *  (user tinggal Accept di portal — tanpa salin token). */
  async function startPortal() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await authFetch(apiUrl("/api/auth/portal/start"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          redirectUri: `${window.location.origin}/auth/callback`,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as {
        authorizeUrl?: string;
        error?: string;
      };
      if (!r.ok || !body.authorizeUrl)
        throw new Error(body.error ?? "portal sign-in unavailable");
      window.location.href = body.authorizeUrl;
    } catch (err) {
      const { toastErr } = await import("./ui/toast");
      toastErr(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  // Server belum menjawab → jangan kedip-kedip (render kosong dulu).
  if (status === null) return <div className="h-dvh w-full bg-canvas" />;

  const gate = status.authRequired && !status.user;

  // Mode terbuka (belum ada user) / sudah valid → lepas children.
  if (!gate) {
    return (
      <>
        {children}
        {status.user ? (
          <button
            onClick={() => void logout()}
            aria-label={`Sign out (${status.user?.email})`}
            title="Sign out"
            className="fixed right-3 bottom-3 z-40 flex cursor-pointer items-center gap-1.5 rounded-pill border border-line bg-surface/80 px-3 py-1.5 text-caption text-dim shadow-[0_10px_30px_-18px_rgb(0_0_0/.5)] backdrop-blur-md transition-colors hover:text-primary"
          >
            <Key size={12} aria-hidden /> {status.user.email}
          </button>
        ) : (
          // Mode terbuka: bisa dipakai langsung tanpa login; portal sign-in
          // opsional (user pertama menutup mode terbuka untuk orang lain).
          <button
            onClick={() => void startPortal()}
            disabled={busy}
            aria-label="Sign in"
            title="Sign in via your Yuika Portal account"
            className="fixed right-3 bottom-3 z-40 flex cursor-pointer items-center gap-1.5 rounded-pill border border-line bg-surface/80 px-3 py-1.5 text-caption text-dim shadow-[0_10px_30px_-18px_rgb(0_0_0/.5)] backdrop-blur-md transition-colors hover:text-primary"
          >
            {busy ? (
              <SignIn size={12} aria-hidden />
            ) : (
              <Globe size={12} aria-hidden />
            )}{" "}
            Sign in
          </button>
        )}
      </>
    );
  }

  // Gerbang sign-in: portal-only.
  return (
    <main className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-canvas px-4">
      {/* oval berlapis ala CharacterStage (identitas visual konsisten) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 max-[1099px]:hidden"
      >
        <div className="absolute top-[44%] left-1/2 h-[560px] max-h-[92vh] w-[92vw] max-w-[1280px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-line/70" />
        <div className="absolute top-[44%] left-1/2 h-[640px] max-h-[96vh] w-[96vw] max-w-[1400px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-dashed border-line/50" />
        <div className="absolute top-[44%] left-1/2 h-[390px] w-[64vw] max-w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-line/80" />
        <div className="absolute top-[44%] left-1/2 h-[460px] w-[76vw] max-w-[1040px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-line/60" />
        <div className="absolute top-[44%] left-1/2 h-[270px] w-[44vw] max-w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-line" />
        <div className="absolute top-[44%] left-1/2 h-[320px] w-[54vw] max-w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-line/80" />
      </div>

      <section
        aria-label="Sign in to Yuika"
        className="relative z-10 flex w-full max-w-[360px] flex-col gap-4 rounded-lg2 border border-line bg-surface p-6 shadow-[0_30px_80px_-40px_rgb(0_0_0/.6)]"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <OrinPortrait state="idle" size={150} />
          <h1 className="text-title font-semibold text-primary">Yuika</h1>
          <p className="text-caption text-muted">
            Welcome to your agentic persona studio
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void startPortal()}
          className="inline-flex h-9 cursor-pointer select-none items-center justify-center gap-1.5 rounded-md2 border border-accent bg-accent px-4 text-body font-medium text-white transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:border-accent-hover hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-40"
        >
          <Globe size={13} aria-hidden />{" "}
          {busy ? "Redirecting…" : "Sign in with Yuika Portal"}
        </button>
        <p className="text-center text-caption text-faint">
          Don&rsquo;t have an account?{" "}
          <a
            href={status.portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-dim underline-offset-2 transition-colors hover:text-primary hover:underline"
          >
            Sign Up to Yuika Portal
          </a>
        </p>
      </section>
    </main>
  );
}
