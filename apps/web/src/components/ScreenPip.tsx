"use client";

// Batch 14a follow-up (SCR-3): floating shared screen — melayang di ATAS
// semua tab (dirender page-level, bukan di dalam tab) supaya user bisa
// menonton persona bekerja sambil mengetik di chat, dan ambil alih /
// kembalikan kendali tanpa pindah tab. Bukan PiP browser-native — panel
// draggable dalam halaman.
import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { useScreenStream } from "./useScreenStream";

const SIZES = { sm: 340, lg: 520 } as const;

export function ScreenPip({
  projectId,
  personaId,
  personaName,
  onClose,
  onExpand,
}: {
  projectId: string;
  personaId: string;
  personaName: string;
  onClose: () => void;
  /** Buka tab Browser (mode Live) utk tampilan penuh. */
  onExpand: () => void;
}) {
  const { state, frame, dim, err, takeBusy, input, lease } = useScreenStream(projectId, personaId);
  const [big, setBig] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // pos null = jangkar kanan-bawah; setelah di-drag jadi koordinat eksplisit
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const owner = state?.leaseOwner ?? null;
  const iControl = owner === "user";
  const ownerName = owner === null ? "free" : owner === "user" ? "you" : personaName;

  const w = SIZES[big ? "lg" : "sm"];
  const aspect = dim ? dim.h / dim.w : 800 / 1280;

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    const root = rootRef.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    if (!pos) setPos({ x: r.left, y: r.top }); // bekukan posisi jangkar → koordinat
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return;
    const x = Math.min(Math.max(e.clientX - drag.current.dx, 8), window.innerWidth - w - 8);
    const y = Math.min(Math.max(e.clientY - drag.current.dy, 8), window.innerHeight - 60);
    setPos({ x, y });
  };
  const onHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

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
    <div
      ref={rootRef}
      className="fixed z-[70] flex flex-col overflow-hidden rounded-lg2 border border-line-strong bg-surface shadow-2xl shadow-black/40"
      style={
        pos
          ? { left: pos.x, top: pos.y, width: w }
          : { right: "1rem", bottom: "1rem", width: w }
      }
      data-testid="screen-pip"
      role="complementary"
      aria-label={`Live screen: ${personaName}`}
    >
      {/* header = drag handle */}
      <div
        className="flex flex-none cursor-grab touch-none select-none items-center gap-2 border-b border-line bg-inset px-2.5 py-1.5 active:cursor-grabbing"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
      >
        <span className="min-w-0 flex-1 truncate text-caption font-medium text-primary">{personaName}</span>
        <span
          className={`flex-none rounded-pill px-2 py-0.5 text-[11px] font-semibold uppercase ${
            iControl ? "bg-accent/20 text-accent" : owner ? "bg-emph/10 text-secondary" : "bg-emph/10 text-muted"
          }`}
        >
          {iControl ? "you" : owner ? ownerName : "free"}
        </span>
        <button
          className="rounded-pill px-1.5 text-caption text-muted hover:text-primary"
          title={collapsed ? "Expand window" : "Collapse"}
          aria-label={collapsed ? "Expand window" : "Collapse"}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <button
          className="rounded-pill px-1.5 text-caption text-muted hover:text-primary"
          title="Grow / shrink"
          aria-label="Grow or shrink"
          onClick={() => setBig((b) => !b)}
        >
          {big ? "▭" : "▯"}
        </button>
        <button
          className="rounded-pill px-1.5 text-caption text-muted hover:text-primary"
          title="Open in Browser tab"
          aria-label="Open in Browser tab"
          onClick={onExpand}
        >
          ⧉
        </button>
        <button
          className="rounded-pill px-1.5 text-caption text-muted hover:text-rose-400"
          title="Close"
          aria-label="Close floating screen"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {!collapsed && (
        <>
          <div
            ref={canvasRef}
            tabIndex={iControl ? 0 : -1}
            onClick={onCanvasClick}
            onKeyDown={onCanvasKey}
            onWheel={onCanvasWheel}
            className={`relative flex-none overflow-hidden bg-black/85 outline-none ${iControl ? "cursor-pointer" : "cursor-not-allowed"}`}
            style={{ height: Math.round(w * aspect), display: "flex", alignItems: "center", justifyContent: "center" }}
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
              <span className="p-4 text-[11px] text-muted">
                {state?.status === "starting" || !state ? "Starting browser…" : "Waiting for first frame…"}
              </span>
            )}
            {!iControl && owner && (
              <span className="pointer-events-none absolute inset-0 flex items-start justify-end p-1.5">
                <span className="rounded-pill bg-black/60 px-2 py-0.5 text-[11px] text-white/80">
                  {ownerName} is driving
                </span>
              </span>
            )}
          </div>

          <div className="flex flex-none items-center gap-1.5 border-t border-line px-2.5 py-1.5">
            <Button
              size="sm"
              variant={iControl ? "primary" : "secondary"}
              disabled={takeBusy}
              onClick={() => void lease(iControl ? "yield" : "take")}
            >
              {iControl ? "Release" : "Take control"}
            </Button>
            {err && <span className="min-w-0 flex-1 truncate text-[11px] text-rose-400" role="alert">{err}</span>}
            {!err && state?.url && (
              <span className="min-w-0 flex-1 truncate text-right text-[11px] text-dim" title={state.url}>
                {state.url}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
