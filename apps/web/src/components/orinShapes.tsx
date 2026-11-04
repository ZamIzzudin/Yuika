import type { ReactNode } from "react";

/**
 * Orin v4 — definisi bentuk maskot (docs/Orin v4 – Pilih Maskot (1).html).
 * Satu rig mata dipakai semua bentuk; identitas persona = BENTUK (bukan tint lagi).
 * 15 bentuk (perluasan dev 10) — urutan SHAPE_ORDER = indeks input Rive `shape` 0–14.
 * Parameter per bentuk: fy (offset wajah Y), gs (skala jarak mata), es (skala mata),
 * gr (rentang tatapan) — dipakai OrinPortrait & PersonaFace agar konsisten.
 * Bentuk stroke-based (star/hex/trap): geom memakai stroke="currentColor" —
 * parent WAJIB set style={{ color }} selain fill.
 */
export type OrinShapeKey =
  | "orb"
  | "cloud"
  | "blob"
  | "square"
  | "tri"
  | "pill"
  | "bean"
  | "drop"
  | "star"
  | "flower"
  | "hex"
  | "trap"
  | "diamond"
  | "dome"
  | "tube";

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
    name: "Telur",
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
  pill: {
    name: "Kapsul",
    color: "#2BC4D8",
    fy: 0,
    gs: 1.25,
    es: 0.95,
    gr: 1.2,
    geom: (
      <g transform="rotate(-6)">
        <rect x={-135} y={-80} width={270} height={160} rx={80} />
      </g>
    ),
  },
  bean: {
    name: "Kacang",
    color: "#A653C8",
    fy: -20,
    gs: 0.95,
    es: 0.9,
    gr: 0.8,
    geom: (
      <path d="M-70,-112C-20,-132 55,-125 88,-80C115,-42 100,-5 72,20C50,40 48,62 62,80C82,105 70,130 35,135C-30,142 -105,100 -118,28C-126,-30 -108,-92 -70,-112Z" />
    ),
  },
  drop: {
    name: "Tetes",
    color: "#FF7662",
    fy: 30,
    gs: 0.8,
    es: 0.85,
    gr: 0.6,
    geom: (
      <path d="M0,-132C20,-100 98,-30 108,30C118,92 70,128 0,128C-70,128 -118,92 -108,30C-98,-30 -20,-100 0,-132Z" />
    ),
  },
  star: {
    name: "Bintang",
    color: "#8FDB6F",
    fy: 6,
    gs: 0.72,
    es: 0.75,
    gr: 0.5,
    geom: (
      <polygon
        points="0,-108 30.6,-42.1 102.7,-33.4 49.5,16.1 63.5,87.4 0,52 -63.5,87.4 -49.5,16.1 -102.7,-33.4 -30.6,-42.1"
        stroke="currentColor"
        strokeWidth={26}
        strokeLinejoin="round"
      />
    ),
  },
  flower: {
    name: "Bunga",
    color: "#C48DEB",
    fy: 0,
    gs: 1,
    es: 0.95,
    gr: 0.9,
    geom: (
      <>
        <circle r={82} />
        <circle cx={78} cy={0} r={48} />
        <circle cx={55} cy={55} r={48} />
        <circle cx={0} cy={78} r={48} />
        <circle cx={-55} cy={55} r={48} />
        <circle cx={-78} cy={0} r={48} />
        <circle cx={-55} cy={-55} r={48} />
        <circle cx={0} cy={-78} r={48} />
        <circle cx={55} cy={-55} r={48} />
      </>
    ),
  },
  hex: {
    name: "Segi enam",
    color: "#A8D83E",
    fy: 0,
    gs: 1,
    es: 0.95,
    gr: 0.85,
    geom: (
      <polygon
        points="0,-100 86.6,-50 86.6,50 0,100 -86.6,50 -86.6,-50"
        stroke="currentColor"
        strokeWidth={30}
        strokeLinejoin="round"
      />
    ),
  },
  trap: {
    name: "Trapesium",
    color: "#E8503A",
    fy: 8,
    gs: 0.95,
    es: 0.9,
    gr: 0.8,
    geom: (
      <polygon
        points="-52,-96 52,-96 100,98 -100,98"
        stroke="currentColor"
        strokeWidth={30}
        strokeLinejoin="round"
      />
    ),
  },
  diamond: {
    name: "Berlian",
    color: "#3A4FB0",
    fy: 0,
    gs: 0.8,
    es: 0.85,
    gr: 0.6,
    geom: (
      <g transform="rotate(45)">
        <rect x={-88} y={-88} width={176} height={176} rx={40} />
      </g>
    ),
  },
  dome: {
    name: "Kubah",
    color: "#E6DC3A",
    fy: 6,
    gs: 1.05,
    es: 0.95,
    gr: 0.9,
    geom: (
      <path d="M-125,95C-125,-60 -70,-125 0,-125C70,-125 125,-60 125,95Q125,120 100,120L-100,120Q-125,120 -125,95Z" />
    ),
  },
  tube: {
    name: "Tabung",
    color: "#1F9A9A",
    fy: -18,
    gs: 0.75,
    es: 0.95,
    gr: 0.6,
    geom: <rect x={-75} y={-125} width={150} height={250} rx={75} />,
  },
};

/** Urutan resmi = indeks input Rive `shape` 0–14 (docs: state machine "Mascot"). */
export const SHAPE_ORDER: OrinShapeKey[] = [
  "orb",
  "cloud",
  "blob",
  "square",
  "tri",
  "pill",
  "bean",
  "drop",
  "star",
  "flower",
  "hex",
  "trap",
  "diamond",
  "dome",
  "tube",
];

/** Bentuk per persona — identitas visual maskot (Orin v4).
 *  Bentuk bebas untuk persona mendatang (Analyst/Operator — P1-PER-6, dst.):
 *  pill, bean, drop, star, flower, hex, trap, diamond, dome, tube. */
export const PERSONA_SHAPE: Record<string, OrinShapeKey> = {
  "yui-conductor": "orb",
  "yui-scholar": "cloud",
  "yui-scribe": "blob",
  "yui-coder": "square",
  "yui-designer": "tri",
  "yui-analyst": "diamond", // P1-PER-6: prisma — potongan data
  "yui-operator": "hex", // P1-PER-6: baut — mesin/otomasi
  "yui-planner": "star", // P2-PM-1 (D22): bintang — target & metrik PM
};

const FALLBACK: OrinShape = { ...SHAPES.orb, color: "#9A9A9A" };

export function personaShape(personaId?: string): OrinShape {
  if (!personaId) return SHAPES.orb;
  const key = PERSONA_SHAPE[personaId];
  return key ? SHAPES[key] : FALLBACK;
}
