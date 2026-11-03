"use client";
import type { PersonaState } from "@yui/contracts";

const EMOJI: Record<PersonaState, string> = {
  idle: "😴",
  thinking: "💭",
  working: "🔧",
  awaiting_input: "🙋",
  done: "✅",
  error: "⚠️",
  celebrating: "🎉",
};

/**
 * Placeholder CSS portrait — mapping event → state SUDAH final (kontrak persona.state).
 * D8 (PLAN §7.6): ganti isi komponen ini dengan <Rive> saat file .riv siap; ABI-nya
 * sudah disiapkan (props personaId + state). Timebox demo: 3 jam, lalu tetap fallback ini.
 */
export function PersonaPortrait({ name, state }: { name: string; state: PersonaState }) {
  return (
    <div>
      <div className="portrait" data-state={state} aria-label={`${name} ${state}`}>
        {EMOJI[state]}
      </div>
      <div className="state-label">
        {name} · {state}
      </div>
    </div>
  );
}
