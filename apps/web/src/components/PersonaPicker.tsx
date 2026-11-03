"use client";
import type { PersonaInfo } from "@yui/contracts";

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
    <div className="persona-grid">
      {personas.map((p) => (
        <button key={p.id} className={`persona-card${p.id === activeId ? " active" : ""}`} onClick={() => onPick(p)}>
          <h3>{p.name}</h3>
          <p>{p.description}</p>
        </button>
      ))}
    </div>
  );
}
