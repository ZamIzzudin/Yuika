"use client";

// Batch 14a follow-up: hook SSE screen share (frame+state) + relay input +
// lease — dipakai ScreenLive (tab Browser) DAN ScreenPip (floating di atas
// chat). Satu sumber logika supaya dua permukaan tidak berbeda perilaku.
import { useCallback, useEffect, useState } from "react";
import { apiUrl, authFetch, authTokenQuery } from "@/lib/api";
import type { ScreenInfo } from "./ScreenLive";

export interface ScreenStream {
  state: ScreenInfo | null;
  frame: string | null;
  dim: { w: number; h: number } | null;
  err: string | null;
  takeBusy: boolean;
  /** Kirim input (click/type/press/scroll/navigate) — false bila ditolak. */
  input: (body: Record<string, unknown>) => Promise<boolean>;
  /** Ambil / lepas lease user (fence). */
  lease: (act: "take" | "yield") => Promise<void>;
}

export function useScreenStream(projectId: string, personaId: string | null | undefined): ScreenStream {
  const [state, setState] = useState<ScreenInfo | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [takeBusy, setTakeBusy] = useState(false);

  useEffect(() => {
    if (!personaId) {
      setState(null);
      setFrame(null);
      return;
    }
    setErr(null);
    let es: EventSource | null = null;
    let stop = false;
    let retry = 0;
    const connect = (): void => {
      if (stop) return;
      es = new EventSource(apiUrl(`/api/projects/${projectId}/screens/${personaId}/stream?1=1${authTokenQuery()}`));
      es.addEventListener("state", (e) => {
        try { setState(JSON.parse((e as MessageEvent).data) as ScreenInfo); } catch { /* parse */ }
      });
      es.addEventListener("frame", (e) => {
        try {
          const f = JSON.parse((e as MessageEvent).data) as { data: string; width: number; height: number };
          setFrame(f.data);
          setDim({ w: f.width, h: f.height });
        } catch { /* parse */ }
      });
      es.onerror = () => {
        es?.close();
        if (!stop && retry++ < 30) setTimeout(connect, Math.min(1000 * retry, 5000));
      };
    };
    connect();
    return () => {
      stop = true;
      es?.close();
    };
  }, [projectId, personaId]);

  const input = useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      if (!personaId) return false;
      try {
        const r = await authFetch(apiUrl(`/api/projects/${projectId}/screens/${personaId}/input`), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const b = (await r.json().catch(() => ({}))) as { error?: string };
          setErr(b.error ?? `HTTP ${r.status}`);
          return false;
        }
        setErr(null);
        return true;
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [projectId, personaId],
  );

  const lease = useCallback(
    async (act: "take" | "yield") => {
      if (!personaId) return;
      setTakeBusy(true);
      try {
        const r = await authFetch(apiUrl(`/api/projects/${projectId}/screens/${personaId}/${act}`), { method: "POST" });
        if (!r.ok) {
          const b = (await r.json().catch(() => ({}))) as { error?: string };
          setErr(b.error ?? `HTTP ${r.status}`);
        } else setErr(null);
      } finally {
        setTakeBusy(false);
      }
    },
    [projectId, personaId],
  );

  return { state, frame, dim, err, takeBusy, input, lease };
}
