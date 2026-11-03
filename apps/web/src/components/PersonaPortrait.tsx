"use client";
import type { PersonaState } from "@yui/contracts";
import { OrinPortrait } from "./OrinPortrait";

const STATE_COLOR: Record<PersonaState, string> = {
  idle: "var(--muted)",
  thinking: "#6ca8f0",
  working: "var(--warn)",
  awaiting_input: "#c56cf0",
  done: "var(--good)",
  error: "var(--bad)",
  celebrating: "#f0d76c",
};

/**
 * Portrait persona — W3-B2/W3-C1: placeholder animasi Orin (SVG, rig siap Rive).
 * Keputusan demo: fallback SVG animasi dipakai (bukan .riv komunitas) karena rig &
 * keyframe Orin sudah final di docs/ — asset .riv dibangun di P1-PER-2 dengan
 * hirarki bone yang sama. Mapping event→state tetap dari kontrak `persona.state`.
 */
export function PersonaPortrait({ name, state, personaId }: { name: string; state: PersonaState; personaId?: string }) {
  return (
    <div className="portrait-wrap" data-state={state}>
      <OrinPortrait state={state} personaId={personaId} />
      <div className="state-label">
        {name} · <span style={{ color: STATE_COLOR[state] }}>{state}</span>
      </div>
    </div>
  );
}
