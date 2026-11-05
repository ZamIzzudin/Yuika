
"use client";
import { useState } from "react";
import type { PersonaInfo } from "@yuika/contracts";
import { usePersonaShape } from "./orinShapes";
import { OrinPortrait } from "./OrinPortrait";

/**
 * Wajah kecil persona (list/header) — mini-maskot Orin v8: bentuk + mata kapsul statis,
 * identik dengan portrait besar (orinShapes). bodyScale (bintang 1.18×) diterapkan
 * pada siluet saja; viewBox dilebarkan agar bintang muat penuh.
 */
export function PersonaFace({
  personaId,
  size = 22,
}: {
  personaId: string;
  size?: number;
}) {
  const { shape: s } = usePersonaShape(personaId);
  const w = 30 * s.es,
    h = 56 * s.es,
    gap = 34 * s.gs;
  return (
    <svg
      width={size}
      height={size}
      viewBox="-165 -165 330 330"
      aria-hidden
      focusable="false"
      style={{ display: "block", flex: "none" }}
    >
      <g
        fill={s.color}
        transform={s.bodyScale && s.bodyScale !== 1 ? `scale(${s.bodyScale})` : undefined}
      >
        {s.geom}
      </g>
      <g transform={`translate(0 ${s.fy})`} fill="#11121A">
        <rect x={-gap - w / 2} y={-h / 2} width={w} height={h} rx={w / 2} />
        <rect x={gap - w / 2} y={-h / 2} width={w} height={h} rx={w / 2} />
      </g>
    </svg>
  );
}

/**
 * Pemilihan persona layar kosong (scope Workspace) — **orbit floating card**:
 * kartu sederhana (maskot + nama) mengambang mengelilingi pusat; persona yang
 * di-hover tampil besar di tengah (maskot + nama + deskripsi + badge level).
 * Klik kartu = mulai sesi. Default fokus = persona pertama (Conductor).
 */
export function PersonaOrbit({
  personas,
  onPick,
}: {
  personas: PersonaInfo[];
  onPick: (p: PersonaInfo) => void;
}) {
  const [focus, setFocus] = useState(0);
  const n = personas.length;
  const active = personas[Math.min(focus, n - 1)] ?? null;
  const cardBase =
    "flex w-[130px] cursor-pointer flex-col items-center gap-1.5 rounded-card border px-3.5 py-3 text-center shadow-card transition-[background-color,border-color,color,box-shadow] ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] motion-safe:float-yui";
  return (
    <div className="relative mt-2 h-[460px] w-full max-w-[720px] sm:h-[500px]">
      {/* dekorasi: lintasan orbit (elips putus-putus tepat di jalur kartu) +
          ring dalam + glow lembut di belakang maskot — anti "terlalu sepi" */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/2 left-1/2 h-[80%] w-[92%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-dashed border-line/70" />
        <div className="absolute top-1/2 left-1/2 h-[52%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-line/80" />
        <div className="absolute top-1/2 left-1/2 h-[35%] w-[40%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-line/90" />
      </div>
      {/* pusat: maskot INTERAKTIF persona terpilih + deskripsi (muncul saat hover
          kartu — mata mengikuti kursor & bisa diklik, OrinPortrait v4) */}
      {active && (
        <div
          key={active.id}
          aria-live="polite"
          className="msg-in absolute inset-0 flex flex-col items-center justify-center gap-2 px-16 text-center sm:px-20"
        >
          <OrinPortrait state="idle" personaId={active.id} size={180} />
          <b className="text-title font-semibold text-primary">{active.name}</b>
          <p className="max-w-[320px] text-body leading-6 text-muted">
            {active.description}
          </p>
        </div>
      )}
      {/* ring kartu mengambang (posisi elips dari sudut i·360°/n, mulai dari atas) */}
      {personas.map((p, i) => {
        const a = (-90 + (360 / n) * i) * (Math.PI / 180);
        return (
          <div
            key={p.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${50 + 46 * Math.cos(a)}%`,
              top: `${50 + 40 * Math.sin(a)}%`,
            }}
          >
            <button
              onMouseEnter={() => setFocus(i)}
              onFocus={() => setFocus(i)}
              onClick={() => onPick(p)}
              style={{ animationDelay: `${(i * 1.1).toFixed(1)}s` }}
              className={`${cardBase} ${
                i === focus
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-surface hover:border-line-strong hover:bg-hover"
              }`}
            >
              <PersonaFace personaId={p.id} size={40} />
              <b className="text-caption font-semibold text-secondary">
                {p.name}
              </b>
            </button>
          </div>
        );
      })}
      {/* (katalog 15 bentuk kini ada di page Persona — card identitas) */}
    </div>
  );
}

