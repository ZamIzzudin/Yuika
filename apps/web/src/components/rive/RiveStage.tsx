"use client";
/**
 * RiveStage (P1-PER-3) — pembungkus @rive-app/react-canvas dengan fallback
 * permanen ke OrinPortrait SVG (docs/ART-DIRECTION.md §7.4):
 *   1. Probe HEAD file .riv — 404/tidak ada → fallback (mode sekarang: aset
 *      artist P1-PER-2 belum ada, jadi UI TIDAK berubah).
 *   2. prefers-reduced-motion → fallback.
 *   3. onLoadError / error render → fallback (ErrorBoundary).
 * Input dipetakan by-name dari kontrak riveMap.ts; aksi idle (look/giggle/…)
 * dikelola state machine di dalam .riv — runtime hanya mengirim mood/shape/
 * audioLevel/lookX/lookY (+ trigger via prop `action`).
 *
 * SATU instance = SATU WebGL context — hanya untuk hero tunggal (portrait &
 * stage), bukan grid persona (orbit picker tetap SVG PersonaFace).
 */
import {
  Component,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PersonaState } from "@yuika/contracts";
import { useRive } from "@rive-app/react-canvas";
import { usePersonaShape } from "../orinShapes";
import {
  DEFAULT_RIVE_SRC,
  RIVE_MOOD,
  RIVE_STATE_MACHINE,
  riveShapeIndex,
  type RiveTriggerName,
} from "./riveMap";

/** Pre-load file .riv ke cache HTTP (sekali per src) — portrait pertama
 *  langsung siap tanpa round-trip tambahan. */
const warmed = new Set<string>();
export function warmRive(src: string = DEFAULT_RIVE_SRC): void {
  if (typeof window === "undefined" || warmed.has(src)) return;
  warmed.add(src);
  const idle =
    (window as unknown as { requestIdleCallback?: (cb: () => void) => void })
      .requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1200));
  idle(() => void fetch(src, { priority: "low" }).catch(() => undefined));
}

/** Aksi trigger sekali-jalan: naikkan `nonce` untuk men-fire `name` lagi. */
export interface RiveAction {
  name: RiveTriggerName;
  nonce: number;
}

function setNum(
  inputs: { name: string; value: number | boolean }[] | undefined,
  name: string,
  value: number,
): void {
  const input = inputs?.find((i) => i.name === name);
  if (input) input.value = value;
}

function RiveCanvas({
  src,
  stateMachine,
  mood,
  shape,
  action,
  onFail,
  onReady,
}: {
  src: string;
  stateMachine: string;
  mood: number;
  shape: number;
  action: RiveAction | null;
  onFail: () => void;
  onReady: (
    inputs: string[],
    meta: { artboard: string; animations: string[] },
  ) => void;
}) {
  const { rive, RiveComponent } = useRive({
    src,
    stateMachine: stateMachine || undefined,
    autoplay: true,
    onLoadError: () => onFail(),
  });

  // kirim nilai number setiap kali rive siap / nilai berubah
  useEffect(() => {
    if (!rive) return;
    const inputs = rive.stateMachineInputs(stateMachine);
    if (!inputs?.length) {
      // aset non-kontrak (mis. sample QA): mainkan animasi pertama supaya
      // canvas tetap hidup — state machine "Mascot" hanya wajib di orin.riv.
      const first = rive.animationNames[0];
      if (first) rive.play(first);
    }
    setNum(inputs, "mood", mood);
    setNum(inputs, "shape", shape);
    setNum(inputs, "audioLevel", mood === 3 ? 55 : 0); // disimulasikan (mic asli P3)
    setNum(inputs, "lookX", 0);
    setNum(inputs, "lookY", 0);
    onReady((inputs ?? []).map((i) => i.name), {
      artboard: rive.activeArtboard ?? "",
      animations: [...rive.animationNames],
    });
  }, [rive, stateMachine, mood, shape, onReady]);

  // trigger sekali per nonce
  useEffect(() => {
    if (!rive || !action) return;
    const inputs = rive.stateMachineInputs(stateMachine);
    inputs?.find((i) => i.name === action.name)?.fire();
  }, [rive, stateMachine, action]);

  return <RiveComponent className="rive-canvas" />;
}

/** Error boundary — file korup / WebGL gagal → fallback SVG, app tak pernah crash. */
class RiveBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function RiveStage({
  src = DEFAULT_RIVE_SRC,
  stateMachine = RIVE_STATE_MACHINE,
  state,
  personaId,
  action = null,
  size,
  fallback,
  onStatus,
}: {
  src?: string;
  stateMachine?: string;
  state: PersonaState;
  personaId?: string;
  action?: RiveAction | null;
  size?: number;
  fallback: ReactNode;
  /** Panel QA: "probing" | "ok" | "missing" | "error" (+ daftar input & meta aset). */
  onStatus?: (
    status: "probing" | "ok" | "missing" | "error",
    inputs?: string[],
    meta?: { artboard: string; animations: string[] },
  ) => void;
}) {
  const [phase, setPhase] = useState<"probing" | "ok" | "missing" | "error">("probing");
  const [reduced, setReduced] = useState(false);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  const { key: shapeKey } = usePersonaShape(personaId);

  useEffect(() => {
    let alive = true;
    setPhase("probing");
    fetch(src, { method: "HEAD" })
      .then((r) => {
        if (!alive) return;
        const next = r.ok ? "ok" : "missing";
        setPhase(next);
        statusRef.current?.(next);
      })
      .catch(() => {
        if (!alive) return;
        setPhase("missing");
        statusRef.current?.("missing");
      });
    return () => {
      alive = false;
    };
  }, [src]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // aset belum ada / user minta gerakan minim / gagal load → SVG (perilaku lama)
  if (phase !== "ok" || reduced) return <>{fallback}</>;

  return (
    <RiveBoundary fallback={fallback} key={src}>
      <div className="rive-wrap" style={{ width: size, height: size }}>
        <RiveCanvas
          src={src}
          stateMachine={stateMachine}
          mood={RIVE_MOOD[state]}
          shape={riveShapeIndex(shapeKey)}
          action={action}
          onFail={() => {
            setPhase("error");
            statusRef.current?.("error");
          }}
          onReady={(names, meta) => {
            statusRef.current?.("ok", names, meta);
          }}
        />
      </div>
    </RiveBoundary>
  );
}
