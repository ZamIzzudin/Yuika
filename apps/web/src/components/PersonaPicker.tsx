"use client";
import { useEffect, useState } from "react";
import type { PersonaGrowth, PersonaInfo } from "@yui/contracts";
import { personaShape, SHAPE_ORDER, SHAPES, PERSONA_SHAPE } from "./orinShapes";

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
    <span className="growth-badge" title={`${g.turns} turn selesai · ${g.sessions} sesi · ${g.tasksDone} task done — level dari kerja nyata`}>
      <b>{g.level}</b>
      <span className="growth-bar">
        <span className="growth-fill" style={{ width: `${pct}%` }} />
      </span>
      <small>{g.turns} turn</small>
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
  return (
    <>
      <div className="persona-grid">
        {personas.map((p) => (
          <button key={p.id} className="persona-card" onClick={() => onPick(p)}>
            <div className="persona-card-name">
              <span className="face">
                <PersonaFace personaId={p.id} size={44} />
              </span>
              <b>{p.name}</b>
            </div>
            <p>{p.description}</p>
            <GrowthBadge g={growth.get(p.id)} />
          </button>
        ))}
        {/* Kartu katalog bentuk — satu sel grid, ukurannya identik kartu persona */}
        <button
          className="persona-card shape-card"
          onClick={() => setShowShapes(true)}
        >
          <span className="face shape-trio" aria-hidden>
            {(["pill", "star", "flower"] as const).map((k) => {
              const s = SHAPES[k];
              return (
                <svg
                  key={k}
                  width={30}
                  height={30}
                  viewBox="-150 -150 300 300"
                  focusable="false"
                >
                  <g fill={s.color} style={{ color: s.color }}>
                    {s.geom}
                  </g>
                </svg>
              );
            })}
          </span>
          <b>15 Bentuk Orin</b>
          <p>Katalog bentuk maskot — identitas persona mendatang.</p>
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Galeri bentuk Orin"
      onClick={onClose}
    >
      <div className="shape-modal" onClick={(e) => e.stopPropagation()}>
        <header className="settings-head">
          <b>15 Bentuk Orin</b>
          <button
            className="settings-close"
            onClick={onClose}
            aria-label="Tutup"
          >
            ✕
          </button>
        </header>
        <p className="shape-modal-hint">
          Satu rig mata dipakai semua bentuk — urutan = indeks{" "}
          <code>shape</code> 0–14 di Rive. Bertanda = sudah dipakai persona;
          sisanya bebas untuk persona mendatang.
        </p>
        <div className="shape-grid">
          {SHAPE_ORDER.map((k, i) => {
            const s = SHAPES[k];
            const owner = Object.entries(PERSONA_SHAPE).find(
              ([, v]) => v === k,
            )?.[0];
            return (
              <div
                key={k}
                className="shape-cell"
                data-owned={owner ? "" : undefined}
              >
                <svg
                  width={64}
                  height={64}
                  viewBox="-150 -150 300 300"
                  aria-hidden
                  focusable="false"
                >
                  <g fill={s.color} style={{ color: s.color }}>
                    {s.geom}
                  </g>
                </svg>
                <b>{s.name}</b>
                <small>
                  {owner ? owner.replace("yui-", "yui · ") : `bebas · ${i}`}
                </small>
              </div>
            );
          })}
        </div>
      </div>
    </div>
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
    <nav className="persona-list" aria-label="Persona">
      {personas.map((p) => (
        <button
          key={p.id}
          className="persona-row"
          data-active={p.id === activeId ? "" : undefined}
          onClick={() => onPick(p)}
        >
          <span className="face">
            <PersonaFace personaId={p.id} size={22} />
          </span>
          <span>
            <h3>{p.name}</h3>
            <p>{p.description}</p>
            <GrowthBadge g={growth.get(p.id)} />
          </span>
        </button>
      ))}
    </nav>
  );
}
