"use client";
import type { PersonaInfo } from "@yui/contracts";

/** Warna wajah per persona — hue dari palet seri chart OpenBot (tervalidasi kontras di canvas gelap). */
export const PERSONA_TINT: Record<string, string> = {
  "yui-conductor": "#42a0ff",
  "yui-scholar": "#6bc7d9",
  "yui-scribe": "#d6adf2",
  "yui-coder": "#61c985",
};

/** Monogram kecil untuk wajah persona di list/header (Orin full-rig dipakai di portrait). */
export function PersonaFace({ personaId, size = 22 }: { personaId: string; size?: number }) {
  const tint = PERSONA_TINT[personaId] ?? "#979797";
  const initial = personaId.replace("yui-", "")[0]?.toUpperCase() ?? "?";
  return (
    <span
      className="face-mark"
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: size >= 30 ? 8 : 6,
        background: `color-mix(in srgb, ${tint} 18%, transparent)`,
        color: tint,
        fontSize: size >= 30 ? 13 : 11,
        fontWeight: 600,
        border: `1px solid color-mix(in srgb, ${tint} 40%, transparent)`,
      }}
    >
      {initial}
    </span>
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
