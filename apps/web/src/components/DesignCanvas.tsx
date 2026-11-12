"use client";
// P3-CANVAS: editor desain embedded — canvas 2D murni (zero-dep), model
// Penpot-inspired (pages → frame/rect/circle/text). Persona menggambar via
// tools design_*; user melihat & mengedit di sini (select/move/resize,
// toolbar create, props panel, zoom/pan, undo/redo, multi-page).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowsIn,
  Circle,
  FrameCorners,
  Image as ImageIcon,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Rectangle,
  TextAa,
  Trash,
  ArrowCounterClockwise,
  ArrowClockwise,
  Plus,
  CopySimple,
  Stack,
  ArrowsOutSimple,
  ChatCircleDots,
  SidebarSimple,
} from "@phosphor-icons/react";
import type { DesignFile, DesignPage, DesignShape } from "@yuika/core/design";
import { apiUrl, authFetch } from "@/lib/api";
import { getAssetImage, loadAsset, useAssetNotify } from "@/lib/designAssets";
import { makeDesignRefs, type DesignRefPayload } from "@/lib/designRef";
import { Button, Chip, Dropdown } from "@/components/ui";
import { DesignLayers } from "@/components/DesignLayers";

type Tool = "select" | "frame" | "rect" | "circle" | "text";
type Pt = { x: number; y: number };
type Dir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Props {
  fileId: string;
  /** D92: dipakai upload image asset (scope uploads project). */
  projectId: string;
  /** D91: slot ujung kanan toolbar (pemilih file + Try it) — dipasang oleh
   *  DesignTab agar satu baris dengan tools & chip Saved. */
  headerRight?: React.ReactNode;
  /** D93: klik kanan shape → "Attach to chat" → chip di composer chat. */
  onAttachToChat?: (refs: DesignRefPayload[]) => void;
}

const R = (s: number) => Math.round(s * 100) / 100;

/** D92: frame/group punya children (web tidak boleh import nilai dari
 *  core — store menarik node:fs ke bundle). */
const hasChildren = (
  s: DesignShape,
): s is Extract<DesignShape, { children: string[] }> =>
  s.type === "frame" || s.type === "group";

const HANDLE_DIRS: Dir[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** D96: satu garis bantu alignment (axis x = garis vertikal). */
type GuideLine = { axis: "x" | "y"; v: number; a0: number; a1: number };

/** D96: kandidat garis bantu — edge & center semua shape lain (abs),
 *  dihitung SEKALI saat drag mulai (shape lain diam selama drag). */
function guideTargets(
  page: DesignPage,
  movingIds: Set<string>,
): {
  xs: { v: number; y0: number; y1: number }[];
  ys: { v: number; x0: number; x1: number }[];
} {
  const isMoving = (id: string): boolean => {
    let cur: DesignShape | undefined = page.shapes[id];
    while (cur) {
      if (movingIds.has(cur.id)) return true;
      cur = cur.parentId ? page.shapes[cur.parentId] : undefined;
    }
    return false;
  };
  const xs: { v: number; y0: number; y1: number }[] = [];
  const ys: { v: number; x0: number; x1: number }[] = [];
  for (const sh of Object.values(page.shapes)) {
    if (sh.hidden || isMoving(sh.id)) continue;
    const abs = canvasPos(sh, page);
    const x0 = abs.x;
    const x1 = abs.x + sh.width;
    const y0 = abs.y;
    const y1 = abs.y + sh.height;
    xs.push({ v: x0, y0, y1 }, { v: (x0 + x1) / 2, y0, y1 }, { v: x1, y0, y1 });
    ys.push({ v: y0, x0, x1 }, { v: (y0 + y1) / 2, x0, x1 }, { v: y1, x0, x1 });
  }
  return { xs, ys };
}

/** D92: clipboard internal copy/paste (lintas file dalam satu tab). */
let CLIP: { shapes: DesignShape[]; parentId: string | null } | null = null;

function canvasPos(
  shape: DesignShape,
  page: DesignPage,
): { x: number; y: number } {
  let x = shape.x;
  let y = shape.y;
  let p = shape.parentId ? page.shapes[shape.parentId] : undefined;
  while (p) {
    x += p.x;
    y += p.y;
    p = p.parentId ? page.shapes[p.parentId] : undefined;
  }
  return { x, y };
}

/** D92: posisi handle (screen px) utk satu shape — dipakai resize drag. */
function handlePoints(abs: Pt, w: number, h: number): Record<Dir, Pt> {
  return {
    nw: { x: abs.x, y: abs.y },
    n: { x: abs.x + w / 2, y: abs.y },
    ne: { x: abs.x + w, y: abs.y },
    e: { x: abs.x + w, y: abs.y + h / 2 },
    se: { x: abs.x + w, y: abs.y + h },
    s: { x: abs.x + w / 2, y: abs.y + h },
    sw: { x: abs.x, y: abs.y + h },
    w: { x: abs.x, y: abs.y + h / 2 },
  };
}

/** D92: frame/group paling depan yang mengandung titik (world), tidak
 *  termasuk id yang di-exclude (shape yang digerakkan + descendant-nya).
 *  Dipakai auto-parent saat drop / create (perilaku Canva/Figma). */
function findContainer(
  page: DesignPage,
  wx: number,
  wy: number,
  excl: Set<string>,
): DesignShape | null {
  const test = (id: string): DesignShape | null => {
    const s = page.shapes[id];
    if (!s || s.hidden) return null;
    if (hasChildren(s)) {
      // anak selalu di depan parent — cek anak dulu (z terdepan)
      for (let i = s.children.length - 1; i >= 0; i--) {
        const r = test(s.children[i]!);
        if (r) return r;
      }
    }
    if (excl.has(id)) return null;
    if (!hasChildren(s)) return null;
    const pos = canvasPos(s, page);
    if (
      wx >= pos.x &&
      wx <= pos.x + s.width &&
      wy >= pos.y &&
      wy <= pos.y + s.height
    )
      return s;
    return null;
  };
  for (let i = page.roots.length - 1; i >= 0; i--) {
    const r = test(page.roots[i]!);
    if (r) return r;
  }
  return null;
}

/** D92: apakah `id` berada dalam subtree `anc` (frame/group)? */
function isDescendantOf(page: DesignPage, anc: string, id: string): boolean {
  let p = page.shapes[id]?.parentId ?? null;
  while (p) {
    if (p === anc) return true;
    p = page.shapes[p]?.parentId ?? null;
  }
  return false;
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: DesignShape,
  page: DesignPage,
  selIds: Set<string>,
  view: { zoom: number; ox: number; oy: number },
  depth = 0,
  singleSel = false,
): void {
  if (shape.hidden) return;
  const pos = canvasPos(shape, page);
  const x = (pos.x + view.ox) * view.zoom;
  const y = (pos.y + view.oy) * view.zoom;
  const w = shape.width * view.zoom;
  const h = shape.height * view.zoom;
  ctx.save();
  ctx.globalAlpha = (shape.opacity ?? 1) * (shape.fills[0]?.opacity ?? 1);
  const fill = shape.fills[0]?.color ?? "#00000000";
  ctx.fillStyle = fill;
  if (shape.type === "circle") {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (shape.stroke && shape.stroke.width > 0) {
      ctx.strokeStyle = shape.stroke.color;
      ctx.lineWidth = shape.stroke.width * view.zoom;
      ctx.stroke();
    }
  } else if (shape.type === "text") {
    ctx.fillStyle = shape.color;
    const fs = shape.fontSize * view.zoom;
    ctx.font = `${shape.fontWeight ?? 400} ${fs}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    const lh = fs * (shape.lineHeight ?? 1.35);
    const lines = shape.text.split("\n");
    // word wrap sederhana
    const wrapped: string[] = [];
    for (const ln of lines) {
      let cur = "";
      for (const word of ln.split(" ")) {
        const t = cur ? `${cur} ${word}` : word;
        if (ctx.measureText(t).width > w && cur) {
          wrapped.push(cur);
          cur = word;
        } else cur = t;
      }
      wrapped.push(cur);
    }
    const tx =
      shape.align === "center"
        ? x + w / 2
        : shape.align === "right"
          ? x + w
          : x;
    ctx.textAlign =
      shape.align === "center"
        ? "center"
        : shape.align === "right"
          ? "right"
          : "left";
    wrapped.forEach((t, i) => ctx.fillText(t, tx, y + i * lh));
  } else if (shape.type === "image") {
    const img = getAssetImage(shape.src);
    const r0 = Math.min(shape.radius ?? 0, w / 2, h / 2) * view.zoom;
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r0);
      ctx.clip();
      const fit = shape.fit ?? "cover";
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      let dw = w;
      let dh = h;
      let dx = x;
      let dy = y;
      if (fit !== "stretch") {
        const sc =
          fit === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
        dw = iw * sc;
        dh = ih * sc;
        dx = x + (w - dw) / 2;
        dy = y + (h - dh) / 2;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    } else {
      loadAsset(shape.src); // trigger fetch; re-render saat siap
      ctx.fillStyle = shape.fills[0]?.color ?? "#1c1c24";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r0);
      ctx.fill();
      ctx.strokeStyle = "#3a3a44";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w, y);
      ctx.strokeStyle = "#2c2c34";
      ctx.stroke();
    }
  } else if (shape.type === "group") {
    // group = wadah logis tanpa visual sendiri (hanya children + selection)
  } else {
    const r = Math.min(shape.radius ?? 0, w / 2, h / 2) * view.zoom;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    // D92: background image frame (cover, di-clip bentuk rounded)
    if (shape.type === "frame" && shape.fills[0]?.image) {
      const img = getAssetImage(shape.fills[0].image);
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        ctx.clip();
        const sc = Math.max(w / img.naturalWidth, h / img.naturalHeight);
        const dw = img.naturalWidth * sc;
        const dh = img.naturalHeight * sc;
        ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
        ctx.restore();
      } else loadAsset(shape.fills[0].image);
    }
    if (shape.stroke && shape.stroke.width > 0) {
      ctx.strokeStyle = shape.stroke.color;
      ctx.lineWidth = shape.stroke.width * view.zoom;
      ctx.stroke();
    }
    if (shape.type === "frame") {
      // label frame di atas (gaya artboard)
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#71717a";
      ctx.font = `${11 * view.zoom}px ui-sans-serif, system-ui`;
      ctx.textAlign = "left";
      ctx.fillText(shape.name, x, y - 6 * view.zoom);
    }
  }
  ctx.restore();
  if (selIds.has(shape.id)) {
    ctx.save();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - 1, y - 1, w + 2, h + 2, 3);
    ctx.stroke();
    if (depth === 0 && singleSel) {
      // D92: 8 handle resize (sudut + sisi) — hanya seleksi tunggal
      ctx.fillStyle = "#0c0c10";
      for (const hp of Object.values(handlePoints({ x, y }, w, h))) {
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  if (hasChildren(shape)) {
    for (const c of shape.children) {
      const ch = page.shapes[c];
      if (ch) drawShape(ctx, ch, page, selIds, view, depth + 1, singleSel);
    }
  }
}

/** D96: ruler strip (atas & kiri) — tick + label koordinat world +
 *  indikator posisi kursor; sinkron zoom/pan (view transform canvas). */
function Ruler({
  view,
  dir,
  cursor,
}: {
  view: { zoom: number; ox: number; oy: number };
  dir: "h" | "v";
  cursor: number | null;
}): React.ReactElement {
  const THICK = 20;
  const ref = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [len, setLen] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setLen(dir === "h" ? el.clientWidth : el.clientHeight);
    });
    ro.observe(el);
    setLen(dir === "h" ? el.clientWidth : el.clientHeight);
    return () => ro.disconnect();
  }, [dir]);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || len <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = dir === "h" ? len : THICK;
    const h = dir === "h" ? THICK : len;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const off = dir === "h" ? view.ox : view.oy;
    const worldStart = -off;
    const worldEnd = worldStart + len / view.zoom;
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
    const step = steps.find((st) => st * view.zoom >= 56) ?? 5000;
    const start = Math.floor(worldStart / step) * step;
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillStyle = "rgba(150,152,166,0.95)";
    ctx.strokeStyle = "rgba(150,152,166,0.6)";
    for (let w0 = start; w0 <= worldEnd + step; w0 += step) {
      const pos = (w0 + off) * view.zoom;
      if (dir === "h") {
        if (pos < -24 || pos > w + 24) continue;
        ctx.beginPath();
        ctx.moveTo(pos + 0.5, THICK - 5);
        ctx.lineTo(pos + 0.5, THICK);
        ctx.stroke();
        ctx.fillText(String(Math.round(w0)), pos + 3, THICK - 7);
      } else {
        if (pos < -24 || pos > h + 24) continue;
        ctx.beginPath();
        ctx.moveTo(THICK - 5, pos + 0.5);
        ctx.lineTo(THICK, pos + 0.5);
        ctx.stroke();
        ctx.save();
        ctx.translate(THICK - 7, pos + 3);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(String(Math.round(w0)), 0, 0);
        ctx.restore();
      }
    }
    if (cursor !== null) {
      const cp = (cursor + off) * view.zoom;
      if (cp >= 0 && cp <= len) {
        ctx.fillStyle = "#5b8cff";
        if (dir === "h") ctx.fillRect(cp, 0, 1, THICK);
        else ctx.fillRect(0, cp, THICK, 1);
      }
    }
  }, [view, dir, cursor, len]);
  return (
    <div ref={boxRef} className={dir === "h" ? "h-full w-full" : "h-full w-full"}>
      <canvas ref={ref} />
    </div>
  );
}

export function DesignCanvas(props: Props): React.ReactElement | null {
  const [file, setFile] = useState<DesignFile | null>(null);
  const [pageId, setPageId] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  /** D93: menu klik kanan (attach to chat) — null = tertutup. */
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    ids: string[];
  } | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [view, setView] = useState({ zoom: 0.5, ox: 60, oy: 40 });
  /** D96: garis bantu aktif saat drag (null = tidak ada). */
  const [guides, setGuides] = useState<GuideLine[] | null>(null);
  /** D96: posisi kursor world utk indikator ruler. */
  const [ptrWorld, setPtrWorld] = useState<Pt | null>(null);
  /** D96: layers panel foldable — canvas bisa lebih lebar (persist). */
  const [layersOpen, setLayersOpen] = useState(true);
  useEffect(() => {
    if (localStorage.getItem("yuika.design.layersOpen") === "0")
      setLayersOpen(false);
  }, []);
  const toggleLayers = () =>
    setLayersOpen((o) => {
      localStorage.setItem("yuika.design.layersOpen", o ? "0" : "1");
      return !o;
    });
  const [uploading, setUploading] = useState(false);
  /** D92: state terbaru utk handler asinkron (onUp auto-parent, paste, dll). */
  const liveRef = useRef<{
    file: DesignFile | null;
    page: DesignPage | null;
    sel: Set<string>;
  }>({
    file: null,
    page: null,
    sel: new Set(),
  });
  liveRef.current = {
    file,
    page: file?.pages.find((p) => p.id === pageId) ?? null,
    sel,
  };
  const assetTick = useAssetNotify();
  const imgInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  /** Zoom menjaga titik kanvas di bawah `at` (px relatif stage); null = tengah. */
  const zoomAt = useCallback(
    (at: { x: number; y: number } | null, factor: number) => {
      setView((v) => {
        const z = Math.min(4, Math.max(0.05, v.zoom * factor));
        if (z === v.zoom) return v;
        const rect = wrapRef.current?.getBoundingClientRect();
        const mx = at?.x ?? (rect ? rect.width / 2 : 0);
        const my = at?.y ?? (rect ? rect.height / 2 : 0);
        // screen = (world + o) * z → jaga world tetap di bawah kursor
        const wx = mx / v.zoom - v.ox;
        const wy = my / v.zoom - v.oy;
        return { zoom: z, ox: mx / z - wx, oy: my / z - wy };
      });
    },
    [],
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const undoStack = useRef<DesignFile[]>([]);
  const redoStack = useRef<DesignFile[]>([]);
  const drag = useRef<
    | {
        kind: "move";
        start: Pt;
        orig: Map<string, Pt>;
        moved: boolean;
        /** D96: bbox absolut seleksi saat mulai drag + kandidat snap. */
        bbox: { x0: number; y0: number; x1: number; y1: number };
        guides: ReturnType<typeof guideTargets>;
      }
    | {
        kind: "resize";
        handle: Dir;
        id: string;
        orig: { x: number; y: number; width: number; height: number };
        start: Pt;
      }
    | { kind: "create"; start: Pt; type: Tool }
    | { kind: "pan"; start: Pt; vo: { ox: number; oy: number } }
    | null
  >(null);

  const load = useCallback(async () => {
    try {
      const r = await authFetch(apiUrl(`/api/design/files/${props.fileId}`));
      if (!r.ok) return;
      const j = (await r.json()) as { file: DesignFile };
      setFile((cur) => {
        // jangan timpa hasil edit lokal yang belum tersimpan
        if (cur && dirty) return cur;
        if (cur && j.file.revn < cur.revn) return cur;
        return j.file;
      });
      setPageId((p) =>
        j.file.pages.some((pg) => pg.id === p)
          ? p
          : (j.file.pages[0]?.id ?? ""),
      );
    } catch {
      /* offline */
    }
  }, [props.fileId, dirty]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 12_000); // persona juga bisa menggambar
    return () => clearInterval(t);
  }, [load]);

  const page: DesignPage | null = useMemo(
    () => file?.pages.find((p) => p.id === pageId) ?? null,
    [file, pageId],
  );

  /** D90: zoom + center ke satu shape (dipakai layers panel & filter). */
  const focusShape = useCallback(
    (id: string) => {
      if (!page) return;
      const s = page.shapes[id];
      const stage = wrapRef.current;
      if (!s || !stage) return;
      const pos = canvasPos(s, page);
      const bw = Math.max(40, s.width);
      const bh = Math.max(40, s.height);
      const pad = 140;
      const z = Math.min(
        2,
        Math.max(
          0.1,
          Math.min(
            (stage.clientWidth - pad) / bw,
            (stage.clientHeight - pad) / bh,
          ),
        ),
      );
      setView({
        zoom: z,
        ox: stage.clientWidth / 2 / z - (pos.x + s.width / 2),
        oy: stage.clientHeight / 2 / z - (pos.y + s.height / 2),
      });
    },
    [page],
  );

  /** Fit semua konten halaman ke viewport (padding 60px). */
  const fitView = useCallback(() => {
    const stage = wrapRef.current;
    if (!stage || !page) return;
    const shapes = Object.values(page.shapes);
    if (shapes.length === 0) {
      setView({ zoom: 0.5, ox: 60, oy: 40 });
      return;
    }
    let bx = Infinity,
      by = Infinity,
      bx2 = -Infinity,
      by2 = -Infinity;
    for (const s of shapes) {
      if (s.hidden) continue;
      const p = canvasPos(s, page);
      bx = Math.min(bx, p.x);
      by = Math.min(by, p.y);
      bx2 = Math.max(bx2, p.x + s.width);
      by2 = Math.max(by2, p.y + s.height);
    }
    const bw = Math.max(1, bx2 - bx),
      bh = Math.max(1, by2 - by);
    const pad = 60;
    const z = Math.min(
      4,
      Math.max(
        0.05,
        Math.min(
          (stage.clientWidth - pad * 2) / bw,
          (stage.clientHeight - pad * 2) / bh,
        ),
      ),
    );
    setView({
      zoom: z,
      ox: (stage.clientWidth - bw * z) / 2 - bx * z,
      oy: (stage.clientHeight - bh * z) / 2 - by * z,
    });
  }, [page]);

  // ---- render loop ----
  useEffect(() => {
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap || !page) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0c0c10";
    ctx.fillRect(0, 0, w, h);
    // dots grid
    ctx.fillStyle = "#1c1c24";
    const step = 24 * view.zoom;
    if (step > 6) {
      for (let gx = (view.ox * view.zoom) % step; gx < w; gx += step)
        for (let gy = (view.oy * view.zoom) % step; gy < h; gy += step)
          ctx.fillRect(gx, gy, 1, 1);
    }
    // background halaman
    ctx.fillStyle = page.background;
    ctx.fillRect(
      (view.ox + 0) * view.zoom,
      (view.oy + 0) * view.zoom,
      20000 * view.zoom,
      20000 * view.zoom,
    );
    for (const id of page.roots) {
      const s = page.shapes[id];
      if (s) drawShape(ctx, s, page, sel, view, 0, sel.size === 1);
    }
  }, [file, page, sel, view, assetTick]);

  // D92: wheel NON-PASSIVE — React onWheel bersifat passive sehingga
  // preventDefault tidak mencegah zoom browser (Ctrl+wheel). Dipasang
  // manual agar Ctrl/⌘+wheel = zoom kanvas (anchored ke kursor),
  // Shift+wheel = geser horizontal, wheel = pan.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const f = Math.exp(-e.deltaY * 0.0016);
        zoomAt({ x: e.clientX - rect.left, y: e.clientY - rect.top }, f);
      } else if (e.shiftKey) {
        e.preventDefault();
        setView((v) => ({ ...v, ox: v.ox - e.deltaY / v.zoom }));
      } else {
        setView((v) => ({
          ...v,
          ox: v.ox - e.deltaX / v.zoom,
          oy: v.oy - e.deltaY / v.zoom,
        }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, file]); // file: wrap belum ada saat "Loading canvas…" → re-attach saat siap

  const mutate = useCallback((fn: (f: DesignFile) => void) => {
    setFile((cur) => {
      if (!cur) return cur;
      undoStack.current.push(JSON.parse(JSON.stringify(cur)));
      if (undoStack.current.length > 50) undoStack.current.shift();
      redoStack.current = [];
      const next = JSON.parse(JSON.stringify(cur)) as DesignFile;
      fn(next);
      next.revn = cur.revn + 1;
      next.updatedAt = Date.now();
      return next;
    });
    setDirty(true);
  }, []);

  // ---- hit test ----
  const hit = useCallback(
    (wx: number, wy: number): DesignShape | null => {
      if (!page) return null;
      const test = (id: string): DesignShape | null => {
        const s = page.shapes[id];
        if (!s || s.hidden || s.locked) return null;
        const pos = canvasPos(s, page);
        if (s.type === "frame") {
          for (let i = s.children.length - 1; i >= 0; i--) {
            const r = test(s.children[i]!);
            if (r) return r;
          }
        }
        if (
          wx >= pos.x &&
          wx <= pos.x + s.width &&
          wy >= pos.y &&
          wy <= pos.y + s.height
        )
          return s;
        return null;
      };
      for (let i = page.roots.length - 1; i >= 0; i--) {
        const r = test(page.roots[i]!);
        if (r) return r;
      }
      return null;
    },
    [page],
  );

  const toWorld = useCallback(
    (e: React.PointerEvent): Pt => {
      const r = canvasRef.current!.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) / view.zoom - view.ox,
        y: (e.clientY - r.top) / view.zoom - view.oy,
      };
    },
    [view],
  );

  const onDown = (e: React.PointerEvent) => {
    setCtxMenu(null);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const w = toWorld(e);
    if (tool === "select") {
      // D92: resize — cek kena handle (screen px) utk seleksi tunggal dulu
      if (page && sel.size === 1) {
        const one = page.shapes[[...sel][0]!];
        if (one && !one.locked) {
          const abs = canvasPos(one, page);
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
            for (const d of HANDLE_DIRS) {
              const hp = handlePoints(abs, one.width, one.height)[d];
              const px = (hp.x + view.ox) * view.zoom;
              const py = (hp.y + view.oy) * view.zoom;
              if (
                Math.abs(e.clientX - rect.left - px) <= 8 &&
                Math.abs(e.clientY - rect.top - py) <= 8
              ) {
                drag.current = {
                  kind: "resize",
                  handle: d,
                  id: one.id,
                  orig: {
                    x: one.x,
                    y: one.y,
                    width: one.width,
                    height: one.height,
                  },
                  start: w,
                };
                return;
              }
            }
          }
        }
      }
      const s = hit(w.x, w.y);
      if (s) {
        if (e.shiftKey) {
          setSel((cur) => {
            const n = new Set(cur);
            if (n.has(s.id)) n.delete(s.id);
            else n.add(s.id);
            return n;
          });
        } else setSel(new Set([s.id]));
        const orig = new Map<string, Pt>();
        for (const id of sel) {
          const sh = page?.shapes[id];
          if (sh && !sh.locked) orig.set(id, { x: sh.x, y: sh.y });
        }
        const mv = orig.size ? orig : new Map([[s.id, { x: s.x, y: s.y }]]);
        // D96: bbox absolut seleksi + kandidat garis bantu (sekali per drag)
        let bx0 = Infinity;
        let by0 = Infinity;
        let bx1 = -Infinity;
        let by1 = -Infinity;
        for (const id of mv.keys()) {
          const sh = page?.shapes[id];
          if (!sh) continue;
          const abs = canvasPos(sh, page);
          bx0 = Math.min(bx0, abs.x);
          by0 = Math.min(by0, abs.y);
          bx1 = Math.max(bx1, abs.x + sh.width);
          by1 = Math.max(by1, abs.y + sh.height);
        }
        drag.current = {
          kind: "move",
          start: w,
          orig: mv,
          moved: false,
          bbox: { x0: bx0, y0: by0, x1: bx1, y1: by1 },
          guides: page ? guideTargets(page, new Set(mv.keys())) : { xs: [], ys: [] },
        };
      } else {
        setSel(new Set());
        drag.current = {
          kind: "pan",
          start: { x: e.clientX, y: e.clientY },
          vo: { ox: view.ox, oy: view.oy },
        };
      }
    } else {
      drag.current = { kind: "create", start: w, type: tool };
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const wHover = toWorld(e);
    setPtrWorld(wHover);
    if (!d || !page || !file) return;
    const w = toWorld(e);
    if (d.kind === "pan") {
      setView((v) => ({
        ...v,
        ox: d.vo.ox + (e.clientX - d.start.x) / v.zoom,
        oy: d.vo.oy + (e.clientY - d.start.y) / v.zoom,
      }));
    } else if (d.kind === "move") {
      let dx = w.x - d.start.x;
      let dy = w.y - d.start.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) d.moved = true;
      // D96: smart guides — edge/tengah seleksi di-snap ke edge/tengah
      // shape lain dalam radius 6px layar (Alt = tanpa snap).
      const lines: GuideLine[] = [];
      if (!e.altKey) {
        const thr = 6 / view.zoom;
        const b = d.bbox;
        let bestX: { diff: number; v: number; y0: number; y1: number } | null =
          null;
        for (const se of [b.x0, (b.x0 + b.x1) / 2, b.x1]) {
          for (const g of d.guides.xs) {
            const diff = se + dx - g.v;
            if (
              Math.abs(diff) <= thr &&
              (!bestX || Math.abs(diff) < Math.abs(bestX.diff))
            )
              bestX = { diff, v: g.v, y0: g.y0, y1: g.y1 };
          }
        }
        if (bestX) {
          dx -= bestX.diff;
          lines.push({
            axis: "x",
            v: bestX.v,
            a0: Math.min(b.y0, bestX.y0) - 24,
            a1: Math.max(b.y1, bestX.y1) + 24,
          });
        }
        let bestY: { diff: number; v: number; x0: number; x1: number } | null =
          null;
        for (const se of [b.y0, (b.y0 + b.y1) / 2, b.y1]) {
          for (const g of d.guides.ys) {
            const diff = se + dy - g.v;
            if (
              Math.abs(diff) <= thr &&
              (!bestY || Math.abs(diff) < Math.abs(bestY.diff))
            )
              bestY = { diff, v: g.v, x0: g.x0, x1: g.x1 };
          }
        }
        if (bestY) {
          dy -= bestY.diff;
          lines.push({
            axis: "y",
            v: bestY.v,
            a0: Math.min(b.x0, bestY.x0) - 24,
            a1: Math.max(b.x1, bestY.x1) + 24,
          });
        }
      }
      setGuides(lines.length ? lines : null);
      mutate((f) => {
        const pg = f.pages.find((p) => p.id === page.id);
        if (!pg) return;
        for (const [id, o] of d.orig) {
          const s = pg.shapes[id];
          if (s) {
            s.x = R(o.x + dx);
            s.y = R(o.y + dy);
          }
        }
      });
    } else if (d.kind === "resize") {
      // D92: resize via handle — sudut & sisi, clamp minimal 2px
      const dx = w.x - d.start.x;
      const dy = w.y - d.start.y;
      const o = d.orig;
      let { x, y, width, height } = o;
      if (d.handle.includes("w")) {
        x = o.x + dx;
        width = o.width - dx;
      }
      if (d.handle.includes("e")) width = o.width + dx;
      if (d.handle.includes("n")) {
        y = o.y + dy;
        height = o.height - dy;
      }
      if (d.handle.includes("s")) height = o.height + dy;
      if (width < 2) {
        width = 2;
        if (d.handle.includes("w")) x = o.x + o.width - 2;
      }
      if (height < 2) {
        height = 2;
        if (d.handle.includes("n")) y = o.y + o.height - 2;
      }
      mutate((f) => {
        const pg = f.pages.find((p) => p.id === page.id);
        const s = pg?.shapes[d.id];
        if (s) {
          s.x = R(x);
          s.y = R(y);
          s.width = R(width);
          s.height = R(height);
        }
      });
    } else if (d.kind === "create") {
      // preview digambar saat pointer up; cukup kursor
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setGuides(null); // D96
    if (!d || !page || !file) return;
    const w = toWorld(e);
    if (d.kind === "create") {
      const x = Math.min(d.start.x, w.x);
      const y = Math.min(d.start.y, w.y);
      let width = Math.abs(w.x - d.start.x);
      let height = Math.abs(w.y - d.start.y);
      let text: string | undefined;
      if (d.type === "text") {
        text = "Text";
        width = Math.max(width, 120);
        height = Math.max(height, 24);
      } else if (width < 4 || height < 4) {
        width = Math.max(width, 100);
        height = Math.max(height, 100);
      }
      // D92 (#9): object baru dibuat DI DALAM frame → jadi anak frame itu
      // (pusat bbox menentukan), koordinat relatif frame.
      const cont = findContainer(
        page,
        x + width / 2,
        y + height / 2,
        new Set(),
      );
      const contAbs = cont ? canvasPos(cont, page) : null;
      mutate((f) => {
        const pg = f.pages.find((p) => p.id === page.id);
        if (!pg) return;
        const id = crypto.randomUUID();
        const base = {
          id,
          name: `${d.type} ${Object.keys(pg.shapes).length + 1}`,
          x: R(contAbs ? x - contAbs.x : x),
          y: R(contAbs ? y - contAbs.y : y),
          width: R(width),
          height: R(height),
          fills: [
            { color: d.type === "frame" ? "#16161c" : "#2c2c34", opacity: 1 },
          ],
          parentId: cont ? cont.id : null,
        };
        pg.shapes[id] =
          d.type === "text"
            ? {
                ...base,
                type: "text",
                text: text!,
                fontSize: 16,
                color: "#f4f4f5",
              }
            : d.type === "circle"
              ? { ...base, type: "circle" }
              : d.type === "frame"
                ? { ...base, type: "frame", children: [], isScreen: !cont }
                : { ...base, type: "rect" };
        if (cont) {
          const par = pg.shapes[cont.id];
          if (par && hasChildren(par)) par.children.push(id);
          else pg.roots.push(id);
        } else pg.roots.push(id);
      });
      setTool("select");
    } else if (d.kind === "move" && d.moved) {
      // D92 (#4): auto-parent — drop shape di atas frame/group → masuk
      // hirarkinya (pusat bbox); keluar dari semua frame → naik ke root page.
      const live = liveRef.current;
      if (!live.page) return;
      const pg0 = live.page;
      const excl = new Set<string>();
      const addSub = (id: string): void => {
        excl.add(id);
        const s = pg0.shapes[id];
        if (s && hasChildren(s)) for (const c of s.children) addSub(c);
      };
      for (const id of d.orig.keys()) addSub(id);
      const targets: Array<{ id: string; parent: string | null }> = [];
      for (const id of d.orig.keys()) {
        const s = pg0.shapes[id];
        if (!s) continue;
        const abs = canvasPos(s, pg0);
        const cont = findContainer(
          pg0,
          abs.x + s.width / 2,
          abs.y + s.height / 2,
          excl,
        );
        const want = cont ? cont.id : null;
        if (s.parentId !== want) targets.push({ id, parent: want });
      }
      if (targets.length)
        mutate((f) => {
          const pg = f.pages.find((p) => p.id === pg0.id);
          if (!pg) return;
          for (const t of targets) {
            const s = pg.shapes[t.id];
            if (!s) continue;
            const abs = canvasPos(s, pg);
            if (s.parentId) {
              const par = pg.shapes[s.parentId];
              if (par && hasChildren(par))
                par.children = par.children.filter((c) => c !== s.id);
            } else {
              pg.roots = pg.roots.filter((r) => r !== s.id);
            }
            if (t.parent) {
              const np = pg.shapes[t.parent];
              if (np && hasChildren(np)) {
                const npAbs = canvasPos(np, pg);
                s.parentId = t.parent;
                s.x = R(abs.x - npAbs.x);
                s.y = R(abs.y - npAbs.y);
                np.children.push(s.id);
              } else {
                s.parentId = null;
                s.x = R(abs.x);
                s.y = R(abs.y);
                pg.roots.push(s.id);
              }
            } else {
              s.parentId = null;
              s.x = R(abs.x);
              s.y = R(abs.y);
              pg.roots.push(s.id);
            }
          }
        });
    }
  };

  const save = useCallback(async () => {
    if (!file || !dirty) return;
    setSaving(true);
    try {
      const r = await authFetch(apiUrl(`/api/design/files/${file.id}`), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file }),
      });
      if (r.ok) {
        const j = (await r.json()) as { revn: number };
        setFile((c) => (c ? { ...c, revn: j.revn } : c));
        setDirty(false);
      }
    } finally {
      setSaving(false);
    }
  }, [file, dirty]);

  // autosave debounce
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => void save(), 1500);
    return () => clearTimeout(t);
  }, [dirty, file, save]);

  const addPage = async () => {
    if (!file) return;
    if (dirty) await save(); // flush edit lokal sebelum mutasi server
    const r = await authFetch(apiUrl(`/api/design/files/${file.id}/pages`), {
      method: "POST",
    });
    if (r.ok) {
      const j = (await r.json()) as { pageId: string };
      await load();
      setPageId(j.pageId); // langsung aktifkan halaman baru
    }
  };

  /** D91: hapus halaman via API (setelah flush edit lokal); bila halaman
   *  aktif dihapus, pindah ke halaman tersisa pertama. */
  const deletePage = async (pid: string) => {
    if (!file || file.pages.length <= 1) return;
    const pg = file.pages.find((p) => p.id === pid);
    if (!pg) return;
    if (
      !window.confirm(
        `Delete page "${pg.name}" and all its shapes? This cannot be undone.`,
      )
    )
      return;
    if (dirty) await save();
    const r = await authFetch(
      apiUrl(`/api/design/files/${file.id}/pages/${pid}`),
      { method: "DELETE" },
    );
    if (r.ok) {
      const rest = file.pages.filter((p) => p.id !== pid);
      await load();
      if (pid === pageId) setPageId(rest[0]?.id ?? "");
      setSel(new Set());
    }
  };

  // ── D92: copy / paste / duplicate / group / ungroup / reparent ──────────

  /** Salin subtree shape terpilih (top-level only) ke clipboard internal.
   *  Koordinat top-level disimpan ABSOLUT agar paste bisa ke parent mana pun. */
  const copySel = useCallback((): void => {
    const live = liveRef.current;
    if (!live.page || live.sel.size === 0) return;
    const tops = [...live.sel].filter((id) => {
      const s = live.page!.shapes[id];
      return s && (!s.parentId || !live.sel.has(s.parentId));
    });
    if (!tops.length) return;
    const nodes: DesignShape[] = [];
    const walk = (id: string): void => {
      const s = live.page!.shapes[id];
      if (!s) return;
      const c = JSON.parse(JSON.stringify(s)) as DesignShape;
      if (!c.parentId || tops.includes(id)) {
        const abs = canvasPos(s, live.page!);
        c.x = R(abs.x);
        c.y = R(abs.y);
      }
      nodes.push(c);
      if (hasChildren(s)) for (const ch of s.children) walk(ch);
    };
    tops.forEach(walk);
    CLIP = {
      shapes: nodes,
      parentId: live.page.shapes[tops[0]!]?.parentId ?? null,
    };
  }, []);

  const pasteSel = useCallback((): void => {
    const live = liveRef.current;
    if (!CLIP || !live.page) return;
    const pgId = live.page.id;
    const clip = CLIP;
    const tops = clip.shapes.filter(
      (s) => !s.parentId || !clip.shapes.some((p) => p.id === s.parentId),
    );
    const idMap = new Map<string, string>();
    for (const n of clip.shapes) idMap.set(n.id, crypto.randomUUID());
    mutate((f) => {
      const pg = f.pages.find((p) => p.id === pgId);
      if (!pg) return;
      const parentOk =
        clip.parentId &&
        pg.shapes[clip.parentId] &&
        hasChildren(pg.shapes[clip.parentId]!)
          ? clip.parentId
          : null;
      const parAbs = parentOk ? canvasPos(pg.shapes[parentOk]!, pg) : null;
      for (const n of clip.shapes) {
        const c = JSON.parse(JSON.stringify(n)) as DesignShape;
        c.id = idMap.get(n.id)!;
        c.parentId = n.parentId ? (idMap.get(n.parentId) ?? null) : null;
        if (!c.parentId) {
          c.x = R(c.x + 16);
          c.y = R(c.y + 16);
          if (parentOk && parAbs) {
            c.parentId = parentOk;
            c.x = R(c.x - parAbs.x);
            c.y = R(c.y - parAbs.y);
          }
        }
        pg.shapes[c.id] = c;
      }
      for (const t of tops) {
        const c = pg.shapes[idMap.get(t.id)!];
        if (!c) continue;
        if (c.parentId) {
          const par = pg.shapes[c.parentId];
          if (par && hasChildren(par)) par.children.push(c.id);
        } else pg.roots.push(c.id);
      }
    });
    setSel(new Set(tops.map((t) => idMap.get(t.id)!)));
  }, [mutate]);

  const duplicateSel = useCallback((): void => {
    copySel();
    pasteSel();
  }, [copySel, pasteSel]);

  /** Ctrl+G: gabungkan seleksi (>=2) jadi satu group — anak boleh beda
   *  parent (semua dinaikkan/diturunkan ke parent anak terpilih pertama,
   *  koordinat dikonversi). Group = wadah tanpa visual. */
  const groupSel = useCallback((): void => {
    const live = liveRef.current;
    if (!live.page || live.sel.size < 2) return;
    const pg0 = live.page;
    const ids = [...live.sel].filter((id) => pg0.shapes[id]);
    if (ids.length < 2) return;
    const parent = pg0.shapes[ids[0]!]?.parentId ?? null;
    let bx = Infinity,
      by = Infinity,
      bx2 = -Infinity,
      by2 = -Infinity;
    for (const id of ids) {
      const s = pg0.shapes[id]!;
      const abs = canvasPos(s, pg0);
      bx = Math.min(bx, abs.x);
      by = Math.min(by, abs.y);
      bx2 = Math.max(bx2, abs.x + s.width);
      by2 = Math.max(by2, abs.y + s.height);
    }
    const gid = crypto.randomUUID();
    const groupCount =
      Object.values(pg0.shapes).filter((s) => s.type === "group").length + 1;
    const pgId = pg0.id;
    mutate((f) => {
      const pg = f.pages.find((p) => p.id === pgId);
      if (!pg) return;
      pg.shapes[gid] = {
        id: gid,
        name: `Group ${groupCount}`,
        type: "group",
        x: R(bx),
        y: R(by),
        width: R(bx2 - bx),
        height: R(by2 - by),
        fills: [{ color: "#000000", opacity: 0 }],
        parentId: parent,
        children: [],
      };
      // urut z sesuai array parent (belakang → depan)
      const arrOf = (s: DesignShape): string[] =>
        s.parentId &&
        pg.shapes[s.parentId] &&
        hasChildren(pg.shapes[s.parentId]!)
          ? (pg.shapes[s.parentId] as { children: string[] }).children
          : pg.roots;
      const order = [
        ...(parent && pg.shapes[parent] && hasChildren(pg.shapes[parent]!)
          ? (pg.shapes[parent] as { children: string[] }).children
          : pg.roots),
      ].filter((id) => live.sel.has(id));
      for (const id of order) {
        const s = pg.shapes[id];
        if (!s) continue;
        const abs = canvasPos(s, pg);
        const arr = arrOf(s);
        const i = arr.indexOf(id);
        if (i >= 0) arr.splice(i, 1);
        s.parentId = gid;
        s.x = R(abs.x - bx);
        s.y = R(abs.y - by);
        (pg.shapes[gid] as { children: string[] }).children.push(id);
      }
      const parr =
        parent && pg.shapes[parent] && hasChildren(pg.shapes[parent]!)
          ? (pg.shapes[parent] as { children: string[] }).children
          : pg.roots;
      parr.push(gid);
    });
    setSel(new Set([gid]));
  }, [mutate]);

  /** Ctrl+Shift+G: bongkar group — anak naik ke parent group (koordinat
   *  dikonversi), group dihapus. */
  const ungroupSel = useCallback((): void => {
    const live = liveRef.current;
    if (!live.page || live.sel.size !== 1) return;
    const g = live.page.shapes[[...live.sel][0]!];
    if (!g || g.type !== "group") return;
    const kids = [...g.children];
    const pgId = live.page.id;
    mutate((f) => {
      const pg = f.pages.find((p) => p.id === pgId);
      if (!pg) return;
      const grp = pg.shapes[g.id];
      if (!grp || grp.type !== "group") return;
      const arr =
        grp.parentId &&
        pg.shapes[grp.parentId] &&
        hasChildren(pg.shapes[grp.parentId]!)
          ? (pg.shapes[grp.parentId] as { children: string[] }).children
          : pg.roots;
      const gi = arr.indexOf(grp.id);
      if (gi >= 0) arr.splice(gi, 1);
      for (const k of kids) {
        const c = pg.shapes[k];
        if (!c) continue;
        c.parentId = grp.parentId;
        c.x = R(c.x + grp.x);
        c.y = R(c.y + grp.y);
        if (gi >= 0) arr.splice(gi + 1, 0, k);
        else arr.push(k);
      }
      delete pg.shapes[grp.id];
    });
    setSel(new Set(kids));
  }, [mutate]);

  /** D92 (#3): reparent dari layers panel drag & drop. */
  const moveShapeTo = useCallback(
    (sid: string, parentId: string | null) => {
      const live = liveRef.current;
      if (!live.page) return;
      const pg0 = live.page;
      const s = pg0.shapes[sid];
      if (!s) return;
      if (parentId && (parentId === sid || isDescendantOf(pg0, sid, parentId)))
        return;
      if (
        parentId &&
        !(pg0.shapes[parentId] && hasChildren(pg0.shapes[parentId]!))
      )
        return;
      const pgId = pg0.id;
      mutate((f) => {
        const pg = f.pages.find((p) => p.id === pgId);
        if (!pg) return;
        const sh = pg.shapes[sid];
        if (!sh) return;
        const abs = canvasPos(sh, pg);
        if (sh.parentId) {
          const par = pg.shapes[sh.parentId];
          if (par && hasChildren(par))
            par.children = par.children.filter((c) => c !== sid);
        } else {
          pg.roots = pg.roots.filter((r) => r !== sid);
        }
        if (parentId) {
          const np = pg.shapes[parentId];
          if (np && hasChildren(np)) {
            const npAbs = canvasPos(np, pg);
            sh.parentId = parentId;
            sh.x = R(abs.x - npAbs.x);
            sh.y = R(abs.y - npAbs.y);
            np.children.push(sid);
          }
        } else {
          sh.parentId = null;
          sh.x = R(abs.x);
          sh.y = R(abs.y);
          pg.roots.push(sid);
        }
      });
    },
    [mutate],
  );

  /** D92 (#11): upload image → uploads/ project → shape image di tengah
   *  viewport. #12: handler "jadikan background frame" (dipakai props panel). */
  const uploadImage = useCallback(
    async (f: File): Promise<void> => {
      const live = liveRef.current;
      if (!live.page || !live.file) return;
      setUploading(true);
      try {
        const r = await authFetch(
          apiUrl(
            `/api/uploads?name=${encodeURIComponent(f.name)}&project=${props.projectId}&kind=image`,
          ),
          { method: "POST", body: await f.arrayBuffer() },
        );
        if (!r.ok) {
          console.error("image upload failed", r.status);
          return;
        }
        const j = (await r.json()) as { path: string };
        // tunggu decode sebentar utk ukuran natural (clamp 480px sisi terpanjang)
        for (let i = 0; i < 40 && !getAssetImage(j.path); i++) {
          loadAsset(j.path);
          await new Promise((res) => setTimeout(res, 120));
        }
        let w = 320;
        let h = 200;
        const probe = getAssetImage(j.path);
        if (probe) {
          const sc = Math.min(
            1,
            480 / Math.max(probe.naturalWidth, probe.naturalHeight),
          );
          w = Math.max(24, Math.round(probe.naturalWidth * sc));
          h = Math.max(24, Math.round(probe.naturalHeight * sc));
        }
        const stage = wrapRef.current;
        const cz = view.zoom;
        const cwx = stage ? stage.clientWidth / 2 / cz - view.ox : 0;
        const cwy = stage ? stage.clientHeight / 2 / cz - view.oy : 0;
        const x = R(cwx - w / 2);
        const y = R(cwy - h / 2);
        const pgId = live.page.id;
        const fid = live.file.id;
        const newId = crypto.randomUUID();
        mutate((f2) => {
          const ff = f2.pages.find((p) => p.id === pgId);
          if (!ff || f2.id !== fid) return;
          ff.shapes[newId] = {
            id: newId,
            name: f.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Image",
            type: "image",
            x,
            y,
            width: w,
            height: h,
            fills: [{ color: "#1c1c24", opacity: 1 }],
            parentId: null,
            src: j.path,
            fit: "cover",
          };
          ff.roots.push(newId);
        });
        setSel(new Set([newId]));
      } finally {
        setUploading(false);
      }
    },
    [mutate, props.projectId, view],
  );

  /** #12: jadikan src image sebagai background frame penaungnya. */
  const useAsBackground = useCallback((): void => {
    const live = liveRef.current;
    if (!live.page) return;
    const pg0 = live.page;
    const one = live.sel.size === 1 ? pg0.shapes[[...live.sel][0]!] : null;
    if (!one || one.type !== "image") return;
    let frameId = one.parentId;
    if (
      !frameId ||
      !pg0.shapes[frameId] ||
      !hasChildren(pg0.shapes[frameId]!)
    ) {
      // cari frame root yang mengandung pusat image
      const abs = canvasPos(one, pg0);
      const cont = findContainer(
        pg0,
        abs.x + one.width / 2,
        abs.y + one.height / 2,
        new Set([one.id]),
      );
      frameId = cont ? cont.id : null;
    }
    if (!frameId) return;
    const pgId = pg0.id;
    mutate((f) => {
      const pg = f.pages.find((p) => p.id === pgId);
      const fr = pg?.shapes[frameId!];
      if (fr && hasChildren(fr)) {
        fr.fills = [
          {
            ...(fr.fills[0] ?? { color: "#16161c", opacity: 1 }),
            image: one.src,
          },
        ];
      }
    });
  }, [mutate]);

  // keyboard: delete, undo/redo, copy/paste/duplicate, group/ungroup (D92)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA|SELECT/))
        return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (sel.size && page && file) {
          mutate((f) => {
            const pg = f.pages.find((p) => p.id === page.id);
            if (!pg) return;
            const rm: string[] = [];
            const walk = (id: string) => {
              rm.push(id);
              const s = pg.shapes[id];
              if (s?.type === "frame") for (const c of s.children) walk(c);
            };
            for (const id of sel) walk(id);
            for (const id of rm) delete pg.shapes[id];
            pg.roots = pg.roots.filter((r) => !rm.includes(r));
            for (const s of Object.values(pg.shapes))
              if (s.type === "frame")
                s.children = s.children.filter((c) => !rm.includes(c));
          });
          setSel(new Set());
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          const nx = redoStack.current.pop();
          if (nx && file) {
            undoStack.current.push(JSON.parse(JSON.stringify(file)));
            setFile(nx);
            setDirty(true);
          }
        } else {
          const prev = undoStack.current.pop();
          if (prev && file) {
            redoStack.current.push(JSON.parse(JSON.stringify(file)));
            setFile(prev);
            setDirty(true);
          }
        }
      } else if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === "c" && sel.size > 0) {
          e.preventDefault();
          copySel();
        } else if (k === "v" && CLIP) {
          e.preventDefault();
          pasteSel();
        } else if (k === "d" && sel.size > 0) {
          e.preventDefault();
          duplicateSel();
        } else if (k === "g") {
          e.preventDefault();
          if (e.shiftKey) ungroupSel();
          else if (sel.size >= 2) groupSel();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    sel,
    page,
    file,
    mutate,
    copySel,
    pasteSel,
    duplicateSel,
    groupSel,
    ungroupSel,
  ]);

  if (!file || !page)
    return (
      <div className="grid h-full place-items-center text-sm text-dim">
        Loading canvas…
      </div>
    );

  const selShape = sel.size === 1 ? page.shapes[[...sel][0]!] : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        {/* D96: layers panel foldable — canvas bisa lebih lebar */}
        <Button
          variant="ghost"
          className="!px-2 !py-1"
          title={layersOpen ? "Hide layers panel (wider canvas)" : "Show layers panel"}
          aria-label="Toggle layers panel"
          onClick={toggleLayers}
        >
          <SidebarSimple size={15} />
        </Button>
        {(
          [
            ["select", <FrameCorners key="s" size={15} />, "Select / pan"],
            ["frame", <FrameCorners key="f" size={15} />, "Frame"],
            ["rect", <Rectangle key="r" size={15} />, "Rectangle"],
            ["circle", <Circle key="c" size={15} />, "Ellipse"],
            ["text", <TextAa key="t" size={15} />, "Text"],
          ] as Array<[Tool, React.ReactNode, string]>
        ).map(([t, icon, title]) => (
          <Button
            key={t}
            variant={tool === t ? "primary" : "ghost"}
            className="!px-2 !py-1"
            title={title}
            onClick={() => setTool(t)}
          >
            {icon}
          </Button>
        ))}
        {/* D92 (#11): upload image ke canvas */}
        <Button
          variant="ghost"
          className="!px-2 !py-1"
          title="Insert image (upload from your device)"
          disabled={uploading}
          onClick={() => imgInputRef.current?.click()}
        >
          <ImageIcon size={15} />
        </Button>
        <input
          ref={imgInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void uploadImage(f);
          }}
        />
        <span className="mx-1 h-4 w-px bg-line" />
        <Button
          variant="ghost"
          className="!px-2 !py-1"
          title="Undo (Ctrl+Z)"
          onClick={() => {
            const prev = undoStack.current.pop();
            if (prev && file) {
              redoStack.current.push(JSON.parse(JSON.stringify(file)));
              setFile(prev);
              setDirty(true);
            }
          }}
        >
          <ArrowCounterClockwise size={15} />
        </Button>
        <Button
          variant="ghost"
          className="!px-2 !py-1"
          title="Redo (Ctrl+Shift+Z)"
          onClick={() => {
            const nx = redoStack.current.pop();
            if (nx && file) {
              undoStack.current.push(JSON.parse(JSON.stringify(file)));
              setFile(nx);
              setDirty(true);
            }
          }}
        >
          <ArrowClockwise size={15} />
        </Button>
        <Button
          variant="ghost"
          className="!px-2 !py-1"
          title="Delete selection"
          onClick={() => {
            if (!sel.size) return;
            mutate((f) => {
              const pg = f.pages.find((p) => p.id === page.id);
              if (!pg) return;
              const rm: string[] = [];
              const walk = (id: string) => {
                rm.push(id);
                const s = pg.shapes[id];
                if (s?.type === "frame") for (const c of s.children) walk(c);
              };
              for (const id of sel) walk(id);
              for (const id of rm) delete pg.shapes[id];
              pg.roots = pg.roots.filter((r) => !rm.includes(r));
              for (const s of Object.values(pg.shapes))
                if (s.type === "frame")
                  s.children = s.children.filter((c) => !rm.includes(c));
            });
            setSel(new Set());
          }}
        >
          <Trash size={15} />
        </Button>
        {/* D92 (#6/#5): duplicate + group/ungroup */}
        <Button
          variant="ghost"
          className="!px-2 !py-1"
          title="Duplicate selection (Ctrl+D)"
          disabled={sel.size === 0}
          onClick={duplicateSel}
        >
          <CopySimple size={15} />
        </Button>
        <Button
          variant="ghost"
          className="!px-2 !py-1"
          title="Group selection (Ctrl+G)"
          disabled={sel.size < 2}
          onClick={groupSel}
        >
          <Stack size={15} />
        </Button>
        <Button
          variant="ghost"
          className="!px-2 !py-1"
          title="Ungroup (Ctrl+Shift+G)"
          disabled={!(sel.size === 1 && selShape?.type === "group")}
          onClick={ungroupSel}
        >
          <ArrowsOutSimple size={15} />
        </Button>
        <span className="mx-1 h-4 w-px bg-line" />
        <Button
          variant="ghost"
          className="!px-2 !py-1"
          title="Zoom out"
          onClick={() => zoomAt(null, 1 / 1.25)}
        >
          <MagnifyingGlassMinus size={15} />
        </Button>
        <button
          className="rounded px-1 text-xs text-dim hover:bg-inset hover:text-fg"
          title="Reset zoom to 100%"
          onClick={() => zoomAt(null, 1 / view.zoom)}
        >
          {Math.round(view.zoom * 100)}%
        </button>
        <Button
          variant="ghost"
          className="!px-2 !py-1"
          title="Zoom in"
          onClick={() => zoomAt(null, 1.25)}
        >
          <MagnifyingGlassPlus size={15} />
        </Button>
        <Button
          variant="ghost"
          className="!px-2 !py-1"
          title="Fit to screen"
          onClick={() => void fitView()}
        >
          <ArrowsIn size={15} />
        </Button>
        <span className="ml-auto flex items-center gap-2">
          {props.headerRight}
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* D90: layers tree ala Canva/Figma; D96: bisa di-fold utk canvas lebar */}
        {!layersOpen ? (
          <div className="hidden w-9 shrink-0 flex-col items-center border-r border-line py-2 md:flex">
            <Button
              variant="ghost"
              className="!px-1.5 !py-1"
              title="Show layers panel"
              aria-label="Show layers panel"
              onClick={toggleLayers}
            >
              <SidebarSimple size={15} />
            </Button>
          </div>
        ) : null}
        {layersOpen && file ? (
          <DesignLayers
            key={file.id}
            file={file}
            pageId={page.id}
            sel={sel}
            onPage={setPageId}
            onSelect={(id, additive) =>
              setSel((cur) => {
                if (!additive) return new Set([id]);
                const n = new Set(cur);
                if (n.has(id)) n.delete(id);
                else n.add(id);
                return n;
              })
            }
            onRename={(id, name) =>
              mutate((f) => {
                const pg = f.pages.find((p) => p.id === page.id);
                const s = pg?.shapes[id];
                if (s) s.name = name;
              })
            }
            onToggleHidden={(id, hidden) =>
              mutate((f) => {
                const pg = f.pages.find((p) => p.id === page.id);
                const s = pg?.shapes[id];
                if (s) s.hidden = hidden;
              })
            }
            onFocus={focusShape}
            onAddPage={() => void addPage()}
            onDeletePage={(pid) => void deletePage(pid)}
            onMoveShape={moveShapeTo}
          />
        ) : null}

        {/* canvas */}
        <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
          {/* D96: ruler atas & kiri — tick + label koordinat + indikator kursor */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-5 border-b border-line bg-surface/90">
            <Ruler view={view} dir="h" cursor={ptrWorld?.x ?? null} />
          </div>
          <div className="pointer-events-none absolute bottom-0 left-0 top-5 z-20 w-5 border-r border-line bg-surface/90">
            <Ruler view={view} dir="v" cursor={ptrWorld?.y ?? null} />
          </div>
          {/* D96: garis bantu alignment saat drag (smart guides) */}
          {guides?.map((g, i) =>
            g.axis === "x" ? (
              <div
                key={i}
                className="pointer-events-none absolute z-20 w-px bg-[#f24e1e]"
                style={{
                  left: (g.v + view.ox) * view.zoom,
                  top: (g.a0 + view.oy) * view.zoom,
                  height: Math.max(1, (g.a1 - g.a0) * view.zoom),
                }}
              />
            ) : (
              <div
                key={i}
                className="pointer-events-none absolute z-20 h-px bg-[#f24e1e]"
                style={{
                  top: (g.v + view.oy) * view.zoom,
                  left: (g.a0 + view.ox) * view.zoom,
                  width: Math.max(1, (g.a1 - g.a0) * view.zoom),
                }}
              />
            ),
          )}
          {/* D92 (#10): status save jadi floating chip pojok kanan atas kanvas */}
          <div className="pointer-events-none absolute right-2 top-2 z-10">
            {dirty ? (
              <Chip size="sm" tone="warn">
                {saving ? "Saving…" : "Unsaved"}
              </Chip>
            ) : (
              <Chip size="sm" tone="ok">
                Saved
              </Chip>
            )}
          </div>
          {/* D92 (#12): input hidden upload background frame (dipicu props panel) */}
          <input
            ref={bgInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              void (async () => {
                setUploading(true);
                try {
                  const r = await authFetch(
                    apiUrl(
                      `/api/uploads?name=${encodeURIComponent(f.name)}&project=${props.projectId}&kind=image`,
                    ),
                    { method: "POST", body: await f.arrayBuffer() },
                  );
                  if (!r.ok) return;
                  const j = (await r.json()) as { path: string };
                  loadAsset(j.path);
                  const one =
                    liveRef.current.sel.size === 1
                      ? liveRef.current.page?.shapes[
                          [...liveRef.current.sel][0]!
                        ]
                      : null;
                  if (one && hasChildren(one)) {
                    const id = one.id;
                    mutate((f2) => {
                      const pg = f2.pages.find(
                        (p) => p.id === liveRef.current.page?.id,
                      );
                      const s = pg?.shapes[id];
                      if (s && hasChildren(s))
                        s.fills = [
                          {
                            ...(s.fills[0] ?? { color: "#16161c", opacity: 1 }),
                            image: j.path,
                          },
                        ];
                    });
                  }
                } finally {
                  setUploading(false);
                }
              })();
            }}
          />
          <canvas
            ref={canvasRef}
            className={
              tool === "select" ? "cursor-default" : "cursor-crosshair"
            }
            style={{ touchAction: "none" }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onContextMenu={(e) => {
              e.preventDefault();
              const cv = canvasRef.current;
              if (!cv) return;
              const r = cv.getBoundingClientRect();
              const w = {
                x: (e.clientX - r.left) / view.zoom - view.ox,
                y: (e.clientY - r.top) / view.zoom - view.oy,
              };
              const target = hit(w.x, w.y);
              setCtxMenu(null);
              if (!target || !props.onAttachToChat) return;
              const ids = sel.has(target.id) ? [...sel] : [target.id];
              if (!sel.has(target.id)) setSel(new Set(ids));
              setCtxMenu({ x: e.clientX, y: e.clientY, ids });
            }}
          />
          {/* D93: menu klik kanan — attach komponen ke chat */}
          {ctxMenu && props.onAttachToChat && (
            <div
              className="fixed z-50 flex flex-col overflow-hidden rounded-lg2 border border-line bg-surface py-1 shadow-lg"
              style={{
                left: Math.min(ctxMenu.x, window.innerWidth - 250),
                top: Math.min(ctxMenu.y, window.innerHeight - 80),
              }}
            >
              <button
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-left text-[13px] text-secondary hover:bg-surface-raised hover:text-primary"
                onClick={() => {
                  const f = liveRef.current.file;
                  const pid = liveRef.current.page?.id;
                  if (f && pid) {
                    const refs = makeDesignRefs(f, pid, ctxMenu.ids);
                    if (refs.length > 0) props.onAttachToChat!(refs);
                  }
                  setCtxMenu(null);
                }}
              >
                <ChatCircleDots
                  size={14}
                  className="shrink-0 text-accent"
                  aria-hidden
                />
                {ctxMenu.ids.length > 1
                  ? `Attach ${ctxMenu.ids.length} components to chat`
                  : "Attach component to chat"}
              </button>
            </div>
          )}
        </div>

        {/* props panel */}
        <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-line p-3 md:flex">
          {selShape ? (
            <ShapeProps
              shape={selShape}
              file={file}
              pageId={page.id}
              onUseAsBackground={useAsBackground}
              onPickBackground={() => bgInputRef.current?.click()}
              onChange={(patch) =>
                mutate((f) => {
                  const pg = f.pages.find((p) => p.id === page.id);
                  const s = pg?.shapes[selShape.id];
                  if (!s) return;
                  Object.assign(s, patch);
                  if (patch.interaction === null) delete s.interaction;
                })
              }
            />
          ) : (
            <div className="text-xs text-dim">
              Select a shape to edit its properties. Persona edits appear here
              automatically (12s refresh); drag empty canvas to pan, Ctrl+wheel
              to zoom.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ShapeProps({
  shape,
  file,
  pageId,
  onChange,
  onUseAsBackground,
  onPickBackground,
}: {
  shape: DesignShape;
  file: DesignFile;
  pageId: string;
  onChange: (patch: Partial<DesignShape>) => void;
  onUseAsBackground?: () => void;
  onPickBackground?: () => void;
}): React.ReactElement {
  // D91: label DI ATAS input (bukan samping) — layout stabil, tanpa overflow.
  const label =
    "mb-1 block text-[11px] font-medium uppercase tracking-wide text-dim";
  const input =
    "w-full rounded border border-line bg-inset px-2 py-1.5 text-[13px]";
  const fill = shape.fills[0]?.color ?? "#000000";
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">
        {shape.type}
      </div>
      <label>
        <span className={label}>Name</span>
        <input
          className={input}
          value={shape.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>
      {/* D92 (#11/#12): image — fit + tombol jadikan background frame */}
      {shape.type === "image" && (
        <>
          <label>
            <span className={label}>Fit</span>
            <Dropdown
              value={shape.fit ?? "cover"}
              options={[
                { value: "cover", label: "Cover" },
                { value: "contain", label: "Contain" },
                { value: "stretch", label: "Stretch" },
              ]}
              onChange={(v) => onChange({ fit: v } as Partial<DesignShape>)}
            />
          </label>
          <Button
            variant="ghost"
            className="w-full justify-center !py-1.5"
            title="Set this image as the background of its parent screen/frame"
            onClick={() => onUseAsBackground?.()}
          >
            Use as frame background
          </Button>
        </>
      )}
      {/* D92 (#12): frame — background image (cover, di atas warna fill) */}
      {shape.type === "frame" && (
        <div className="flex flex-col gap-1.5">
          <span className={label}>Background image</span>
          {shape.fills[0]?.image ? (
            <div className="flex items-center gap-2">
              <span
                className="min-w-0 flex-1 truncate text-[12px] text-dim"
                title={shape.fills[0].image}
              >
                {shape.fills[0].image.split("/").pop()}
              </span>
              <Button
                variant="ghost"
                className="!px-2 !py-1"
                title="Remove background image"
                onClick={() =>
                  onChange({
                    fills: [
                      {
                        ...(shape.fills[0] ?? { color: "#16161c", opacity: 1 }),
                      },
                    ].map(({ image: _img, ...rest }) => rest),
                  } as Partial<DesignShape>)
                }
              >
                <Trash size={13} />
              </Button>
            </div>
          ) : (
            <span className="text-[12px] text-dim">Solid color only.</span>
          )}
          <Button
            variant="ghost"
            className="w-full justify-center !py-1.5"
            title="Upload an image as this frame's background"
            onClick={() => onPickBackground?.()}
          >
            Upload background…
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "width", "height"] as const).map((k) => (
          <label key={k}>
            <span className={label}>{k}</span>
            <input
              type="number"
              className={input}
              value={R(shape[k])}
              onChange={(e) =>
                onChange({
                  [k]: Number(e.target.value),
                } as Partial<DesignShape>)
              }
            />
          </label>
        ))}
      </div>
      {shape.type !== "text" && (
        <label>
          <span className={label}>Fill</span>
          <input
            type="color"
            className="h-8 w-full cursor-pointer rounded border border-line bg-inset"
            value={fill}
            onChange={(e) =>
              onChange({
                fills: [
                  {
                    color: e.target.value,
                    opacity: shape.fills[0]?.opacity ?? 1,
                  },
                ],
              })
            }
          />
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className={label}>Stroke</span>
          <input
            type="color"
            className="h-8 w-full cursor-pointer rounded border border-line bg-inset"
            value={shape.stroke?.color ?? "#3a3a44"}
            onChange={(e) =>
              onChange({
                stroke: {
                  color: e.target.value,
                  width: shape.stroke?.width ?? 1,
                },
              })
            }
          />
        </label>
        <label>
          <span className={label}>Stroke width</span>
          <input
            type="number"
            min={0}
            className={input}
            value={shape.stroke?.width ?? 0}
            onChange={(e) =>
              onChange({
                stroke: {
                  color: shape.stroke?.color ?? "#3a3a44",
                  width: Number(e.target.value),
                },
              })
            }
          />
        </label>
      </div>
      {shape.type !== "text" && (
        <label>
          <span className={label}>Radius</span>
          <input
            type="number"
            min={0}
            max={200}
            className={input}
            value={shape.radius ?? 0}
            onChange={(e) => onChange({ radius: Number(e.target.value) })}
          />
        </label>
      )}
      {shape.type === "text" && (
        <>
          <label>
            <span className={label}>Text</span>
            <textarea
              className="min-h-16 w-full resize-y rounded border border-line bg-inset px-2 py-1.5 text-[13px]"
              value={shape.text}
              onChange={(e) =>
                onChange({ text: e.target.value } as Partial<DesignShape>)
              }
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={label}>Size</span>
              <input
                type="number"
                min={8}
                max={200}
                className={input}
                value={shape.fontSize}
                onChange={(e) =>
                  onChange({
                    fontSize: Number(e.target.value),
                  } as Partial<DesignShape>)
                }
              />
            </label>
            <label>
              <span className={label}>Weight</span>
              <input
                type="number"
                step={100}
                min={100}
                max={900}
                className={input}
                value={shape.fontWeight ?? 400}
                onChange={(e) =>
                  onChange({
                    fontWeight: Number(e.target.value),
                  } as Partial<DesignShape>)
                }
              />
            </label>
          </div>
          <label>
            <span className={label}>Color</span>
            <input
              type="color"
              className="h-8 w-full cursor-pointer rounded border border-line bg-inset"
              value={shape.color}
              onChange={(e) =>
                onChange({ color: e.target.value } as Partial<DesignShape>)
              }
            />
          </label>
          <label>
            <span className={label}>Align</span>
            <Dropdown
              value={shape.align ?? "left"}
              options={[
                { value: "left", label: "Left" },
                { value: "center", label: "Center" },
                { value: "right", label: "Right" },
              ]}
              onChange={(v) => onChange({ align: v } as Partial<DesignShape>)}
            />
          </label>
        </>
      )}
      <label>
        <span className={label}>
          Opacity · {Math.round((shape.opacity ?? 1) * 100)}%
        </span>
        <input
          type="range"
          min={0}
          max={100}
          className="w-full"
          value={Math.round((shape.opacity ?? 1) * 100)}
          onChange={(e) => onChange({ opacity: Number(e.target.value) / 100 })}
        />
      </label>
      <label className="flex cursor-pointer items-center justify-between gap-2">
        Hidden
        <input
          type="checkbox"
          checked={Boolean(shape.hidden)}
          onChange={(e) => onChange({ hidden: e.target.checked })}
        />
      </label>
      {shape.type === "frame" && !shape.parentId ? (
        <label
          className="flex cursor-pointer items-center justify-between gap-2"
          title="Root frames marked as screen appear in the prototype (Try it)"
        >
          Screen (prototype)
          <input
            type="checkbox"
            checked={Boolean(
              (shape as { isScreen?: boolean }).isScreen !== false,
            )}
            onChange={(e) =>
              onChange({ isScreen: e.target.checked } as Partial<DesignShape>)
            }
          />
        </label>
      ) : null}
      {/* P3-PROTO: wiring on-click navigasi (dipakai tombol Try it) */}
      <div>
        <span className={label}>Prototype: on click</span>
        <Dropdown
          value={shape.interaction?.target ?? ""}
          options={[
            { value: "", label: "(none)" },
            ...file.pages.flatMap((pg) =>
              pg.roots
                .map((r) => pg.shapes[r])
                .filter(
                  (sh): sh is DesignShape => Boolean(sh) && sh!.type === "frame",
                )
                .map((sh) => ({
                  value: sh.id,
                  label: `${pg.id === pageId ? "" : pg.name + " / "}${sh.name || "frame"}`,
                  title: "Navigate to frame on click",
                })),
            ),
            ...file.pages
              .filter((pg) => pg.id !== pageId)
              .map((pg) => ({
                value: pg.id,
                label: `page: ${pg.name}`,
                title: "Navigate to page on click",
              })),
          ]}
          onChange={(v) =>
            onChange(
              v
                ? ({
                    interaction: {
                      event: "click",
                      action: "navigate",
                      target: v,
                    },
                  } as Partial<DesignShape>)
                : ({ interaction: null } as unknown as Partial<DesignShape>),
            )
          }
        />
      </div>
    </div>
  );
}
