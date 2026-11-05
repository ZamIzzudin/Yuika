"use client";
import type { PersonaState } from "@yuika/contracts";
import { OrinPortrait } from "./OrinPortrait";
import { RiveStage, warmRive } from "./rive/RiveStage";
import { useEffect } from "react";

/**
 * Portrait persona — Orin v8 (rig geometris). Sejak P1-PER-3: Rive duluan
 * (`/rive/orin.riv`, kontrak riveMap.ts), SVG OrinPortrait menjadi fallback
 * permanen (aset artist P1-PER-2 belum ada → tampilan hari ini tetap SVG).
 * compact = wajah kecil header chat; hero = empty state (pola agent-chat-empty
 * OpenBot). Grid persona banyak tetap PersonaFace SVG (satu WebGL context per
 * canvas — hero saja yang Rive).
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
  useEffect(() => {
    warmRive(); // pre-load aset saat idle — portrait pertama siap instan
  }, []);

  if (variant === "compact") {
    return (
      <RiveStage
        state={state}
        personaId={personaId}
        size={40}
        fallback={<OrinPortrait state={state} personaId={personaId} size={40} />}
      />
    );
  }
  return (
    <div className="portrait-hero-wrap" data-state={state}>
      <RiveStage
        state={state}
        personaId={personaId}
        size={220}
        fallback={<OrinPortrait state={state} personaId={personaId} size={220} />}
      />
      <span className="sr-only">{name}</span>
    </div>
  );
}
