import type { ReactNode } from "react";

/**
 * Orin v4 — definisi bentuk maskot (docs/Orin v4 – Pilih Maskot).
 * Satu rig mata dipakai semua bentuk; identitas persona = BENTUK (bukan tint lagi).
 * Parameter per bentuk: fy (offset wajah Y), gs (skala jarak mata), es (skala mata),
 * gr (rentang tatapan) — dipakai OrinPortrait & PersonaFace agar konsisten.
 */
export type OrinShapeKey = "orb" | "cloud" | "blob" | "square" | "tri";

export interface OrinShape {
  /** Nama bentuk (Bahasa) */
  name: string;
  /** Warna khas bentuk */
  color: string;
  fy: number;
  gs: number;
  es: number;
  gr: number;
  /** Geometri badan (fill ditentukan parent) — koordinat pusat 0,0, radius ±130 */
  geom: ReactNode;
}

export const SHAPES: Record<OrinShapeKey, OrinShape> = {
  orb: {
    name: "Bola",
    color: "#F2620F",
    fy: 0,
    gs: 1,
    es: 1,
    gr: 1,
    geom: <circle r={130} />,
  },
  cloud: {
    name: "Awan",
    color: "#F5A00A",
    fy: 8,
    gs: 0.92,
    es: 0.88,
    gr: 0.8,
    geom: (
      <>
        <circle cx={-62} cy={22} r={64} />
        <circle cx={8} cy={-26} r={76} />
        <circle cx={76} cy={14} r={58} />
        <rect x={-112} y={10} width={228} height={88} rx={44} />
      </>
    ),
  },
  blob: {
    name: "Tetes",
    color: "#2B8CF0",
    fy: 0,
    gs: 1,
    es: 1,
    gr: 1,
    geom: (
      <path d="M-122,10C-126,-70 -50,-126 10,-122C80,-117 126,-60 122,10C117,80 60,126 0,123C-70,121 -120,80 -122,10Z" />
    ),
  },
  square: {
    name: "Kotak",
    color: "#12D1A0",
    fy: 0,
    gs: 1.05,
    es: 0.95,
    gr: 0.9,
    geom: <rect x={-118} y={-118} width={236} height={236} rx={80} />,
  },
  tri: {
    name: "Segitiga",
    color: "#F0278E",
    fy: 36,
    gs: 0.72,
    es: 0.76,
    gr: 0.6,
    geom: (
      <path d="M0,-128C22,-128 40,-98 70,-42L116,48C132,82 118,112 86,112L-86,112C-118,112 -132,82 -116,48L-70,-42C-40,-98 -22,-128 0,-128Z" />
    ),
  },
};

/** Bentuk per persona — identitas visual maskot (Orin v4). Designer menempati segitiga. */
export const PERSONA_SHAPE: Record<string, OrinShapeKey> = {
  "yui-conductor": "orb",
  "yui-scholar": "cloud",
  "yui-scribe": "blob",
  "yui-coder": "square",
  "yui-designer": "tri",
};

const FALLBACK: OrinShape = { ...SHAPES.orb, color: "#9A9A9A" };

export function personaShape(personaId?: string): OrinShape {
  if (!personaId) return SHAPES.orb;
  const key = PERSONA_SHAPE[personaId];
  return key ? SHAPES[key] : FALLBACK;
}
