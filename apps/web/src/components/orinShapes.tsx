import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

/**
 * Orin v8 — definisi bentuk maskot (docs/orin_v8_larger_star.html).
 * Satu rig mata dipakai semua bentuk; identitas persona = BENTUK (bukan tint).
 * 15 bentuk (urutan SHAPE_ORDER = indeks input Rive `shape` 0–14) — geometri
 * v6 "Round Orb & Soft Star": kontur membulat organik, SEMUA bentuk path filled
 * (tidak ada lagi stroke-based v4).
 * Parameter per bentuk: fy (offset wajah Y), gs (skala jarak mata), es (skala
 * mata), gr (rentang tatapan), bodyScale (skala siluet — v8: bintang 1.18×,
 * WAJAH TIDAK ikut diskalakan) — dipakai OrinPortrait & PersonaFace.
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
  /** v8: skala grup siluet badan (1 = normal). Wajah/rig TIDAK ikut diskalakan. */
  bodyScale?: number;
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
    es: 0.9,
    gr: 0.8,
    geom: (
      <path d="M-105,74C-130,62 -139,37 -128,12C-119,-10 -98,-23 -72,-21C-67,-65 -31,-99 13,-99C57,-99 88,-70 94,-31C126,-27 143,-4 139,27C136,56 115,77 84,80L-82,80C-91,80 -99,78 -105,74Z" />
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
    es: 1,
    gr: 0.9,
    geom: (
      <path d="M-58,-119C-29,-123 28,-123 58,-119C98,-114 119,-91 121,-53C124,-20 124,22 121,55C118,96 96,117 57,120C23,123 -25,123 -58,120C-98,117 -118,95 -121,56C-124,22 -124,-21 -121,-55C-118,-94 -97,-114 -58,-119Z" />
    ),
  },
  tri: {
    name: "Segitiga",
    color: "#F0278E",
    fy: 36,
    gs: 0.78,
    es: 0.82,
    gr: 0.6,
    geom: (
      <path d="M-7,-120C-1,-130 8,-130 15,-119C34,-91 50,-57 72,-17L115,62C132,93 116,116 83,116L-83,116C-116,116 -132,93 -115,62L-72,-17C-50,-57 -28,-93 -7,-120Z" />
    ),
  },
  pill: {
    name: "Kapsul",
    color: "#2BC4D8",
    fy: 0,
    gs: 1.22,
    es: 1,
    gr: 1.1,
    geom: (
      <g transform="rotate(-6)">
        <path d="M-132,-8C-132,-52 -99,-80 -55,-80L57,-80C102,-80 134,-51 134,-8L134,8C134,52 102,80 57,80L-55,80C-99,80 -132,52 -132,8Z" />
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
    gs: 0.78,
    es: 0.8,
    gr: 0.5,
    // v8: body bintang diperbesar 1.18× agar seimbang dgn bentuk lain —
    // HANYA siluet; wajah/rig mata tidak diskalakan (rig bersama konsisten).
    bodyScale: 1.18,
    geom: (
      <path d="M9.3,-94.1L26.4,-53.9Q31.2,-42.9 43.1,-41.8L86.6,-38Q110.3,-35.8 92.3,-20.2L59.5,8.5Q50.4,16.4 53.1,28.1L62.8,70.6Q68.2,93.8 47.7,81.6L10.3,59.2Q0,53 -10.3,59.2L-47.7,81.6Q-68.2,93.8 -62.8,70.6L-53.1,28.1Q-50.4,16.4 -59.5,8.5L-92.3,-20.2Q-110.3,-35.8 -86.6,-38L-43.1,-41.8Q-31.2,-42.9 -26.4,-53.9L-9.3,-94.1Q0,-116 9.3,-94.1Z" />
    ),
  },
  flower: {
    name: "Bunga",
    color: "#C48DEB",
    fy: 0,
    gs: 1,
    es: 1,
    gr: 0.9,
    geom: (
      <path d="M0,-126C28,-126 34,-91 50,-76C67,-94 88,-112 108,-94C128,-76 105,-52 94,-32C119,-24 139,-8 132,18C125,43 94,42 73,53C84,78 95,104 72,119C50,134 32,105 12,88C-2,111 -17,136 -42,127C-67,118 -58,87 -60,63C-85,73 -114,84 -127,59C-140,34 -109,17 -90,0C-111,-16 -134,-36 -121,-59C-108,-82 -78,-66 -55,-61C-53,-87 -50,-117 -24,-125C-13,-129 -7,-127 0,-126Z" />
    ),
  },
  hex: {
    name: "Segi enam",
    color: "#A8D83E",
    fy: 0,
    gs: 1,
    es: 1,
    gr: 0.85,
    geom: (
      <path d="M-11,-111C-4,-115 5,-115 12,-111L89,-65C99,-59 105,-48 105,-36L105,36C105,48 99,59 89,65L12,111C5,115 -4,115 -12,111L-89,65C-99,59 -105,48 -105,36L-105,-36C-105,-48 -99,-59 -89,-65Z" />
    ),
  },
  trap: {
    name: "Trapesium",
    color: "#E8503A",
    fy: 8,
    gs: 0.95,
    es: 0.95,
    gr: 0.8,
    geom: (
      <path d="M-42,-111C-36,-116 -29,-118 -20,-118L20,-118C29,-118 36,-116 42,-111L112,77C122,103 107,119 80,119L-80,119C-107,119 -122,103 -112,77Z" />
    ),
  },
  diamond: {
    name: "Berlian",
    color: "#3A4FB0",
    fy: 0,
    gs: 0.86,
    es: 0.9,
    gr: 0.65,
    geom: (
      <path d="M0,-124C9,-124 17,-118 26,-109L109,-26C129,-6 129,6 109,26L26,109C8,127 -8,127 -26,109L-109,26C-129,6 -129,-6 -109,-26L-26,-109C-17,-118 -9,-124 0,-124Z" />
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
    gs: 0.82,
    es: 1,
    gr: 0.65,
    geom: (
      <path d="M-73,-73C-73,-112 -49,-132 -12,-132L12,-132C49,-132 73,-112 73,-73L73,74C73,112 49,132 12,132L-12,132C-49,132 -73,112 -73,74Z" />
    ),
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

/** Bentuk per persona — identitas visual maskot (Orin v4→v8).
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

/** Kunci bentuk persona (fallback: orb) — dipakai aturan khusus per bentuk
 *  (v8: bola diskalakan seragam saat squash-stretch agar tetap bulat). */
export function personaShapeKey(personaId?: string): OrinShapeKey {
  if (!personaId) return "orb";
  return PERSONA_SHAPE[personaId] ?? "orb";
}

export function personaShape(personaId?: string): OrinShape {
  const key = personaShapeKey(personaId);
  return key in SHAPES ? SHAPES[key] : FALLBACK;
}

/** ===== Override bentuk per persona (menu Persona) =====
 *  User dapat mengganti geometri maskot via PUT /api/personas/shapes —
 *  persist workspace/persona-shapes.json (core). Override di sini:
 *  module-store + useSyncExternalStore → semua PersonaFace/OrinPortrait
 *  langsung ikut berubah (tanpa reload). */
let shapeOverrides: Record<string, OrinShapeKey> = {};
const shapeListeners = new Set<() => void>();

/** Set peta override (dari GET /api/personas/shapes) — mengganti seluruh peta. */
export function setShapeOverrides(map: Record<string, OrinShapeKey>): void {
  shapeOverrides = { ...map };
  shapeListeners.forEach((l) => l());
}

export function subscribeShapeOverrides(cb: () => void): () => void {
  shapeListeners.add(cb);
  return () => shapeListeners.delete(cb);
}

function useShapeOverrides(): Record<string, OrinShapeKey> {
  return useSyncExternalStore(subscribeShapeOverrides, () => shapeOverrides, () => shapeOverrides);
}

/** Bentuk AKTIF persona: override user > default PERSONA_SHAPE. Reaktif —
 *  dipakai PersonaFace & OrinPortrait (identitas visual konsisten seketika). */
export function usePersonaShape(personaId?: string): { key: OrinShapeKey; shape: OrinShape } {
  const ov = useShapeOverrides();
  const key = (personaId && ov[personaId]) || personaShapeKey(personaId);
  return { key, shape: key in SHAPES ? SHAPES[key] : FALLBACK };
}

/** Campur dua warna hex (v8 paintBody) — untuk stop gradient badan:
 *  terang (→ putih 48%) & bayangan (→ tinta gelap 34%). */
export function mixHex(hex: string, other: string, amount: number): string {
  const p = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const a = p(hex),
    b = p(other);
  return (
    "#" +
    a
      .map((v, i) =>
        Math.round(v + (b[i]! - v) * amount)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
