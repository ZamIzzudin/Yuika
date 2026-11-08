"use client";

// ++ (user 2026-11): floating shared screen, melayang di atas semua
// tab. Perubahan dari versi pertama:
//   - header drag TIDAK lagi menelan klik tombol (pointer-capture hanya mulai
//     di background header, bukan di atas button);
//   - shrink/grow button DIHAPUS, resize via tarik tepi kanan / bawah / pojok;
//   - close = MENGHENTIKAN sesi screen (persona buka lagi → sesi baru,
//     tidak menumpuk); collapse hanya menutup window visual.
import { useRef, useState } from "react";
import { apiUrl, authFetch } from "@/lib/api";
import { Button } from "@/components/ui";
import { useScreenStream } from "./useScreenStream";

const MIN_W = 280;
const MIN_H = 180;
const DEF_W = 420;

export function ScreenPip({
  projectId,
  personaId,
  personaName,
  onClose,
}: {
  projectId: string;
  personaId: string;
  personaName: string;
  /** Dipanggil setelah sesi dihentikan (close = stop browser). */
  onClose: () => void;
}) {
  const { state, frame, dim, err, takeBusy, input, lease } = useScreenStream(
    projectId,
    personaId,
  );
  const [collapsed, setCollapsed] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const resize = useRef<{
    mode: "e" | "s" | "se";
    sx: number;
    sy: number;
    w: number;
    h: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const owner = state?.leaseOwner ?? null;
  const iControl = owner === "user";
  const ownerName =
    owner === null ? "free" : owner === "user" ? "you" : personaName;

  const w = size?.w ?? DEF_W;
  const h =
    size?.h ??
    (dim
      ? Math.round(DEF_W * (dim.h / dim.w))
      : Math.round(DEF_W * (800 / 1280)));

  // ── drag window (header background saja, tombol tetap bisa diklik) ──────
  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).closest("button")) return; // FIX: jangan tangkap pointer di atas tombol
    const root = rootRef.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    if (!pos) setPos({ x: r.left, y: r.top });
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return;
    const x = Math.min(
      Math.max(e.clientX - drag.current.dx, 8),
      window.innerWidth - 120,
    );
    const y = Math.min(
      Math.max(e.clientY - drag.current.dy, 8),
      window.innerHeight - 60,
    );
    setPos({ x, y });
  };
  const onHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // ── resize via tepi (kanan / bawah / pojok kanan-bawah) ──────────────────
  const onEdgePointerDown =
    (mode: "e" | "s" | "se") =>
    (e: React.PointerEvent<HTMLDivElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      const root = rootRef.current;
      if (!root) return;
      const r = root.getBoundingClientRect();
      if (!pos) setPos({ x: r.left, y: r.top }); // bekukan jangkar sebelum resize
      resize.current = {
        mode,
        sx: e.clientX,
        sy: e.clientY,
        w: r.width,
        h: r.height,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    };
  const onEdgePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const rz = resize.current;
    if (!rz) return;
    const root = rootRef.current;
    if (!root) return;
    const vw =
      window.innerWidth - (pos?.x ?? root.getBoundingClientRect().left) - 8;
    const vh =
      window.innerHeight - (pos?.y ?? root.getBoundingClientRect().top) - 8;
    setSize({
      w:
        rz.mode === "s"
          ? rz.w
          : Math.min(
              Math.max(rz.w + e.clientX - rz.sx, MIN_W),
              Math.max(vw, MIN_W),
            ),
      h:
        rz.mode === "e"
          ? rz.h
          : Math.min(
              Math.max(rz.h + e.clientY - rz.sy, MIN_H),
              Math.max(vh, MIN_H),
            ),
    });
  };
  const onEdgePointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    resize.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const edgeCls = "absolute z-10 touch-none";
  const edgeE = `${edgeCls} top-2 right-0 bottom-4 w-1.5 cursor-ew-resize`;
  const edgeS = `${edgeCls} left-2 right-4 bottom-0 h-1.5 cursor-ns-resize`;
  const edgeSE = `${edgeCls} right-0 bottom-0 h-4 w-4 cursor-nwse-resize`;

  // ── close = STOP sesi (bukan sekadar sembunyikan) ────────────────────────
  const stopAndClose = (): void => {
    void (async () => {
      try {
        await authFetch(
          apiUrl(`/api/projects/${projectId}/screens/${personaId}`),
          { method: "DELETE" },
        );
      } catch {
        /* best-effort, tetap tutup window */
      }
      onClose();
    })();
  };

  // ── relay input (scale-aware) ─────────────────────────────────────────────
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
        Enter: "enter",
        Tab: "tab",
        Escape: "escape",
        Backspace: "backspace",
        Delete: "delete",
        ArrowUp: "arrowup",
        ArrowDown: "arrowdown",
        ArrowLeft: "arrowleft",
        ArrowRight: "arrowright",
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
      {!collapsed && (
        <>
          <div
            onPointerDown={onEdgePointerDown("e")}
            onPointerMove={onEdgePointerMove}
            onPointerUp={onEdgePointerUp}
            className={edgeE}
            role="separator"
            aria-label="Resize width"
          />
          <div
            onPointerDown={onEdgePointerDown("s")}
            onPointerMove={onEdgePointerMove}
            onPointerUp={onEdgePointerUp}
            className={edgeS}
            role="separator"
            aria-label="Resize height"
          />
          <div
            onPointerDown={onEdgePointerDown("se")}
            onPointerMove={onEdgePointerMove}
            onPointerUp={onEdgePointerUp}
            className={edgeSE}
            role="separator"
            aria-label="Resize"
          />
        </>
      )}

      {/* header = drag handle (background saja) */}
      <div
        className="flex flex-none cursor-grab touch-none select-none items-center gap-2 border-b border-line bg-inset px-2.5 py-1.5 active:cursor-grabbing"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
      >
        <span className="min-w-0 flex-1 truncate text-caption font-medium text-primary">
          {personaName}
        </span>
        <span
          className={`flex-none rounded-pill px-2 py-0.5 text-[11px] font-semibold uppercase ${
            iControl
              ? "bg-accent/20 text-accent"
              : owner
                ? "bg-emph/10 text-secondary"
                : "bg-emph/10 text-muted"
          }`}
        >
          {iControl ? "you" : owner ? ownerName : "free"}
        </span>
        <button
          type="button"
          className="rounded-pill px-1.5 text-caption text-muted hover:text-primary"
          title={collapsed ? "Expand window" : "Collapse"}
          aria-label={collapsed ? "Expand window" : "Collapse"}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <button
          type="button"
          className="rounded-pill px-1.5 text-caption text-muted hover:text-rose-400"
          title="Stop this browser session"
          aria-label="Stop this browser session"
          onClick={stopAndClose}
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
            style={{
              height: h,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
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
                {state?.status === "starting" || !state
                  ? "Starting browser…"
                  : "Waiting for first frame…"}
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
            {err && (
              <span
                className="min-w-0 flex-1 truncate text-[11px] text-rose-400"
                role="alert"
              >
                {err}
              </span>
            )}
            {!err && state?.url && (
              <span
                className="min-w-0 flex-1 truncate text-right text-[11px] text-dim"
                title={state.url}
              >
                {state.url}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
