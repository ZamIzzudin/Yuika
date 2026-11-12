// @yuika/core, P3-CANVAS: model data desain embedded (Penpot-inspired).
// Referensi: d:/projects/penpot common/src/app/common/types/shape.cljc —
// konsep pages → shape tree (parentId + children z-order), fills/stroke/
// radius. Dilebur jadi TS murni: file JSON di workspace/design/, tanpa
// server eksternal, tanpa token. Fitur inti saja (design tools): frame,
// rect, circle, text + halaman; tanpa prototype/comment/inspect/PM.

export type DesignShapeType = "frame" | "rect" | "circle" | "text";

export interface DesignFill {
  color: string; // "#rrggbb"
  opacity?: number; // 0..1
}

export interface DesignStroke {
  color: string;
  width: number;
  align?: "inner" | "center" | "outer";
  dash?: number[];
}

export interface DesignShapeCommon {
  id: string;
  name: string;
  type: DesignShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number; // derajat, searah jarum jam
  opacity?: number; // 0..1
  hidden?: boolean;
  locked?: boolean;
  fills: DesignFill[];
  stroke?: DesignStroke;
  radius?: number; // sudut membulat (px)
  parentId: string | null; // null = root halaman; id frame = anak frame
  /** Prototyping: wiring navigasi (Figma-style). target = id frame root di
   *  halaman yang sama, atau id halaman lain dalam file yang sama. */
  interaction?: { event: "click"; action: "navigate"; target: string };
}

export interface DesignFrameShape extends DesignShapeCommon {
  type: "frame";
  children: string[]; // z-order anak (depan → belakang? tidak: belakang → depan, index akhir = paling depan)
  /** Frame root yang ditandai sebagai LAYAR prototype (tombol Try it).
   * Frame root baru otomatis true; frame bersarang/non-screen tidak tampil
   * di prototype. Loose shapes (rect/text di level halaman) tidak pernah jadi
   * layar — mereka elemen kanvas dekoratif/annotasi. */
  isScreen?: boolean;
}

export interface DesignRectShape extends DesignShapeCommon {
  type: "rect";
}

export interface DesignCircleShape extends DesignShapeCommon {
  type: "circle";
}

export interface DesignTextShape extends DesignShapeCommon {
  type: "text";
  text: string;
  fontSize: number;
  fontWeight?: number; // 400/500/600/700
  align?: "left" | "center" | "right";
  lineHeight?: number; // multiplier, default 1.4
  color: string; // warna teks (#rrggbb)
}

export type DesignShape = DesignFrameShape | DesignRectShape | DesignCircleShape | DesignTextShape;

export interface DesignPage {
  id: string;
  name: string;
  background: string; // "#rrggbb"
  roots: string[]; // z-order shape level halaman (belakang → depan)
  shapes: Record<string, DesignShape>;
}

export interface DesignFile {
  id: string;
  name: string;
  /** D91: file desain diikat ke project pembuatnya; null/undefined = legacy
   *  (tampil di semua project, dibuat sebelum D91). */
  projectId?: string | null;
  revn: number;
  pages: DesignPage[];
  updatedAt: number; // epoch ms
}

// ---- validasi (semua pesan error ENGLISH) ----

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX_RE.test(v);
}

export function normalizeHex(v: string): string {
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
  }
  return v.toLowerCase();
}

export function assertFinite(name: string, v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${name} must be a finite number`);
  return v;
}

export function validateColor(field: string, v: unknown, fallback: string): string {
  if (v === undefined || v === null || v === "") return fallback;
  if (!isHexColor(v)) throw new Error(`${field} must be a hex color like #1a1a1a`);
  return normalizeHex(v);
}

export function validateOpacity(field: string, v: unknown): number {
  const n = assertFinite(field, v ?? 1);
  if (n < 0 || n > 1) throw new Error(`${field} must be between 0 and 1`);
  return n;
}
