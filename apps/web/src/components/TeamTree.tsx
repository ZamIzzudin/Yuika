// Diagram hierarki delegasi (tab Tim, dev-10 v3): CANVAS tak terbatas ala
// Excalidraw/draw.io — hold & drag untuk menggeser, Ctrl+scroll / tombol ± untuk
// zoom, ⌂ me-reset. Isinya tree/organisasi bercabang dari GRAF event delegasi
// nyata: conductor root, anak sejajar, cucu di bawah pemberi tugasnya; persona
// sama boleh muncul di dua cabang (dua sesi berbeda, label "dari <pemberi>")
// tanpa menyiratkan atasan permanen. Implementasi canvas murni CSS transform
// + Pointer Events (tanpa dependency).
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as RPointerEvent } from "react";
import type { DelegationEdge } from "@yui/contracts";
import { PersonaFace } from "./PersonaPicker";

const PERSONA_NAME: Record<string, string> = {
  "yui-conductor": "Yui Conductor",
  "yui-scholar": "Yui Scholar",
  "yui-scribe": "Yui Scribe",
  "yui-coder": "Yui Coder",
  "yui-designer": "Yui Designer",
};
const STATE_LABEL: Record<string, string> = {
  idle: "menunggu",
  thinking: "berpikir",
  working: "bekerja",
};
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2.5;

export function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}d`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}d`;
  const h = Math.floor(m / 60);
  return `${h}j ${m % 60}m`;
}

function Card({
  personaId,
  state,
  subtitle,
  root,
}: {
  personaId: string;
  state: "working" | "done" | "idle";
  subtitle?: string;
  root?: boolean;
}) {
  const label = state === "done" ? "selesai" : STATE_LABEL[state] ?? "menunggu";
  return (
    <div className={"org-card" + (root ? " org-root" : "")} data-s={state}>
      <span className="face">
        <PersonaFace personaId={personaId} size={root ? 34 : 26} />
      </span>
      <div className="org-body">
        <b>{PERSONA_NAME[personaId] ?? personaId.replace("yui-", "")}</b>
        {subtitle && <small>{subtitle}</small>}
      </div>
      <span className="state-chip" data-s={state}>
        <i />
        {label}
      </span>
    </div>
  );
}

function TaskRows({ edges, now }: { edges: DelegationEdge[]; now: number }) {
  if (!edges.length) return null;
  return (
    <div className="org-tasks">
      {edges.map((e) => {
        const running = e.status === "running";
        const dur = e.doneAt ? e.doneAt - e.startedAt : now - e.startedAt;
        return (
          <span key={e.childSessionId} className="org-task" title={e.goal}>
            <span className="dot">{running ? (e.state === "idle" ? "○" : "◐") : "✓"}</span>
            <span className="goal-text">{e.goal.length > 64 ? e.goal.slice(0, 64) + "…" : e.goal}</span>
            <span className="dur">{fmtDur(dur)}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Rekursif: cabang = delegasi dari satu sesi, dikelompokkan per persona anak. */
function Branch({
  parentSessionId,
  edges,
  now,
  isRootBranch,
}: {
  parentSessionId: string;
  edges: DelegationEdge[];
  now: number;
  isRootBranch?: boolean;
}) {
  const mine = edges.filter((e) => e.parentSessionId === parentSessionId);
  if (!mine.length) return null;
  // grup per persona (kartu seragam per persona; tugas di bawahnya)
  const groups = new Map<string, DelegationEdge[]>();
  for (const e of mine) {
    const arr = groups.get(e.personaId) ?? [];
    arr.push(e);
    groups.set(e.personaId, arr);
  }
  return (
    <ul className={"org-branches" + (isRootBranch ? " root" : "")} aria-label="cabang delegasi">
      {[...groups.entries()].map(([personaId, ds]) => {
        const working = ds.some((d) => d.status === "running" && d.state !== "idle");
        const doneCount = ds.filter((d) => d.status === "done").length;
        const state = working ? "working" : doneCount === ds.length ? "done" : "idle";
        const delegatedBy = ds[0]!.parentPersonaId !== "yui-conductor" && !isRootBranch ? `dari ${PERSONA_NAME[ds[0]!.parentPersonaId] ?? ds[0]!.parentPersonaId}` : undefined;
        return (
          <li key={personaId + ds[0]!.childSessionId} className="org-branch">
            <span className="org-link" aria-hidden title="mendelegasikan tugas" />
            <Card
              personaId={personaId}
              state={state}
              subtitle={delegatedBy ?? (ds.length > 1 ? `${ds.length} tugas · ${doneCount} selesai` : undefined)}
            />
            <TaskRows edges={ds} now={now} />
            {/* delegasi turunan (mis. designer → coder) */}
            {ds.map((d) => (
              <Branch key={d.childSessionId} parentSessionId={d.childSessionId} edges={edges} now={now} />
            ))}
          </li>
        );
      })}
    </ul>
  );
}

export function TeamTree({
  projectId,
  rootSessionId,
  rootPersonaId,
  rootState,
}: {
  projectId: string;
  rootSessionId: string | null;
  rootPersonaId: string | null;
  rootState: string;
}) {
  const [edges, setEdges] = useState<DelegationEdge[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // --- state canvas: pan {x,y} + zoom (transform-origin = pusat viewport) ---
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/delegations`);
      if (r.ok) setEdges(((await r.json()) as { delegations: DelegationEdge[] }).delegations);
    } catch {
      /* biarkan data lama */
    }
    setNow(Date.now());
  }, [projectId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5_000);
    return () => clearInterval(t);
  }, [load]);

  // Wheel non-passive: scroll biasa = geser canvas; Ctrl/⌘+scroll = zoom.
  // (React onWheel bersifat passive → tak bisa preventDefault; pasang native.)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
      } else {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // hanya klik-kiri yang menggeser
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    setDragging(true);
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) });
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const leadState = (rootState === "thinking" || rootState === "working" ? "working" : "idle") as "working" | "idle";
  return (
    <div
      ref={canvasRef}
      className={"org-canvas" + (dragging ? " dragging" : "")}
      role="tree"
      aria-label="Diagram hierarki delegasi — kanvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ backgroundPosition: `${pan.x}px ${pan.y}px` }}
    >
      {/* kontrol zoom overlay — klik tidak ikut tergeser (stopPropagation) */}
      <div className="org-controls" onPointerDown={(e) => e.stopPropagation()}>
        <button className="btn secondary" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z * 1.2))} title="Perbesar">
          +
        </button>
        <span className="org-zoom">{Math.round(zoom * 100)}%</span>
        <button className="btn secondary" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z / 1.2))} title="Perkecil">
          −
        </button>
        <button
          className="btn secondary"
          onClick={() => {
            setPan({ x: 0, y: 0 });
            setZoom(1);
          }}
          title="Reset ke tengah"
        >
          ⌂
        </button>
      </div>
      <p className="org-canvas-hint">Tahan &amp; geser untuk menjelajah · scroll = geser · Ctrl+scroll = zoom</p>
      <div className="org-board" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <div className="org-tree">
          <div className="org-node">
            {rootPersonaId ? (
              <Card personaId={rootPersonaId} state={leadState} subtitle="lead sesi ini" root />
            ) : (
              <p className="task-empty">Buka sesi untuk melihat struktur delegasi live.</p>
            )}
            {rootSessionId && edges !== null && (
              <Branch parentSessionId={rootSessionId} edges={edges} now={now} isRootBranch />
            )}
            {edges !== null && edges.length === 0 && (
              <p className="dim org-hint">Belum ada delegasi — lead mengerjakan sendiri atau minta ia mendelegasikan.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
