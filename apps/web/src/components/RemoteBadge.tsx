"use client";
// P1-PRT-3, badge "N remote connected" (poll ringan /api/portal/status).
// compact = varian titik hijau utk sidebar kolaps.
import { useEffect, useState } from "react";
import { apiUrl, authFetch } from "@/lib/api";

interface RemoteBadgeState {
  linked: boolean;
  relayState: string;
  remotes: Array<{ deviceId: string; kind: string; name: string }>;
}

export function RemoteBadge({ compact = false }: { compact?: boolean }) {
  const [st, setSt] = useState<RemoteBadgeState | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await authFetch(apiUrl("/api/portal/status"));
        if (res.ok && alive) setSt((await res.json()) as RemoteBadgeState);
      } catch {
        /* offline, coba lagi */
      }
    };
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!st?.linked || st.remotes.length === 0) return null;
  const label = `${st.remotes.length} remote${st.remotes.length > 1 ? "s" : ""} connected`;

  if (compact) {
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        className="relative flex size-9 cursor-pointer items-center justify-center rounded-md2 text-emerald-400"
        onClick={() =>
          window.dispatchEvent(new CustomEvent("yui:open-settings"))
        }
      >
        <span className="size-2.5 rounded-full bg-emerald-400" aria-hidden />
        <span className="absolute -top-0.5 right-1 rounded-full bg-emerald-500/20 px-1 text-[10px] font-semibold">
          {st.remotes.length}
        </span>
      </button>
    );
  }

  return (
    <span
      title={label}
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 px-2.5 py-1 text-caption text-emerald-400"
    >
      <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
      {label}
    </span>
  );
}
