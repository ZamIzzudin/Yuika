"use client";
import type { PersonaState } from "@yuika/contracts";
import { OrinPortrait } from "./OrinPortrait";

/**
 * Portrait persona — Orin v4 (rig geometris, docs/Orin v4; .riv menyusul P1-PER-2
 * dengan input shape 0–4 + mood 0–5, hirarki identik). compact = wajah kecil header
 * chat; hero = empty state (pola agent-chat-empty OpenBot).
 */
export function PersonaPortrait({
  name,
  state,
  personaId,
  variant = "hero",
}: {
  name: string;
  state: PersonaState;
  personaId?: string;
  variant?: "compact" | "hero";
}) {
  if (variant === "compact") {
    return <OrinPortrait state={state} personaId={personaId} size={40} />;
  }
  return (
    <div className="portrait-hero-wrap" data-state={state}>
      <OrinPortrait state={state} personaId={personaId} size={220} />
      <span className="sr-only">{name}</span>
    </div>
  );
}
