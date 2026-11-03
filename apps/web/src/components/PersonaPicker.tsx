"use client";
import type { PersonaInfo } from "@yui/contracts";
import { personaShape } from "./orinShapes";

export { PERSONA_SHAPE, SHAPES } from "./orinShapes";

/**
 * Wajah kecil persona (list/header) — mini-maskot Orin v4: bentuk + mata kapsul statis,
 * identik dengan portrait besar (orinShapes). Bentuk = identitas persona.
 */
export function PersonaFace({ personaId, size = 22 }: { personaId: string; size?: number }) {
  const s = personaShape(personaId);
  const w = 24 * s.es, h = 46 * s.es, gap = 36 * s.gs;
  return (
    <svg
      width={size}
      height={size}
      viewBox="-150 -150 300 300"
      aria-hidden
      focusable="false"
      style={{ display: "block", flex: "none" }}
    >
      <g fill={s.color}>{s.geom}</g>
      <g transform={`translate(0 ${s.fy})`} fill="#0B0B0E">
        <rect x={-gap - w / 2} y={-h / 2} width={w} height={h} rx={w / 2} />
        <rect x={gap - w / 2} y={-h / 2} width={w} height={h} rx={w / 2} />
      </g>
    </svg>
  );
}

/** Kartu persona besar untuk pemilihan di tengah layar (scope Workspace). */
export function PersonaGrid({ personas, onPick }: { personas: PersonaInfo[]; onPick: (p: PersonaInfo) => void }) {
  return (
    <div className="persona-grid">
      {personas.map((p) => (
        <button key={p.id} className="persona-card" onClick={() => onPick(p)}>
          <span className="face">
            <PersonaFace personaId={p.id} size={44} />
          </span>
          <b>{p.name}</b>
          <p>{p.description}</p>
        </button>
      ))}
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
          </span>
        </button>
      ))}
    </nav>
  );
}
