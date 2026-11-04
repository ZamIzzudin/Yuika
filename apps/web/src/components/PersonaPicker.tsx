"use client";
import { useEffect, useState } from "react";
import type { PersonaGrowth, PersonaInfo } from "@yui/contracts";
import { personaShape, SHAPE_ORDER, SHAPES, PERSONA_SHAPE } from "./orinShapes";
import { Modal } from "./ui";

export { PERSONA_SHAPE, SHAPES } from "./orinShapes";

/** P1-PER-4: hook growth persona — fetch + refresh ringan (dipakai picker & grid). */
export function usePersonaGrowth(): Map<string, PersonaGrowth> {
  const [growth, setGrowth] = useState<Map<string, PersonaGrowth>>(new Map());
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/personas/growth");
        if (!r.ok || !alive) return;
        const list = (await r.json()) as PersonaGrowth[];
        if (alive) setGrowth(new Map(list.map((g) => [g.id, g])));
      } catch {
        /* biarkan kosong — badge hilang saja */
      }
    };
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return growth;
}

/** Badge level kecil (P1-PER-4) — dipakai di kartu & baris persona. */
export function GrowthBadge({ g }: { g?: PersonaGrowth }) {
  if (!g) return null;
  const pct = g.nextLevelAt === null ? 100 : Math.min(100, Math.round((g.turns / g.nextLevelAt) * 100));
  return (
    <span
      className="flex items-center gap-1.5 rounded-pill bg-inset px-2 py-0.5 text-caption text-muted"
      title={`${g.turns} turn selesai · ${g.sessions} sesi · ${g.tasksDone} task done — level dari kerja nyata`}
    >
      <b className="font-semibold text-secondary">Lv {g.level}</b>
      <span className="h-[3px] w-10 overflow-hidden rounded-pill bg-line-strong">
        <span className="block h-full rounded-pill bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <small className="text-dim">{g.turns} turn</small>
    </span>
  );
}

/**
 * Wajah kecil persona (list/header) — mini-maskot Orin v4: bentuk + mata kapsul statis,
 * identik dengan portrait besar (orinShapes). Bentuk = identitas persona.
 */
export function PersonaFace({
  personaId,
  size = 22,
}: {
  personaId: string;
  size?: number;
}) {
  const s = personaShape(personaId);
  const w = 24 * s.es,
    h = 46 * s.es,
    gap = 36 * s.gs;
  return (
    <svg
      width={size}
      height={size}
      viewBox="-150 -150 300 300"
      aria-hidden
      focusable="false"
      style={{ display: "block", flex: "none" }}
    >
      <g fill={s.color} style={{ color: s.color }}>
        {s.geom}
      </g>
      <g transform={`translate(0 ${s.fy})`} fill="#0B0B0E">
        <rect x={-gap - w / 2} y={-h / 2} width={w} height={h} rx={w / 2} />
        <rect x={gap - w / 2} y={-h / 2} width={w} height={h} rx={w / 2} />
      </g>
    </svg>
  );
}

/** Kartu persona besar untuk pemilihan di tengah layar (scope Workspace). */
export function PersonaGrid({
  personas,
  onPick,
}: {
  personas: PersonaInfo[];
  onPick: (p: PersonaInfo) => void;
}) {
  const [showShapes, setShowShapes] = useState(false);
  const growth = usePersonaGrowth();
  const cardBase =
    "flex cursor-pointer flex-col items-start gap-2 rounded-card border border-line bg-surface px-4 py-4 text-left transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:border-line-strong hover:bg-hover";
  return (
    <>
      <div className="grid w-full max-w-[720px] grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        {personas.map((p) => (
          <button key={p.id} className={cardBase} onClick={() => onPick(p)}>
            <span className="flex items-center gap-2.5">
              <PersonaFace personaId={p.id} size={44} />
              <b className="text-body font-semibold text-primary">{p.name}</b>
            </span>
            <p className="text-caption leading-5 text-muted">{p.description}</p>
            <GrowthBadge g={growth.get(p.id)} />
          </button>
        ))}
        {/* Kartu katalog bentuk — satu sel grid, ukurannya identik kartu persona */}
        <button className={cardBase} onClick={() => setShowShapes(true)}>
          <span className="flex items-center gap-2.5" aria-hidden>
            {(["pill", "star", "flower"] as const).map((k) => {
              const s = SHAPES[k];
              return (
                <svg key={k} width={30} height={30} viewBox="-150 -150 300 300" focusable="false">
                  <g fill={s.color} style={{ color: s.color }}>
                    {s.geom}
                  </g>
                </svg>
              );
            })}
          </span>
          <b className="text-body font-semibold text-primary">15 Bentuk Orin</b>
          <p className="text-caption leading-5 text-muted">Katalog bentuk maskot — identitas persona mendatang.</p>
        </button>
      </div>
      {showShapes && <ShapeGalleryModal onClose={() => setShowShapes(false)} />}
    </>
  );
}

/** Modal galeri 15 bentuk Orin (dev 10) — verifikasi render + referensi
 *  pilihan identitas persona mendatang (Analyst, Operator, dst.). Pemetaan
 *  persona ada di PERSONA_SHAPE; pemilihan bebas user menyusul. */
function ShapeGalleryModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="15 Bentuk Orin" wide>
      <p className="mb-3 max-w-[560px] text-caption leading-5 text-muted">
        Satu rig mata dipakai semua bentuk — urutan = indeks <code className="font-mono">shape</code> 0–14 di Rive.
        Bertanda = sudah dipakai persona; sisanya bebas untuk persona mendatang.
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
        {SHAPE_ORDER.map((k, i) => {
          const s = SHAPES[k];
          const owner = Object.entries(PERSONA_SHAPE).find(([, v]) => v === k)?.[0];
          return (
            <div
              key={k}
              className={`flex flex-col items-center gap-1 rounded-lg2 border px-2 py-3 text-center ${
                owner ? "border-accent/50 bg-inset" : "border-line bg-inset"
              }`}
            >
              <svg width={64} height={64} viewBox="-150 -150 300 300" aria-hidden focusable="false">
                <g fill={s.color} style={{ color: s.color }}>
                  {s.geom}
                </g>
              </svg>
              <b className="text-body font-semibold text-primary">{s.name}</b>
              <small className="text-caption text-dim">
                {owner ? owner.replace("yui-", "yui · ") : `bebas · ${i}`}
              </small>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function PersonaPicker({
  personas,
  activeId,
  onPick,
}: {
  personas: PersonaInfo[];
  activeId: string | null;
  onPick: (p: PersonaInfo) => void;
}) {
  const growth = usePersonaGrowth();
  return (
    <nav aria-label="Persona" className="flex flex-col gap-0.5">
      {personas.map((p) => (
        <button
          key={p.id}
          aria-current={p.id === activeId ? "true" : undefined}
          className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md2 border px-2 py-1.5 text-left transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
            p.id === activeId
              ? "border-line bg-hover"
              : "border-transparent hover:bg-hover"
          }`}
          onClick={() => onPick(p)}
        >
          <PersonaFace personaId={p.id} size={22} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <h3 className="text-body font-semibold text-primary">{p.name}</h3>
            <p className="truncate text-caption text-dim">{p.description}</p>
            <GrowthBadge g={growth.get(p.id)} />
          </span>
        </button>
      ))}
    </nav>
  );
}
