"use client";

// Batch 14a (P2-SCR-1/2/3): mode Live tab Browser — stream JPEG screencast
// sesi Chromium shared persona, input relay bila user pegang lease, tombol
// Take control / Release (fence), chip pengendali. Frame via SSE khusus
// (bukan event bus sesi — bandwidth); input via authFetch.
import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl, authFetch, authTokenQuery } from "@/lib/api";
import { Button } from "@/components/ui";

export interface ScreenInfo {
  key: string;
  projectId: string;
  personaId: string;
  status: "starting" | "running" | "stopped" | "failed";
  url: string;
  title: string;
  leaseOwner: string | null;
  viewers: number;
}

export function ScreenLive({
  projectId,
  personas,
}: {
  projectId: string;
  /** id persona yang tersedia utk tombol "+ Open screen" (dari roster project). */
  personas: { id: string; name: string }[];
}) {
  const [sessions, setSessions] = useState<ScreenInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<ScreenInfo | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [starting, setStarting] = useState(false);
  const [takeBusy, setTakeBusy] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const sel = sessions.find((s) => s.key === selected) ?? null;
  const personaId = sel?.personaId;

  // refresh daftar ringan (poll 5 dtk — sesi bisa datang dari agent)
  const onSelect = setSelected;
  const reload = useCallback(() => {
    void (async () => {
      try {
        const r = await authFetch(apiUrl(`/api/projects/${projectId}/screens`));
        if (r.ok) {
          const b = (await r.json()) as { screens: ScreenInfo[] };
          const live = b.screens.filter((s) => s.status !== "stopped");
          setSessions(live);
          if (live.length && !live.some((s) => s.key === selected)) onSelect(live[0]!.key);
          if (!live.length && selected) onSelect(null);
        }
      } catch {
        /* best-effort */
      }
    })();
  }, [projectId, selected, onSelect]);
  useEffect(() => {
    reload();
    const t = setInterval(reload, 5_000);
    return () => clearInterval(t);
  }, [reload]);

  // SSE stream frame+state utk sesi terpilih
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

  const openSession = useCallback(
    async (pid: string) => {
      setStarting(true);
      setErr(null);
      try {
        const r = await authFetch(apiUrl(`/api/projects/${projectId}/screens`), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ personaId: pid }),
        });
        const b = (await r.json().catch(() => ({}))) as { key?: string; error?: string };
        if (!r.ok || !b.key) throw new Error(b.error ?? `HTTP ${r.status}`);
        onSelect(b.key);
        reload();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setStarting(false);
      }
    },
    [projectId, onSelect, reload],
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

  const owner = state?.leaseOwner ?? null;
  const iControl = owner === "user";
  const ownerName =
    owner === null ? "free" : owner === "user" ? "you" : personas.find((p) => p.id === owner)?.name ?? owner;

  // ── overlay input: klik → koordinat frame asli (scale-aware) ─────────────
  const onCanvasClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!iControl || !dim || !canvasRef.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * dim.w;
    const y = ((e.clientY - r.top) / r.height) * dim.h;
    void input({ kind: "click", x: Math.round(x), y: Math.round(y) });
  };
  const onCanvasKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!iControl) return;
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      void input({ kind: "type", text: e.key });
    } else {
      const map: Record<string, string> = {
        Enter: "enter", Tab: "tab", Escape: "escape", Backspace: "backspace", Delete: "delete",
        ArrowUp: "arrowup", ArrowDown: "arrowdown", ArrowLeft: "arrowleft", ArrowRight: "arrowright",
      };
      const k = map[e.key];
      if (k) {
        e.preventDefault();
        void input({ kind: "press", key: k });
      }
    }
  };
  const onCanvasWheel = (e: React.WheelEvent<HTMLDivElement>): void => {
    if (!iControl) return;
    e.preventDefault();
    void input({ kind: "scroll", deltaY: Math.round(e.deltaY) });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* bar atas: pilih sesi + buka baru */}
      <div className="flex flex-none flex-wrap items-center gap-2">
        {sessions.map((s) => (
          <button
            key={s.key}
            onClick={() => onSelect(s.key)}
            className={`rounded-pill border px-3 py-1.5 text-caption transition-colors ${
              s.key === selected ? "border-accent/60 bg-accent/10 text-accent" : "border-line bg-surface text-muted hover:text-primary"
            }`}
          >
            {personas.find((p) => p.id === s.personaId)?.name ?? s.personaId}
            {s.leaseOwner ? (s.leaseOwner === "user" ? " · you" : " · agent") : ""}
          </button>
        ))}
        <label className="flex items-center gap-1.5">
          <select
            className="rounded-pill border border-line bg-surface px-2 py-1.5 text-caption text-primary"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) void openSession(e.target.value);
              e.currentTarget.value = "";
            }}
            disabled={starting}
            aria-label="Open a shared screen for a persona"
          >
            <option value="">{starting ? "Starting…" : "+ Open screen…"}</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>

      {err && (
        <p className="flex-none rounded-lg2 border border-line bg-surface px-3 py-2 text-caption text-rose-400" role="alert">{err}</p>
      )}

      {!sel ? (
        <div className="flex flex-1 items-center justify-center rounded-lg2 border border-line bg-surface p-6 text-center text-caption text-muted">
          No live screens yet. Open one above, or let an agent call browser_open —
          the page it works on appears here in real time.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {/* bar kontrol: URL + lease */}
          <div className="flex flex-none flex-wrap items-center gap-2">
            <span className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold uppercase ${iControl ? "bg-accent/20 text-accent" : owner ? "bg-emph/10 text-secondary" : "bg-emph/10 text-muted"}`}>
              control: {ownerName}
            </span>
            <form
              className="flex min-w-0 flex-1 items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (urlInput.trim()) void input({ kind: "navigate", url: urlInput.trim() });
              }}
            >
              <input
                className="min-w-0 flex-1 rounded-pill border border-line bg-surface px-3 py-1.5 text-caption text-primary focus:border-accent focus:outline-none"
                placeholder={state?.url || "https://…"}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                aria-label="Navigate URL"
                inputMode="url"
              />
              <Button size="sm" type="submit" disabled={!urlInput.trim()}>Go</Button>
            </form>
            <Button size="sm" variant={iControl ? "primary" : "secondary"} disabled={takeBusy} onClick={() => void lease(iControl ? "yield" : "take")}>
              {iControl ? "Release" : "Take control"}
            </Button>
          </div>

          {/* kanvas frame */}
          <div
            ref={canvasRef}
            tabIndex={iControl ? 0 : -1}
            onClick={onCanvasClick}
            onKeyDown={onCanvasKey}
            onWheel={onCanvasWheel}
            className={`relative min-h-0 flex-1 overflow-hidden rounded-lg2 border border-line bg-black/80 outline-none ${
              iControl ? "cursor-pointer" : "cursor-not-allowed"
            }`}
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            role="img"
            aria-label={`Shared screen: ${state?.title || state?.url || ""}`}
          >
            {frame ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/jpeg;base64,${frame}`}
                alt=""
                className="max-h-full max-w-full object-contain"
                draggable={false}
              />
            ) : (
              <span className="p-6 text-caption text-muted">
                {state?.status === "starting" || !state ? "Starting browser…" : "Waiting for first frame…"}
              </span>
            )}
            {!iControl && owner && (
              <span className="pointer-events-none absolute inset-0 flex items-start justify-end p-2">
                <span className="rounded-pill bg-black/60 px-2 py-1 text-[11px] text-white/80">
                  {ownerName} is driving — Take control to interact
                </span>
              </span>
            )}
          </div>
          <p className="flex-none text-[11px] text-dim">
            Shared with {sel.personaId} — clicks/typing here go to the same browser the agent uses.
            {state?.viewers ? ` ${state.viewers} viewer${state.viewers > 1 ? "s" : ""}.` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
