"use client";
/**
 * /dev/rive — QA aset Rive (P1-PER-2 handoff). Artist drop `orin.riv` ke
 * `apps/web/public/rive/` lalu buka halaman ini:
 *   - status load file + daftar input yang ditemukan vs KONTRAK (riveMap.ts);
 *   - slider mood/shape/audioLevel/lookX/lookY + tombol semua trigger;
 *   - pemilih aset (orin.riv default · sample.riv = contoh umum tanpa SM
 *     "Mascot" — berguna mengecek bahwa canvas & fallback jalan).
 * Halaman dev-only: tidak masuk navigasi produk.
 */
import { useState } from "react";
import type { PersonaState } from "@yuika/contracts";
import { OrinPortrait } from "@/components/OrinPortrait";
import {
  RiveStage,
  type RiveAction,
} from "@/components/rive/RiveStage";
import {
  DEFAULT_RIVE_SRC,
  MOOD_NAMES,
  RIVE_NUMBER_INPUTS,
  RIVE_TRIGGER_INPUTS,
  RIVE_STATE_MACHINE,
} from "@/components/rive/riveMap";
import { OrinShapeKey, SHAPE_ORDER } from "@/components/orinShapes";
import { Button, Card } from "@/components/ui";

const STATES: PersonaState[] = [
  "idle",
  "thinking",
  "working",
  "awaiting_input",
  "done",
  "celebrating",
  "error",
];

export default function RiveQaPage() {
  const [src, setSrc] = useState(DEFAULT_RIVE_SRC);
  const [status, setStatus] = useState<"probing" | "ok" | "missing" | "error">("probing");
  const [foundInputs, setFoundInputs] = useState<string[]>([]);
  const [meta, setMeta] = useState<{ artboard: string; animations: string[] } | null>(null);
  const [state, setState] = useState<PersonaState>("idle");
  const [action, setAction] = useState<RiveAction | null>(null);
  // aset non-kontrak (sample) tak punya SM "Mascot" — request SM yang tak ada
  // dianggap runtime sebagai load error; bypass untuk melihat canvasnya saja.
  const [useSm, setUseSm] = useState(true);

  const missing = [...RIVE_NUMBER_INPUTS, ...RIVE_TRIGGER_INPUTS].filter(
    (n) => !foundInputs.includes(n),
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title font-semibold">Rive asset QA</h1>
        <p className="text-caption text-muted">
          Contract: state machine <code>{RIVE_STATE_MACHINE}</code> · inputs{" "}
          <code>mood shape audioLevel lookX lookY</code> + triggers{" "}
          <code>{RIVE_TRIGGER_INPUTS.join(" ")}</code> (docs/ART-DIRECTION.md §5)
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-dim">Asset</span>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={src === DEFAULT_RIVE_SRC ? "primary" : "ghost"}
                onClick={() => {
                  setSrc(DEFAULT_RIVE_SRC);
                  setUseSm(true);
                }}
              >
                orin.riv
              </Button>
              <Button
                size="sm"
                variant={src === "/rive/sample.riv" ? "primary" : "ghost"}
                onClick={() => {
                  setSrc("/rive/sample.riv");
                  setUseSm(false);
                }}
              >
                sample.riv
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-pressed={useSm}
                onClick={() => setUseSm((v) => !v)}
              >
                SM: {useSm ? "Mascot" : "off"}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-dim">
              Persona state → mood ({state})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {STATES.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={state === s ? "primary" : "ghost"}
                  onClick={() => setState(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-dim">Triggers</span>
            <div className="flex flex-wrap gap-1.5">
              {RIVE_TRIGGER_INPUTS.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  onClick={() =>
                    setAction((a) => ({ name: t, nonce: (a?.nonce ?? 0) + 1 }))
                  }
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-md border border-line p-3 text-caption">
            <span>
              Load: <b>{status}</b>
            </span>
            {meta && (
              <span className="text-muted">
                Artboard <code>{meta.artboard || "?"}</code> · animations: {meta.animations.join(", ") || "—"}
              </span>
            )}
            <span>
              Inputs found: {foundInputs.length ? foundInputs.join(", ") : "—"}
            </span>
            {status === "ok" && (
              <span className={missing.length ? "text-primary" : "text-muted"}>
                {missing.length
                  ? `Contract missing: ${missing.join(", ")}`
                  : "Contract complete ✓"}
              </span>
            )}
          </div>
        </Card>

        <div className="flex min-h-[420px] items-center justify-center rounded-lg2 border border-line bg-canvas p-8">
          <RiveStage
            key={src}
            src={src}
            state={state}
            stateMachine={useSm ? RIVE_STATE_MACHINE : ""}
            action={action}
            size={320}
            onStatus={(s, inputs, m) => {
              setStatus(s);
              setFoundInputs(inputs ?? []);
              setMeta(m ?? null);
            }}
            fallback={
              <div className="flex flex-col items-center gap-2">
                <OrinPortrait state={state} size={200} />
                <span className="text-caption text-dim">
                  Fallback SVG (asset missing)
                </span>
              </div>
            }
          />
        </div>
      </div>

      <Card className="p-4 text-caption text-muted">
        Shape indices (input <code>shape</code> 0–14):{" "}
        {SHAPE_ORDER.map((k: OrinShapeKey, i: number) => `${i}=${k}`).join(" · ")}
        {" · "}mood 0–5: {MOOD_NAMES.map((m, i) => `${i}=${m}`).join(" · ")}
      </Card>
    </main>
  );
}
