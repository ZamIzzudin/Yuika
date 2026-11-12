"use client";
// D90: Layers panel ala Canva/Figma — tree Pages → Screen (frame root) →
// komponen nested. Menggantikan dropdown Pages di panel kanan. Fitur:
// klik = select (sinkron canvas), double-click label = rename inline
// (nama shape = kontrak komponen design-to-code), eye toggle hidden,
// filter nama (menemukan komponen lewat pencarian), tombol focus =
// zoom canvas ke shape. Z-order: anak paling depan tampil paling atas.
import { useMemo, useState } from "react";
import {
  CaretDown,
  CaretRight,
  Circle,
  Crosshair,
  Eye,
  EyeSlash,
  FrameCorners,
  Monitor,
  Plus,
  Rectangle,
  TextAa,
} from "@phosphor-icons/react";
import type { DesignFile, DesignPage, DesignShape } from "@yuika/core/design";

interface Props {
  file: DesignFile;
  pageId: string;
  sel: Set<string>;
  onPage: (id: string) => void;
  onSelect: (id: string, additive: boolean) => void;
  onRename: (id: string, name: string) => void;
  onToggleHidden: (id: string, hidden: boolean) => void;
  onFocus: (id: string) => void;
  onAddPage: () => void;
}

function typeIcon(s: DesignShape): React.ReactNode {
  if (s.type === "frame") return <FrameCorners size={12} />;
  if (s.type === "circle") return <Circle size={12} />;
  if (s.type === "text") return <TextAa size={12} />;
  return <Rectangle size={12} />;
}

/** Rantai leluhur (frame) dari sebuah shape — dipakai auto-expand saat
 *  shape terpilih lewat klik canvas agar node-nya terlihat di tree. */
function ancestors(page: DesignPage, id: string): string[] {
  const out: string[] = [];
  let p = page.shapes[id]?.parentId;
  while (p) {
    out.push(p);
    p = page.shapes[p]?.parentId;
  }
  return out;
}

export function DesignLayers(props: Props): React.ReactElement {
  const { file, pageId, sel } = props;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [filter, setFilter] = useState("");

  const page = file.pages.find((p) => p.id === pageId) ?? null;

  const selAncestors = useMemo(() => {
    const s = new Set<string>();
    if (page) for (const id of sel) for (const a of ancestors(page, id)) s.add(a);
    return s;
  }, [page, sel]);

  const commitRename = (): void => {
    if (!editing) return;
    const name = editing.draft.trim();
    if (name) props.onRename(editing.id, name);
    setEditing(null);
  };

  /** Satu baris node shape (rekursif untuk frame). */
  const row = (shape: DesignShape, pg: DesignPage, depth: number): React.ReactNode => {
    const selected = sel.has(shape.id);
    const isFrame = shape.type === "frame";
    const isScreen = isFrame && !shape.parentId && (shape as { isScreen?: boolean }).isScreen !== false;
    const autoOpen = selAncestors.has(shape.id);
    const open = autoOpen || !collapsed.has(shape.id);
    const kids = isFrame
      ? [...(shape as { children: string[] }).children].reverse().map((c) => pg.shapes[c]).filter(Boolean)
      : [];
    return (
      <div key={shape.id}>
        <div
          className={`group flex cursor-default items-center gap-1 rounded px-1.5 py-[3px] text-xs ${
            selected ? "bg-accent/25 text-fg" : "text-fg/80 hover:bg-inset"
          }`}
          style={{ paddingLeft: 6 + depth * 12 }}
          onClick={(e) => {
            e.stopPropagation();
            props.onSelect(shape.id, e.shiftKey || e.metaKey || e.ctrlKey);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing({ id: shape.id, draft: shape.name });
          }}
          title={`${shape.name} (double-click to rename)`}
        >
          {isFrame ? (
            <button
              className="shrink-0 text-dim hover:text-fg"
              onClick={(e) => {
                e.stopPropagation();
                setCollapsed((c) => {
                  const n = new Set(c);
                  if (n.has(shape.id)) n.delete(shape.id);
                  else n.add(shape.id);
                  return n;
                });
              }}
              tabIndex={-1}
            >
              {open ? <CaretDown size={11} /> : <CaretRight size={11} />}
            </button>
          ) : (
            <span className="w-[11px] shrink-0" />
          )}
          <span className={`shrink-0 ${selected ? "text-accent" : "text-dim"}`}>{typeIcon(shape)}</span>
          {editing?.id === shape.id ? (
            <input
              autoFocus
              className="min-w-0 flex-1 rounded border border-accent bg-inset px-1 py-0 text-xs"
              value={editing.draft}
              onChange={(e) => setEditing({ id: shape.id, draft: e.target.value })}
              onBlur={() => commitRename()}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                else if (e.key === "Escape") setEditing(null);
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate">{shape.name || shape.type}</span>
          )}
          {isScreen ? (
            <span className="mr-0.5 shrink-0 text-accent" title="Screen (appears in prototype)">
              <Monitor size={11} />
            </span>
          ) : null}
          {shape.hidden ? (
            <button
              className="shrink-0 text-dim hover:text-fg"
              title="Show"
              onClick={(e) => {
                e.stopPropagation();
                props.onToggleHidden(shape.id, false);
              }}
              tabIndex={-1}
            >
              <EyeSlash size={11} />
            </button>
          ) : (
            <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
              <button
                className="text-dim hover:text-fg"
                title="Zoom to this shape"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onFocus(shape.id);
                }}
                tabIndex={-1}
              >
                <Crosshair size={11} />
              </button>
              <button
                className="text-dim hover:text-fg"
                title="Hide"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onToggleHidden(shape.id, true);
                }}
                tabIndex={-1}
              >
                <Eye size={11} />
              </button>
            </span>
          )}
        </div>
        {isFrame && open ? kids.map((k) => row(k as DesignShape, pg, depth + 1)) : null}
      </div>
    );
  };

  /** Mode filter: daftar datar semua shape yang cocok (lintas halaman),
   *  dengan breadcrumb Page / Frame agar mudah dikenali. */
  const filterRows = (q: string): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    const lq = q.toLowerCase();
    for (const pg of file.pages) {
      for (const s of Object.values(pg.shapes)) {
        if (!(s.name || s.type).toLowerCase().includes(lq)) continue;
        const trail = [...ancestors(pg, s.id).reverse().map((a) => pg.shapes[a]?.name), pg.name]
          .filter(Boolean)
          .join(" / ");
        out.push(
          <div
            key={`${pg.id}:${s.id}`}
            className={`flex cursor-default items-center gap-1 rounded px-1.5 py-[3px] text-xs ${
              sel.has(s.id) ? "bg-accent/25 text-fg" : "text-fg/80 hover:bg-inset"
            }`}
            onClick={(e) => {
              if (pg.id !== pageId) props.onPage(pg.id);
              props.onSelect(s.id, e.shiftKey);
            }}
            onDoubleClick={() => {
              if (pg.id !== pageId) props.onPage(pg.id);
              props.onFocus(s.id);
            }}
            title={`${trail} — click to select, double-click to zoom`}
          >
            <span className="shrink-0 text-dim">{typeIcon(s)}</span>
            <span className="min-w-0 flex-1 truncate">{s.name || s.type}</span>
            <span className="max-w-[45%] shrink-0 truncate text-[10px] text-dim">{trail}</span>
          </div>,
        );
      }
    }
    return out;
  };

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line md:flex">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-dim">Layers</span>
        <button className="text-dim hover:text-fg" title="Add page" onClick={() => props.onAddPage()}>
          <Plus size={14} />
        </button>
      </div>
      <div className="border-b border-line px-2 py-1.5">
        <input
          className="w-full rounded border border-line bg-inset px-2 py-1 text-xs placeholder:text-dim"
          placeholder="Filter by name…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1" onClick={() => setEditing(null)}>
        {filter.trim() ? (
          filterRows(filter.trim()).length > 0 ? (
            filterRows(filter.trim())
          ) : (
            <div className="px-2 py-3 text-xs text-dim">No shapes match “{filter.trim()}”.</div>
          )
        ) : (
          file.pages.map((pg) => {
            const active = pg.id === pageId;
            return (
              <div key={pg.id} className="mb-0.5">
                <div
                  className={`flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs font-medium ${
                    active ? "bg-inset text-fg" : "text-dim hover:text-fg"
                  }`}
                  onClick={() => props.onPage(pg.id)}
                  title={`Page: ${pg.name}`}
                >
                  <button
                    className="shrink-0 hover:text-fg"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsed((c) => {
                        const n = new Set(c);
                        if (n.has(pg.id)) n.delete(pg.id);
                        else n.add(pg.id);
                        return n;
                      });
                    }}
                    tabIndex={-1}
                  >
                    {active && !collapsed.has(pg.id) ? <CaretDown size={11} /> : <CaretRight size={11} />}
                  </button>
                  <span className="min-w-0 flex-1 truncate">{pg.name}</span>
                  <span className="shrink-0 text-[10px] text-dim">{Object.keys(pg.shapes).length}</span>
                </div>
                {active && !collapsed.has(pg.id)
                  ? [...pg.roots].reverse().map((r) => pg.shapes[r]).filter(Boolean).map((s) => row(s as DesignShape, pg, 1))
                  : null}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
