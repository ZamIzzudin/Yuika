"use client";
// P1-INF-1: AuthGate — gerbang login di depan workspace. Selama server belum
// punya user terdaftar (mode lokal) children langsung dirender; setelah itu
// wajib login/register. Token disimpan di localStorage (authFetch memakai).
import { useEffect, useState } from "react";
import { Key, SignIn, UserPlus } from "@phosphor-icons/react";
import type { AuthStatusT } from "@yuika/contracts";
import { apiUrl, authFetch, clearAuthToken, setAuthToken } from "@/lib/api";
import { Button, Field, TextInput } from "./ui";
import { toastErr } from "./ui/toast";
import { OrinPortrait } from "./OrinPortrait";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatusT | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  /** Mode lokal: user membuka form register via "Set up account" (bisa dibatalkan). */
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await authFetch(apiUrl("/api/auth/me"));
        const s = (await r.json()) as AuthStatusT;
        if (alive) setStatus(s);
      } catch {
        if (alive) setStatus({ user: null, authRequired: false }); // API mati → biarkan app jalan (errornya muncul di data fetch)
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = await authFetch(apiUrl(`/api/auth/${mode === "login" ? "login" : "register"}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await r.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!r.ok || !body.token) throw new Error(body.error ?? "authentication failed");
      setAuthToken(body.token);
      setStatus({ user: { id: "", email }, authRequired: true });
      setPassword("");
      setSetupOpen(false);
    } catch (err) {
      toastErr(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    clearAuthToken();
    await authFetch(apiUrl("/api/auth/logout"), { method: "POST" }).catch(() => undefined);
    setStatus({ user: null, authRequired: true });
  }

  // Server belum menjawab → jangan kedip-kedip (render kosong dulu).
  if (status === null) return <div className="h-dvh w-full bg-canvas" />;

  // Mode lokal: form register dibuka manual dari tombol "Set up account".
  // Setelah user pertama ada, gerbang aktif permanen (server sudah menutup mode lokal).
  const gate = setupOpen || (status.authRequired && !status.user);

  // Mode lokal (belum ada user) / sudah valid → lewat.
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
          // Mode lokal (belum ada user): jalan masuk ke akun pertama — opsional,
          // bisa dibiarkan terbuka untuk pemakaian solo/self-host.
          <button
            onClick={() => {
              setMode("register");
              setSetupOpen(true);
            }}
            aria-label="Set up account"
            title="Create the first account — enables sign-in for this server"
            className="fixed right-3 bottom-3 z-40 flex cursor-pointer items-center gap-1.5 rounded-pill border border-line bg-surface/80 px-3 py-1.5 text-caption text-dim shadow-[0_10px_30px_-18px_rgb(0_0_0/.5)] backdrop-blur-md transition-colors hover:text-primary"
          >
            <UserPlus size={12} aria-hidden /> Set up account
          </button>
        )}
      </>
    );
  }

  // Gerbang login.
  return (
    <main className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-canvas px-4">
      {/* oval berlapis ala CharacterStage (identitas visual konsisten) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 max-[1099px]:hidden">
        <div className="absolute top-[44%] left-1/2 h-[560px] max-h-[92vh] w-[92vw] max-w-[1280px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-line/70" />
        <div className="absolute top-[44%] left-1/2 h-[640px] max-h-[96vh] w-[96vw] max-w-[1400px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-dashed border-line/50" />
        <div className="absolute top-[44%] left-1/2 h-[390px] w-[64vw] max-w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-line/80" />
        <div className="absolute top-[44%] left-1/2 h-[460px] w-[76vw] max-w-[1040px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-line/60" />
        <div className="absolute top-[44%] left-1/2 h-[270px] w-[44vw] max-w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-line" />
        <div className="absolute top-[44%] left-1/2 h-[320px] w-[54vw] max-w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-line/80" />
      </div>

      <form
        onSubmit={submit}
        aria-label="Sign in to Yuika"
        className="relative z-10 flex w-full max-w-[360px] flex-col gap-4 rounded-lg2 border border-line bg-surface p-6 shadow-[0_30px_80px_-40px_rgb(0_0_0/.6)]"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <OrinPortrait state="idle" size={72} />
          <h1 className="text-title font-semibold text-primary">Yuika</h1>
          <p className="text-caption text-muted">Sign in to your agent studio</p>
        </div>

        <Field label="Email">
          <TextInput
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Password">
          <TextInput
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>

        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? (
            "Signing in…"
          ) : mode === "login" ? (
            <>
              <SignIn size={13} aria-hidden /> Sign in
            </>
          ) : (
            <>
              <UserPlus size={13} aria-hidden /> Create account
            </>
          )}
        </Button>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="cursor-pointer text-center text-caption text-dim underline-offset-2 transition-colors hover:text-primary hover:underline"
        >
          {mode === "login"
            ? "First time here? Create an account"
            : "Already have an account? Sign in"}
        </button>

        {/* Dibuka dari tombol "Set up account" di mode lokal — boleh dibatalkan. */}
        {setupOpen && !status.authRequired && (
          <button
            type="button"
            onClick={() => setSetupOpen(false)}
            className="cursor-pointer text-center text-caption text-dim underline-offset-2 transition-colors hover:text-primary hover:underline"
          >
            Cancel — keep this server open (local mode)
          </button>
        )}
      </form>
    </main>
  );
}
