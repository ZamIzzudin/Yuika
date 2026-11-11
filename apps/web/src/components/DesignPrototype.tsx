"use client";
// P3-PROTO: prototype player — renderer kedua atas file desain yang sama
// (canvas editor = renderer pertama). Edit di canvas → autosave → poll revn
// → prototype ikut berubah (Figma-like). Wiring on-click via shape.interaction.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Play, X } from "@phosphor-icons/react";
import { apiUrl, authFetch } from "@/lib/api";
import type { DesignFile, DesignPage, DesignShape } from "@yuika/core/design";
import { Button } from "./ui";

interface Props {
  fileId: string;
  onClose: () => void;
}

function screenFrames(page: DesignPage): DesignShape[] {
  const roots = page.roots.map((r) => page.shapes[r]).filter((s): s is DesignShape => Boolean(s) && !s!.hidden);
  const frames = roots.filter((s) => s.type === "frame");
  return frames.length > 0 ? frames : roots.length > 0 ? roots.slice(0, 1) : [];
}

function ShapeNode({
  shape,
  page,
  onNavigate,
}: {
  shape: DesignShape;
  page: DesignPage;
  onNavigate: (target: string) => void;
}): React.ReactElement | null {
  if (shape.hidden) return null;
  const fill = shape.fills[0];
  const clickable = Boolean(shape.interaction);
  const base: React.CSSProperties = {
    position: "absolute",
    left: shape.x,
    top: shape.y,
    width: shape.width,
    height: shape.height,
    background: shape.type === "text" ? undefined : fill?.color,
    opacity: shape.opacity ?? 1,
    borderRadius: shape.type === "circle" ? "50%" : shape.radius ? shape.radius : undefined,
    border: shape.stroke && shape.stroke.width > 0 ? `${shape.stroke.width}px solid ${shape.stroke.color}` : undefined,
  };
  if (shape.type === "text") {
    return (
      <div
        style={{
          ...base,
          color: shape.color,
          fontSize: shape.fontSize,
          fontWeight: shape.fontWeight ?? 400,
          lineHeight: shape.lineHeight ?? 1.35,
          textAlign: shape.align ?? "left",
          whiteSpace: "pre-wrap",
          overflow: "hidden",
          cursor: clickable ? "pointer" : undefined,
        }}
        className={clickable ? "transition hover:brightness-125 active:brightness-90" : undefined}
        onClick={clickable ? () => onNavigate(shape.interaction!.target) : undefined}
      >
        {shape.text}
      </div>
    );
  }
  const children = shape.type === "frame" ? shape.children : [];
  return (
    <div
      style={{ ...base, overflow: shape.type === "frame" ? "hidden" : undefined, cursor: clickable ? "pointer" : undefined }}
      className={clickable ? "transition hover:brightness-110 active:brightness-90" : undefined}
      onClick={
        clickable
          ? (e) => {
              e.stopPropagation();
              onNavigate(shape.interaction!.target);
            }
          : undefined
      }
    >
      {children.map((cid) => {
        const c = page.shapes[cid];
        return c ? <ShapeNode key={cid} shape={c} page={page} onNavigate={onNavigate} /> : null;
      })}
    </div>
  );
}

export function DesignPrototype({ fileId, onClose }: Props): React.ReactElement {
  const [file, setFile] = useState<DesignFile | null>(null);
  const [cur, setCur] = useState<{ pageId: string; frameId: string | null }>({ pageId: "", frameId: null });
  const [history, setHistory] = useState<Array<{ pageId: string; frameId: string | null }>>([]);
  const [scale, setScale] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  // load + poll revn (edit canvas/persona → prototype ikut, ~2.5 dtk)
  const load = useCallback(async () => {
    try {
      const r = await authFetch(apiUrl(`/api/design/files/${fileId}`));
      if (!r.ok) return;
      const j = (await r.json()) as { file: DesignFile };
      setFile((prev) => (prev && prev.revn === j.file.revn ? prev : j.file));
    } catch {
      /* host sibuk; coba lagi di tick berikutnya */
    }
  }, [fileId]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 2500);
    return () => clearInterval(t);
  }, [load]);

  const page = file?.pages.find((p) => p.id === cur.pageId) ?? file?.pages[0];
  // layar: pilih halaman pertama bila state kosong / referensi hilang
  useEffect(() => {
    if (!file || file.pages.length === 0) return;
    const pg = file.pages.find((p) => p.id === cur.pageId) ?? file.pages[0]!;
    const frameStillOk = cur.frameId ? Boolean(pg.shapes[cur.frameId]) : false;
    const wanted = screenFrames(pg)[0]?.id ?? null;
    if (pg.id !== cur.pageId || (!frameStillOk && cur.frameId !== null && !pg.shapes[cur.frameId])) {
      // halaman berganti atau layar terhapus → reset ke layar pertama halaman itu
      setCur({ pageId: pg.id, frameId: frameStillOk ? cur.frameId : wanted });
    } else if (!cur.frameId && wanted) {
      setCur({ pageId: pg.id, frameId: wanted });
    }
  }, [file, cur.pageId, cur.frameId]);

  const frame = page && cur.frameId ? (page.shapes[cur.frameId] ?? undefined) : undefined;
  const screen = frame ?? (page ? screenFrames(page)[0] : undefined);

  // fit screen ke viewport
  useLayoutEffect(() => {
    const measure = () => {
      const vp = viewportRef.current;
      if (!vp || !screen) return;
      setScale(Math.min((vp.clientHeight - 16) / screen.height, (vp.clientWidth - 16) / screen.width, 1));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [screen?.width, screen?.height, screen, page?.id]);

  const navigate = (target: string) => {
    if (!file) return;
    setHistory((h) => [...h, cur]);
    const pg = file.pages.find((p) => p.id === target);
    if (pg) {
      setCur({ pageId: pg.id, frameId: screenFrames(pg)[0]?.id ?? null });
      return;
    }
    // target = frame; cari di halaman aktif dulu, lalu halaman lain
    const inCurrent = page?.shapes[target];
    if (inCurrent) {
      setCur({ pageId: page.id, frameId: target });
      return;
    }
    for (const p of file.pages) {
      if (p.shapes[target]) {
        setCur({ pageId: p.id, frameId: target });
        return;
      }
    }
  };

  const back = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      setCur(h[h.length - 1]!);
      return h.slice(0, -1);
    });
  };

  // Esc menutup player
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const screens = page ? screenFrames(page) : [];
  const screensOtherPages = file ? file.pages.filter((p) => p.id !== page?.id) : [];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm">
      {/* top bar */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs text-white/80">
        <Play size={14} className="text-accent" weight="fill" />
        <span className="font-medium">{file?.name ?? "…"}</span>
        <span className="text-white/40">
          {page?.name} / {screen?.name ?? "empty"}
        </span>
        <span className="ml-auto text-white/40">revn {file?.revn ?? 0} · live sync 2.5s</span>
        <Button variant="ghost" className="!px-2 !py-1 !text-white/80" title="Back" onClick={back} disabled={history.length === 0}>
          <ArrowLeft size={15} />
        </Button>
        <Button variant="ghost" className="!px-2 !py-1 !text-white/80" title="Close (Esc)" onClick={onClose}>
          <X size={16} />
        </Button>
      </div>

      {/* stage */}
      <div ref={viewportRef} className="relative grid min-h-0 flex-1 place-items-center overflow-hidden p-2">
        {page && screen ? (
          <div
            key={`${page.id}:${screen.id}`}
            ref={screenRef}
            className="screen-in relative overflow-hidden rounded-xl shadow-2xl"
            style={{
              width: screen.width,
              height: screen.height,
              transform: `scale(${scale})`,
              background: screen.fills[0]?.color ?? "#0d0d10",
            }}
          >
            {/* anak-anak layar (koordinat relatif layar); layar non-frame: render semua root */}
            {(screen.type === "frame"
              ? (screen as { children?: string[] }).children ?? []
              : page.roots.filter((r) => page.shapes[r])
            ).map((cid) => {
              const c = page.shapes[cid];
              return c ? <ShapeNode key={cid} shape={c} page={page} onNavigate={navigate} /> : null;
            })}
          </div>
        ) : (
          <div className="text-sm text-white/60">
            This page has no screens yet. Draw a root frame (e.g. 390x844 artboard) and it becomes a screen.
          </div>
        )}
      </div>

      {/* screen switcher */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-t border-white/10 px-3 py-2">
        {screens.map((s) => (
          <button
            key={s.id}
            onClick={() => setCur({ pageId: page!.id, frameId: s.id })}
            className={`rounded-full px-3 py-1 text-xs transition ${
              s.id === screen?.id ? "bg-accent text-white" : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            {s.name || s.type}
          </button>
        ))}
        {screensOtherPages.map((p) => (
          <button
            key={p.id}
            onClick={() => setCur({ pageId: p.id, frameId: screenFrames(p)[0]?.id ?? null })}
            className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/50 hover:bg-white/10"
            title={`Switch to page ${p.name}`}
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}
