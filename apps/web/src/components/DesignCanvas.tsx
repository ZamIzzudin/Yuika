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
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Rectangle,
  TextAa,
  Trash,
  ArrowCounterClockwise,
  ArrowClockwise,
  Plus,
} from "@phosphor-icons/react";
import type { DesignFile, DesignPage, DesignShape } from "@yuika/core/design";
import { apiUrl, authFetch } from "@/lib/api";
import { Button, Chip, Select } from "@/components/ui";
import { DesignLayers } from "@/components/DesignLayers";

type Tool = "select" | "frame" | "rect" | "circle" | "text";
type Pt = { x: number; y: number };

interface Props {
  fileId: string;
  /** D91: slot ujung kanan toolbar (pemilih file + Try it) — dipasang oleh
   *  DesignTab agar satu baris dengan tools & chip Saved. */
  headerRight?: React.ReactNode;
}

const R = (s: number) => Math.round(s * 100) / 100;

function canvasPos(shape: DesignShape, page: DesignPage): { x: number; y: number } {
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

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: DesignShape,
  page: DesignPage,
  selIds: Set<string>,
  view: { zoom: number; ox: number; oy: number },
  depth = 0,
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
    const tx = shape.align === "center" ? x + w / 2 : shape.align === "right" ? x + w : x;
    ctx.textAlign = shape.align === "center" ? "center" : shape.align === "right" ? "right" : "left";
    wrapped.forEach((t, i) => ctx.fillText(t, tx, y + i * lh));
  } else {
    const r = Math.min(shape.radius ?? 0, w / 2, h / 2) * view.zoom;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
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
    if (depth === 0) {
      // handles resize 4 sudut
      ctx.fillStyle = "#0c0c10";
      const corners: Array<[number, number]> = [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ];
      for (const [hx, hy] of corners) {
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  if (shape.type === "frame") {
    for (const c of shape.children) {
      const ch = page.shapes[c];
      if (ch) drawShape(ctx, ch, page, selIds, view, depth + 1);
    }
  }
}

export function DesignCanvas(props: Props): React.ReactElement | null {
  const [file, setFile] = useState<DesignFile | null>(null);
  const [pageId, setPageId] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [tool, setTool] = useState<Tool>("select");
  const [view, setView] = useState({ zoom: 0.5, ox: 60, oy: 40 });

  /** Zoom menjaga titik kanvas di bawah `at` (px relatif stage); null = tengah. */
  const zoomAt = useCallback((at: { x: number; y: number } | null, factor: number) => {
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
  }, []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const undoStack = useRef<DesignFile[]>([]);
  const redoStack = useRef<DesignFile[]>([]);
  const drag = useRef<
    | { kind: "move"; start: Pt; orig: Map<string, Pt>; moved: boolean }
    | { kind: "resize"; corner: number; id: string; orig: DesignShape }
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
      setPageId((p) => (j.file.pages.some((pg) => pg.id === p) ? p : (j.file.pages[0]?.id ?? "")));
    } catch {
      /* offline */
    }
  }, [props.fileId, dirty]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 12_000); // persona juga bisa menggambar
    return () => clearInterval(t);
  }, [load]);

  const page: DesignPage | null = useMemo(() => file?.pages.find((p) => p.id === pageId) ?? null, [file, pageId]);

  /** D90: zoom + center ke satu shape (dipakai layers panel & filter). */
  const focusShape = useCallback((id: string) => {
    if (!page) return;
    const s = page.shapes[id];
    const stage = wrapRef.current;
    if (!s || !stage) return;
    const pos = canvasPos(s, page);
    const bw = Math.max(40, s.width);
    const bh = Math.max(40, s.height);
    const pad = 140;
    const z = Math.min(2, Math.max(0.1, Math.min((stage.clientWidth - pad) / bw, (stage.clientHeight - pad) / bh)));
    setView({
      zoom: z,
      ox: stage.clientWidth / 2 / z - (pos.x + s.width / 2),
      oy: stage.clientHeight / 2 / z - (pos.y + s.height / 2),
    });
  }, [page]);

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
      Math.max(0.05, Math.min((stage.clientWidth - pad * 2) / bw, (stage.clientHeight - pad * 2) / bh)),
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
        for (let gy = (view.oy * view.zoom) % step; gy < h; gy += step) ctx.fillRect(gx, gy, 1, 1);
    }
    // background halaman
    ctx.fillStyle = page.background;
    ctx.fillRect((view.ox + 0) * view.zoom, (view.oy + 0) * view.zoom, 20000 * view.zoom, 20000 * view.zoom);
    for (const id of page.roots) {
      const s = page.shapes[id];
      if (s) drawShape(ctx, s, page, sel, view);
    }
  }, [file, page, sel, view]);

  const mutate = useCallback(
    (fn: (f: DesignFile) => void) => {
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
    },
    [],
  );

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
        if (wx >= pos.x && wx <= pos.x + s.width && wy >= pos.y && wy <= pos.y + s.height) return s;
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
      return { x: (e.clientX - r.left) / view.zoom - view.ox, y: (e.clientY - r.top) / view.zoom - view.oy };
    },
    [view],
  );

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const w = toWorld(e);
    if (tool === "select") {
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
        drag.current = { kind: "move", start: w, orig: orig.size ? orig : new Map([[s.id, { x: s.x, y: s.y }]]), moved: false };
      } else {
        setSel(new Set());
        drag.current = { kind: "pan", start: { x: e.clientX, y: e.clientY }, vo: { ox: view.ox, oy: view.oy } };
      }
    } else {
      drag.current = { kind: "create", start: w, type: tool };
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !page || !file) return;
    const w = toWorld(e);
    if (d.kind === "pan") {
      setView((v) => ({ ...v, ox: d.vo.ox + (e.clientX - d.start.x) / v.zoom, oy: d.vo.oy + (e.clientY - d.start.y) / v.zoom }));
    } else if (d.kind === "move") {
      const dx = w.x - d.start.x;
      const dy = w.y - d.start.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) d.moved = true;
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
    } else if (d.kind === "create") {
      // preview digambar saat pointer up; cukup kursor
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
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
      mutate((f) => {
        const pg = f.pages.find((p) => p.id === page.id);
        if (!pg) return;
        const id = crypto.randomUUID();
        const base = {
          id,
          name: `${d.type} ${Object.keys(pg.shapes).length + 1}`,
          x: R(x),
          y: R(y),
          width: R(width),
          height: R(height),
          fills: [{ color: d.type === "frame" ? "#16161c" : "#2c2c34", opacity: 1 }],
          parentId: null,
        };
        pg.shapes[id] =
          d.type === "text"
            ? { ...base, type: "text", text: text!, fontSize: 16, color: "#f4f4f5" }
            : d.type === "circle"
              ? { ...base, type: "circle" }
              : d.type === "frame"
                ? { ...base, type: "frame", children: [], isScreen: true }
                : { ...base, type: "rect" };
        pg.roots.push(id);
      });
      setTool("select");
    }
  };

  // keyboard: delete, undo/redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA|SELECT/)) return;
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
            for (const s of Object.values(pg.shapes)) if (s.type === "frame") s.children = s.children.filter((c) => !rm.includes(c));
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, page, file, mutate]);

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
    const r = await authFetch(apiUrl(`/api/design/files/${file.id}/pages`), { method: "POST" });
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
    if (!window.confirm(`Delete page "${pg.name}" and all its shapes? This cannot be undone.`)) return;
    if (dirty) await save();
    const r = await authFetch(apiUrl(`/api/design/files/${file.id}/pages/${pid}`), { method: "DELETE" });
    if (r.ok) {
      const rest = file.pages.filter((p) => p.id !== pid);
      await load();
      if (pid === pageId) setPageId(rest[0]?.id ?? "");
      setSel(new Set());
    }
  };

  if (!file || !page) return <div className="grid h-full place-items-center text-sm text-dim">Loading canvas…</div>;

  const selShape = sel.size === 1 ? page.shapes[[...sel][0]!] : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
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
              for (const s of Object.values(pg.shapes)) if (s.type === "frame") s.children = s.children.filter((c) => !rm.includes(c));
            });
            setSel(new Set());
          }}
        >
          <Trash size={15} />
        </Button>
        <span className="mx-1 h-4 w-px bg-line" />
        <Button variant="ghost" className="!px-2 !py-1" title="Zoom out" onClick={() => zoomAt(null, 1 / 1.25)}>
          <MagnifyingGlassMinus size={15} />
        </Button>
        <button
          className="rounded px-1 text-xs text-dim hover:bg-inset hover:text-fg"
          title="Reset zoom to 100%"
          onClick={() => zoomAt(null, 1 / view.zoom)}
        >
          {Math.round(view.zoom * 100)}%
        </button>
        <Button variant="ghost" className="!px-2 !py-1" title="Zoom in" onClick={() => zoomAt(null, 1.25)}>
          <MagnifyingGlassPlus size={15} />
        </Button>
        <Button variant="ghost" className="!px-2 !py-1" title="Fit to screen" onClick={() => void fitView()}>
          <ArrowsIn size={15} />
        </Button>
        <span className="ml-auto flex items-center gap-2">
          {props.headerRight}
          {dirty ? <Chip tone="warn">{saving ? "Saving…" : "Unsaved"}</Chip> : <Chip tone="ok">Saved · revn {file.revn}</Chip>}
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* D90: layers tree ala Canva/Figma (menggantikan dropdown Pages) */}
        {file ? (
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
          />
        ) : null}

        {/* canvas */}
        <div
          ref={wrapRef}
          className="relative min-h-0 flex-1 overflow-hidden"
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              // P3-CANVAS: zoom menuju kursor (anchored) — ctrl/⌘+wheel dan
              // pinch trackpad (browser kirim ctrlKey otomatis saat pinch)
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const f = Math.exp(-e.deltaY * 0.0016);
              zoomAt({ x: e.clientX - rect.left, y: e.clientY - rect.top }, f);
            } else if (e.shiftKey) {
              // shift+wheel = geser horizontal
              e.preventDefault();
              setView((v) => ({ ...v, ox: v.ox - e.deltaY / v.zoom }));
            } else {
              setView((v) => ({ ...v, ox: v.ox - e.deltaX / v.zoom, oy: v.oy - e.deltaY / v.zoom }));
            }
          }}
        >
          <canvas
            ref={canvasRef}
            className={tool === "select" ? "cursor-default" : "cursor-crosshair"}
            style={{ touchAction: "none" }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          />
        </div>

        {/* props panel */}
        <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-line p-3 md:flex">
          {selShape ? (
            <ShapeProps
              shape={selShape}
              file={file}
              pageId={page.id}
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
              Select a shape to edit its properties. Persona edits appear here automatically (12s refresh); drag empty canvas to pan, Ctrl+wheel to zoom.
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
}: {
  shape: DesignShape;
  file: DesignFile;
  pageId: string;
  onChange: (patch: Partial<DesignShape>) => void;
}): React.ReactElement {
  // D91: label DI ATAS input (bukan samping) — layout stabil, tanpa overflow.
  const label = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-dim";
  const input = "w-full rounded border border-line bg-inset px-2 py-1.5 text-[13px]";
  const fill = shape.fills[0]?.color ?? "#000000";
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">{shape.type}</div>
      <label>
        <span className={label}>Name</span>
        <input className={input} value={shape.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "width", "height"] as const).map((k) => (
          <label key={k}>
            <span className={label}>{k}</span>
            <input
              type="number"
              className={input}
              value={R(shape[k])}
              onChange={(e) => onChange({ [k]: Number(e.target.value) } as Partial<DesignShape>)}
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
            onChange={(e) => onChange({ fills: [{ color: e.target.value, opacity: shape.fills[0]?.opacity ?? 1 }] })}
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
            onChange={(e) => onChange({ stroke: { color: e.target.value, width: shape.stroke?.width ?? 1 } })}
          />
        </label>
        <label>
          <span className={label}>Stroke width</span>
          <input
            type="number"
            min={0}
            className={input}
            value={shape.stroke?.width ?? 0}
            onChange={(e) => onChange({ stroke: { color: shape.stroke?.color ?? "#3a3a44", width: Number(e.target.value) } })}
          />
        </label>
      </div>
      {shape.type !== "text" && (
        <label>
          <span className={label}>Radius</span>
          <input type="number" min={0} max={200} className={input} value={shape.radius ?? 0} onChange={(e) => onChange({ radius: Number(e.target.value) })} />
        </label>
      )}
      {shape.type === "text" && (
        <>
          <label>
            <span className={label}>Text</span>
            <textarea
              className="min-h-16 w-full resize-y rounded border border-line bg-inset px-2 py-1.5 text-[13px]"
              value={shape.text}
              onChange={(e) => onChange({ text: e.target.value } as Partial<DesignShape>)}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={label}>Size</span>
              <input type="number" min={8} max={200} className={input} value={shape.fontSize} onChange={(e) => onChange({ fontSize: Number(e.target.value) } as Partial<DesignShape>)} />
            </label>
            <label>
              <span className={label}>Weight</span>
              <input type="number" step={100} min={100} max={900} className={input} value={shape.fontWeight ?? 400} onChange={(e) => onChange({ fontWeight: Number(e.target.value) } as Partial<DesignShape>)} />
            </label>
          </div>
          <label>
            <span className={label}>Color</span>
            <input
              type="color"
              className="h-8 w-full cursor-pointer rounded border border-line bg-inset"
              value={shape.color}
              onChange={(e) => onChange({ color: e.target.value } as Partial<DesignShape>)}
            />
          </label>
          <label>
            <span className={label}>Align</span>
            <Select value={shape.align ?? "left"} onChange={(e) => onChange({ align: e.target.value } as Partial<DesignShape>)} aria-label="Text align" className="w-full">
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </Select>
          </label>
        </>
      )}
      <label>
        <span className={label}>Opacity · {Math.round((shape.opacity ?? 1) * 100)}%</span>
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
        <input type="checkbox" checked={Boolean(shape.hidden)} onChange={(e) => onChange({ hidden: e.target.checked })} />
      </label>
      {shape.type === "frame" && !shape.parentId ? (
        <label className="flex cursor-pointer items-center justify-between gap-2" title="Root frames marked as screen appear in the prototype (Try it)">
          Screen (prototype)
          <input
            type="checkbox"
            checked={Boolean((shape as { isScreen?: boolean }).isScreen !== false)}
            onChange={(e) => onChange({ isScreen: e.target.checked } as Partial<DesignShape>)}
          />
        </label>
      ) : null}
      {/* P3-PROTO: wiring on-click navigasi (dipakai tombol Try it) */}
      <div>
        <span className={label}>Prototype: on click</span>
        <Select
          value={shape.interaction?.target ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange(
              v
                ? ({ interaction: { event: "click", action: "navigate", target: v } } as Partial<DesignShape>)
                : ({ interaction: null } as unknown as Partial<DesignShape>),
            );
          }}
          aria-label="On click navigates to"
          className="w-full"
        >
          <option value="(none)">(none)</option>
          {file.pages.flatMap((pg) =>
            pg.roots
              .map((r) => pg.shapes[r])
              .filter((s): s is DesignShape => Boolean(s) && s!.type === "frame")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {pg.id === pageId ? "→ " : "→ " + pg.name + " / "}
                  {s.name || "frame"}
                </option>
              )),
          )}
          {file.pages
            .filter((pg) => pg.id !== pageId)
            .map((pg) => (
              <option key={pg.id} value={pg.id}>
                {"→ page: "}
                {pg.name}
              </option>
            ))}
        </Select>
      </div>
    </div>
  );
}
