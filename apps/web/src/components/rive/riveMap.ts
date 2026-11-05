/**
 * Kontrak pemetaan Yuika ↔ Rive state machine "Mascot" (docs/ART-DIRECTION.md §5).
 * Runtime membinding input BY-NAME — nama & rentang nilai di file ini WAJIB
 * identik dengan yang dibuat artist di editor Rive.
 *
 * Input number: mood (0–5) · shape (0–14, urutan SHAPE_ORDER) ·
 *   audioLevel (0–100) · lookX/lookY (−1..1, parallax kursor).
 * Input trigger: blink · nod · giggle · hum · look · tilt · yawn · hiccup · wake.
 *
 * Mapping PersonaState (7) → mood (6), persis OrinPortrait SVG:
 *   idle→0 · awaiting_input→1(listening) · thinking→2 · working→3(speaking,
 *   halo+audioLevel) · done/celebrating→4(happy, +trigger bounce) · error→5(confused).
 */
import type { PersonaState } from "@yuika/contracts";
import { SHAPE_ORDER, type OrinShapeKey } from "../orinShapes";

/** Nama state machine di file .riv (satu-satunya). */
export const RIVE_STATE_MACHINE = "Mascot";

/** Path aset default — kosong/404 berarti fallback SVG (OrinPortrait). */
export const DEFAULT_RIVE_SRC = "/rive/orin.riv";

export const MOOD_NAMES = [
  "idle",
  "listening",
  "thinking",
  "speaking",
  "happy",
  "confused",
] as const;

/** PersonaState (7) → mood (6). */
export const RIVE_MOOD: Record<PersonaState, number> = {
  idle: 0,
  awaiting_input: 1,
  thinking: 2,
  working: 3,
  done: 4,
  celebrating: 4,
  error: 5,
};

/** OrinShapeKey → indeks input `shape` (urutan SHAPE_ORDER). */
export function riveShapeIndex(key: OrinShapeKey): number {
  return SHAPE_ORDER.indexOf(key);
}

/** Semua input number pada kontrak (untuk panel QA & validasi artist). */
export const RIVE_NUMBER_INPUTS = [
  "mood",
  "shape",
  "audioLevel",
  "lookX",
  "lookY",
] as const;

/** Semua input trigger pada kontrak. */
export const RIVE_TRIGGER_INPUTS = [
  "blink",
  "nod",
  "giggle",
  "hum",
  "look",
  "tilt",
  "yawn",
  "hiccup",
  "wake",
] as const;

export type RiveTriggerName = (typeof RIVE_TRIGGER_INPUTS)[number];
