import { apiUrl, authFetch } from "@/lib/api";
// Diagram hierarki delegasi (tab Tim, dev-10 v3): CANVAS tak terbatas ala
// Excalidraw/draw.io, hold & drag untuk menggeser, Ctrl+scroll / tombol ± untuk
// zoom, ⌂ me-reset. Isinya tree/organisasi bercabang dari GRAF event delegasi
// nyata: conductor root, anak sejajar, cucu di bawah pemberi tugasnya; persona
// sama boleh muncul di dua cabang (dua sesi berbeda, label "dari <pemberi>")
// tanpa menyiratkan atasan permanen. Implementasi canvas murni CSS transform
// + Pointer Events (tanpa dependency).
// DS-1: Tailwind semantik, garis penghubung via varian before:/after:.
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as RPointerEvent } from "react";
import type { DelegationEdge } from "@yuika/contracts";
import {
  Check,
  Circle,
  CircleNotch,
  House,
  Minus,
  Plus,
} from "@phosphor-icons/react";
import { PersonaFace } from "./PersonaPicker";
import { Button, StateChip } from "./ui";

const PERSONA_NAME: Record<string, string> = {
  "yui-conductor": "Maestro Yui",
  "yui-planner": "Rommel Yui",
  "yui-analyst": "Nighty Yui",
  "yui-sherlock": "Watson Yui",
  "yui-scholar": "Pierre Yui",
  "yui-scribe": "Poe Yui",
  "yui-coder": "Hiro Yui",
  "yui-designer": "Picasso Yui",
  "yui-operator": "Neo Yui",
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
  return (
    <div
      className={`flex w-full max-w-[460px] items-start gap-3 rounded-lg2 border px-4 py-3 ${
        root ? "border-line-strong bg-raised" : "border-line bg-surface"
      } ${root ? "" : "min-w-[210px] max-w-[280px]"}`}
    >
      <PersonaFace personaId={personaId} size={root ? 34 : 26} />
      <div className="min-w-0 flex-1">
        <b className="block text-body font-semibold text-primary">
          {PERSONA_NAME[personaId] ?? personaId.replace("yui-", "")}
        </b>
        {subtitle && (
          <small className="text-caption text-dim">{subtitle}</small>
        )}
      </div>
      <StateChip state={state} className="mt-0.5 shrink-0" />
    </div>
  );
}

function TaskRows({ edges, now }: { edges: DelegationEdge[]; now: number }) {
  if (!edges.length) return null;
  return (
    <div className="mt-1.5 flex w-full max-w-[280px] flex-col gap-[3px]">
      {edges.map((e) => {
        const running = e.status === "running";
        const dur = e.doneAt ? e.doneAt - e.startedAt : now - e.startedAt;
        return (
          <span
            key={e.childSessionId}
            className="flex items-baseline gap-1.5 text-caption text-dim"
            title={e.goal}
          >
            <span className="shrink-0 self-center">
              {running ? (
                e.state === "idle" ? (
                  <Circle size={9} aria-hidden className="text-dim" />
                ) : (
                  <CircleNotch
                    size={9}
                    aria-hidden
                    className="animate-pulse text-accent"
                  />
                )
              ) : (
                <Check
                  size={9}
                  weight="bold"
                  aria-hidden
                  className="text-success"
                />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {e.goal.length > 64 ? e.goal.slice(0, 64) + "…" : e.goal}
            </span>
            <span className="shrink-0 tabular-nums">{fmtDur(dur)}</span>
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
    <ul
      // konektor: garis vertikal dari induk (before ul) + sambungan-T per anak
      // (before/after li); only-child otomatis mulus karena before ul tetap ada.
      aria-label="delegation branch"
      className={`relative m-0 flex list-none justify-center pt-7 before:absolute before:top-0 before:left-1/2 before:h-7 before:border-l before:border-muted before:content-[''] ${
        isRootBranch ? "" : "mt-1"
      }`}
    >
      {[...groups.entries()].map(([personaId, ds]) => {
        const working = ds.some(
          (d) => d.status === "running" && d.state !== "idle",
        );
        const doneCount = ds.filter((d) => d.status === "done").length;
        const state = working
          ? "working"
          : doneCount === ds.length
            ? "done"
            : "idle";
        const delegatedBy =
          ds[0]!.parentPersonaId !== "yui-conductor" && !isRootBranch
            ? `dari ${PERSONA_NAME[ds[0]!.parentPersonaId] ?? ds[0]!.parentPersonaId}`
            : undefined;
        return (
          <li
            key={personaId + ds[0]!.childSessionId}
            className="relative flex flex-col items-center px-4 pt-7 before:absolute before:top-0 before:right-1/2 before:h-7 before:w-1/2 before:border-t before:border-muted before:content-[''] after:absolute after:top-0 after:left-1/2 after:h-7 after:w-1/2 after:border-t after:border-l after:border-muted after:content-[''] first:before:border-t-0 last:after:border-t-0"
          >
            <Card
              personaId={personaId}
              state={state}
              subtitle={
                delegatedBy ??
                (ds.length > 1
                  ? `${ds.length} tasks · ${doneCount} done`
                  : undefined)
              }
            />
            <TaskRows edges={ds} now={now} />
            {/* delegasi turunan (mis. designer → coder) */}
            {ds.map((d) => (
              <Branch
                key={d.childSessionId}
                parentSessionId={d.childSessionId}
                edges={edges}
                now={now}
              />
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
  // run workflow aktif (merge Flow→Team 2026-11-08): tiap run = ROOT kedua di
  // canvas, conductor lead + cabang step (fase implisit di belakang; label
  // fase menyusul di tab Task). Kendali run ada di chat (WorkflowRunBar).
  const [runs, setRuns] = useState<
    Array<{
      id: string;
      status: string;
      name: string;
      leadSessionId?: string;
      phaseCount: number;
    }>
  >([]);

  // --- state canvas: pan {x,y} + zoom (transform-origin = pusat viewport) ---
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    x: number;
    y: number;
    px: number;
    py: number;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [dr, wr] = await Promise.all([
        authFetch(apiUrl(`/api/projects/${projectId}/delegations`)),
        authFetch(apiUrl(`/api/projects/${projectId}/workflows/runs`)),
      ]);
      if (dr.ok)
        setEdges(
          ((await dr.json()) as { delegations: DelegationEdge[] }).delegations,
        );
      if (wr.ok) {
        const list = (
          (await wr.json()) as {
            runs: Array<{
              id: string;
              status: string;
              workflow: { name: string; phaseCount: number };
              leadSessionId?: string;
            }>;
          }
        ).runs;
        setRuns(
          list
            .filter((r) => !["done", "failed", "stopped"].includes(r.status))
            .map((r) => ({
              id: r.id,
              status: r.status,
              name: r.workflow.name,
              leadSessionId: r.leadSessionId,
              phaseCount: r.workflow.phaseCount,
            })),
        );
      }
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
        setZoom((z) =>
          Math.min(
            ZOOM_MAX,
            Math.max(ZOOM_MIN, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)),
          ),
        );
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

  const leadState = (
    rootState === "thinking" || rootState === "working" ? "working" : "idle"
  ) as "working" | "idle";
  // FIX duplikasi tree (user 2026-11-08): lead run = sesi chat → root run &
  // root chat merender Branch utk SESI YANG SAMA → dua tree kembar. Run
  // yang lead-nya = sesi root digabung ke kartu root (subtitle Workflow ·,
  // state working); hanya run dgn lead sesi LAIN jadi root terpisah.
  const mergedRuns = runs.filter(
    (r) => r.leadSessionId && r.leadSessionId === rootSessionId,
  );
  const separateRuns = runs.filter(
    (r) => !(r.leadSessionId && r.leadSessionId === rootSessionId),
  );
  const mergedRun = mergedRuns[0];
  const mergedActive =
    mergedRun &&
    (mergedRun.status === "running" || mergedRun.status === "awaiting_gate");
  return (
    <div
      ref={canvasRef}
      role="tree"
      aria-label="Delegation hierarchy diagram, canvas"
      className={`relative h-[85vh] touch-none overflow-hidden rounded-lg2 border border-line bg-inset [background-image:radial-gradient(color-mix(in_srgb,var(--color-dim)_26%,transparent)_1px,transparent_1px)] [background-size:22px_22px] select-none ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ backgroundPosition: `${pan.x}px ${pan.y}px` }}
    >
      {/* kontrol zoom overlay, klik tidak ikut tergeser (stopPropagation) */}
      <div
        className="absolute top-3 right-3 z-10 flex items-center gap-1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Button
          size="sm"
          onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z * 1.2))}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <Plus size={12} weight="bold" aria-hidden />
        </Button>
        <span className="min-w-[42px] text-center text-caption tabular-nums text-dim">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          size="sm"
          onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z / 1.2))}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <Minus size={12} weight="bold" aria-hidden />
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setPan({ x: 0, y: 0 });
            setZoom(1);
          }}
          title="Reset to center"
          aria-label="Reset to center"
        >
          <House size={12} aria-hidden />
        </Button>
      </div>
      <div
        className="absolute inset-0 flex items-start justify-center pt-[34px] will-change-transform"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        <div className="mx-auto flex min-w-max justify-center px-6 pt-2 pb-4">
          <div className="flex flex-col items-center gap-14">
            {/* ROOT terpisah: run workflow aktif yang lead-nya BUKAN sesi
                root (run dari sesi lain / engine), fase implisit, cabang step
                milik sesi lead-nya masing-masing */}
            {separateRuns.map((r) => (
              <div key={r.id} className="flex flex-col items-center">
                <Card
                  personaId="yui-conductor"
                  state={
                    r.status === "running" || r.status === "awaiting_gate"
                      ? "working"
                      : "idle"
                  }
                  subtitle={`Workflow · ${r.name} · ${r.status.replace("_", " ")}`}
                  root
                />
                {r.leadSessionId && edges !== null && (
                  <Branch
                    parentSessionId={r.leadSessionId}
                    edges={edges}
                    now={now}
                    isRootBranch
                  />
                )}
              </div>
            ))}
            {/* ROOT chat: sesi aktif, run yang di-lead sesi ini DIGABUNG ke
                kartu (satu tree, tanpa kembar) */}
            <div className="flex flex-col items-center">
              {rootPersonaId ? (
                <Card
                  personaId={rootPersonaId}
                  state={mergedActive ? "working" : leadState}
                  subtitle={
                    mergedRun
                      ? `Workflow · ${mergedRun.name} · ${mergedRun.status.replace("_", " ")}` +
                        (mergedRuns.length > 1
                          ? ` (+${mergedRuns.length - 1})`
                          : "")
                      : "Lead This Session"
                  }
                  root
                />
              ) : (
                <p className="text-caption text-dim">
                  Open a session to see the live delegation structure.
                </p>
              )}
              {rootSessionId && edges !== null && (
                <Branch
                  parentSessionId={rootSessionId}
                  edges={edges}
                  now={now}
                  isRootBranch
                />
              )}
              {edges !== null && edges.length === 0 && runs.length === 0 && (
                <p className="mt-2.5 text-center text-caption text-dim">
                  No delegations yet,
                  <br /> The lead works alone, or ask it to delegate.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
