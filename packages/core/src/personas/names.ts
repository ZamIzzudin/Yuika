/**
 * Alias tampilan persona (keputusan user 2026-11: konsep "tokoh legendaris + Yui").
 * ID teknis `yui-*` TIDAK berubah (folder, binding skill, roster, sesi lama),
 * ini murni label tampilan; sumber nama resmi tetap persona.yaml.
 * Fallback untuk persona kustom (bukan 8 bawaan): "Yui <Short>".
 */
export const PERSONA_ALIAS: Record<string, string> = {
  "yui-conductor": "Maestro Yui",
  "yui-planner": "Rommel Yui",
  // D26: "Sherlock" dilepas utk persona QA ke-9, Analyst kini "Nighty"
  // (dipendekkan user dari "Nightingale", Florence Nightingale, pelopor
  // visualisasi data; mudah diganti: cukup baris ini + persona.yaml + 2 map web).
  "yui-analyst": "Nighty Yui",
  "yui-scholar": "Pierre Yui",
  "yui-scribe": "Poe Yui",
  "yui-coder": "Hiro Yui",
  "yui-designer": "Picasso Yui",
  "yui-operator": "Neo Yui",
  "yui-sherlock": "Watson Yui",
};

export function personaDisplayName(id: string): string {
  const alias = PERSONA_ALIAS[id];
  if (alias) return alias;
  const short = id.replace(/^yui-/, "");
  return `Yui ${short.charAt(0).toUpperCase()}${short.slice(1)}`;
}
