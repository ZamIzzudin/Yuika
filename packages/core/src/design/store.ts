// @yuika/core, P3-CANVAS: store file desain — JSON di <workspace>/design/.
// Satu file per JSON; revn naik tiap mutasi (untuk deteksi stale di UI).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  type DesignFile,
  type DesignFill,
  type DesignPage,
  type DesignShape,
  type DesignShapeType,
  hasChildren,
  isHexColor,
  normalizeHex,
  validateColor,
  validateOpacity,
} from "./model.js";

export function designDir(workspacePath: string): string {
  return path.join(workspacePath, "design");
}

function fileOf(workspacePath: string, id: string): string {
  if (!/^[\w-]{1,64}$/.test(id)) throw new Error("Invalid design file id");
  return path.join(designDir(workspacePath), `${id}.json`);
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function saveDesignFile(workspacePath: string, file: DesignFile): void {
  const dir = designDir(workspacePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fileOf(workspacePath, file.id), JSON.stringify(file, null, 1), "utf8");
}

/** D94: hapus SEMUA file desain yang terikat projectId ini saat
 *  project dihapus (file legacy projectId=null dibiarkan). */
export function deleteDesignFilesForProject(workspacePath: string, projectId: string): number {
  const dir = designDir(workspacePath);
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return 0;
  }
  let n = 0;
  for (const f of entries) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as DesignFile;
      if (d.projectId === projectId) {
        fs.rmSync(path.join(dir, f), { force: true });
        n++;
      }
    } catch {
      /* file korup dilewati */
    }
  }
  return n;
}

export function getDesignFile(workspacePath: string, id: string): DesignFile | null {
  try {
    return JSON.parse(fs.readFileSync(fileOf(workspacePath, id), "utf8")) as DesignFile;
  } catch {
    return null;
  }
}

export function listDesignFiles(
  workspacePath: string,
  projectId?: string | null,
): Array<{
  id: string;
  name: string;
  projectId: string | null;
  revn: number;
  updatedAt: number;
  pages: number;
}> {
  const dir = designDir(workspacePath);
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return entries
    .map((f) => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as DesignFile;
        return {
          id: d.id,
          name: d.name,
          projectId: d.projectId ?? null,
          revn: d.revn,
          updatedAt: d.updatedAt,
          pages: d.pages?.length ?? 0,
        };
      } catch {
        return null;
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .filter((d) => projectId == null || d.projectId === projectId || d.projectId === null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function mustGetDesignFile(workspacePath: string, id: string): DesignFile {
  const f = getDesignFile(workspacePath, id);
  if (!f) throw new Error(`Design file not found: ${id} (run design_list first)`);
  return f;
}

export function mustGetPage(file: DesignFile, pageId: string): DesignPage {
  const p = file.pages.find((pg) => pg.id === pageId);
  if (!p) throw new Error(`Page not found: ${pageId} (see file.pages)`);
  return p;
}

export function mustGetShape(page: DesignPage, id: string): DesignShape {
  const s = page.shapes[id];
  if (!s) throw new Error(`Shape not found on page "${page.name}": ${id}`);
  return s;
}

/** Cari shape di semua halaman (untuk tool yang tidak tahu pageId). */
export function findShape(file: DesignFile, id: string): { page: DesignPage; shape: DesignShape } | null {
  for (const p of file.pages) {
    const s = p.shapes[id];
    if (s) return { page: p, shape: s };
  }
  return null;
}

// ---- mutasi ----

export function createDesignFile(workspacePath: string, name: string, projectId?: string | null): DesignFile {
  const t = (v: unknown) => String(v ?? "").trim();
  const n = t(name);
  if (n.length < 1 || n.length > 120) throw new Error("name must be 1-120 characters");
  const file: DesignFile = {
    id: uuid().slice(0, 8),
    name: n,
    // D91: file desain diikat per-project (null hanya utk pemanggil eksplisit)
    projectId: projectId ?? null,
    revn: 0,
    pages: [{ id: uuid(), name: "Page 1", background: "#101014", roots: [], shapes: {} }],
    updatedAt: Date.now(),
  };
  saveDesignFile(workspacePath, file);
  return file;
}

export function addDesignPage(workspacePath: string, fileId: string, name?: string): DesignPage {
  const file = mustGetDesignFile(workspacePath, fileId);
  const n = String(name ?? `Page ${file.pages.length + 1}`).trim().slice(0, 80) || `Page ${file.pages.length + 1}`;
  const page: DesignPage = { id: uuid(), name: n, background: "#101014", roots: [], shapes: {} };
  file.pages.push(page);
  file.revn += 1;
  file.updatedAt = Date.now();
  saveDesignFile(workspacePath, file);
  return page;
}

/** D91: hapus halaman (minimal satu harus tersisa). Wiring prototyping yang
 *  mengarah ke halaman terhapus dibersihkan. Return sisa halaman. */
export function deleteDesignPage(
  workspacePath: string,
  fileId: string,
  pageId: string,
): { pages: number; removed: string } {
  const file = mustGetDesignFile(workspacePath, fileId);
  const idx = file.pages.findIndex((p) => p.id === pageId);
  if (idx < 0) throw new Error(`Page not found: ${pageId}`);
  if (file.pages.length <= 1) throw new Error("cannot delete the last page of a design file");
  file.pages.splice(idx, 1);
  // bersihkan wiring navigate yang menarget halaman terhapus
  for (const pg of file.pages) {
    for (const sh of Object.values(pg.shapes)) {
      if (sh.interaction?.target === pageId) delete sh.interaction;
    }
  }
  file.revn += 1;
  file.updatedAt = Date.now();
  saveDesignFile(workspacePath, file);
  return { pages: file.pages.length, removed: pageId };
}

export interface AddShapeInput {
  type: DesignShapeType;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string; // "#rrggbb"
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  radius?: number;
  rotation?: number;
  opacity?: number;
  hidden?: boolean;
  // text only
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  align?: "left" | "center" | "right";
  color?: string; // warna teks
  // frame root saja
  isScreen?: boolean;
  // D92: image saja
  src?: string;
  fit?: "cover" | "contain" | "stretch";
  // D92: background image frame (fills[0].image)
  fillImage?: string;
}

function num(v: unknown, def = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

/** D92: validasi src image — http(s) URL atau path relatif workspace tanpa
 *  traversal (contoh: projects/p1/uploads/hero.png). */
export function validateAssetSrc(field: string, v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s || s.length > 2048) throw new Error(`${field} must be 1-2048 characters`);
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/") || s.includes("..") || /[\\:\0]/.test(s)) {
    throw new Error(`${field} must be an http(s) URL or a workspace-relative path`);
  }
  return s;
}

export function addDesignShape(
  workspacePath: string,
  fileId: string,
  pageId: string,
  input: AddShapeInput,
  parentId?: string | null,
): DesignShape {
  const file = mustGetDesignFile(workspacePath, fileId);
  const page = mustGetPage(file, pageId);
  const type = input.type;
  if (!["frame", "rect", "circle", "text", "group", "image"].includes(type)) {
    throw new Error('type must be one of: frame, rect, circle, text, group, image');
  }
  const width = num(input.width, -1);
  const height = num(input.height, -1);
  if (width < 1 || height < 1) throw new Error("width/height must be >= 1 (pixels)");
  if (input.radius !== undefined && (num(input.radius) < 0 || num(input.radius) > 200)) {
    throw new Error("radius must be 0-200");
  }
  if (input.fontSize !== undefined && (num(input.fontSize, 8) < 8 || num(input.fontSize, 200) > 200)) {
    throw new Error("fontSize must be 8-200");
  }

  const id = uuid();
  const fill = validateColor("fill", input.fill, type === "frame" ? "#16161c" : type === "group" ? "#000000" : "#2c2c34");
  const fills: DesignFill[] = [
    {
      color: fill,
      opacity: type === "group" ? 0 : validateOpacity("fillOpacity", input.fillOpacity ?? 1),
      ...(type === "frame" && input.fillImage ? { image: validateAssetSrc("fillImage", input.fillImage) } : {}),
    },
  ];
  let stroke: DesignShape["stroke"];
  if (input.strokeColor) {
    stroke = { color: validateColor("strokeColor", input.strokeColor, "#3a3a44"), width: Math.max(0, num(input.strokeWidth, 1)) };
  }

  const base = {
    id,
    name: String(input.name ?? "").trim().slice(0, 120) || `${type} ${Object.keys(page.shapes).length + 1}`,
    type,
    x: num(input.x),
    y: num(input.y),
    width,
    height,
    ...(input.rotation !== undefined ? { rotation: num(input.rotation) % 360 } : {}),
    ...(input.opacity !== undefined ? { opacity: validateOpacity("opacity", input.opacity) } : {}),
    ...(input.hidden !== undefined ? { hidden: Boolean(input.hidden) } : {}),
    fills,
    ...(stroke ? { stroke } : {}),
    ...(input.radius !== undefined ? { radius: num(input.radius) } : {}),
    parentId: null as string | null,
  };

  let shape: DesignShape;
  if (type === "frame") {
    if (input.isScreen === true && parentId) {
      throw new Error('isScreen can only be set on root frames (artboards at page level, parentId null)');
    }
    shape = { ...base, type: "frame", children: [], isScreen: input.isScreen ?? !parentId };
  } else if (type === "circle") {
    shape = { ...base, type: "circle" };
  } else if (type === "group") {
    shape = { ...base, type: "group", children: [] };
  } else if (type === "image") {
    shape = { ...base, type: "image", src: validateAssetSrc("src", input.src), ...(input.fit ? { fit: input.fit } : {}) };
  } else if (type === "text") {
    const text = String(input.text ?? "Text");
    if (text.length > 4000) throw new Error("text must be <= 4000 characters");
    shape = {
      ...base,
      type: "text",
      text,
      fontSize: Math.round(num(input.fontSize, 16)),
      ...(input.fontWeight !== undefined ? { fontWeight: num(input.fontWeight, 400) } : {}),
      ...(input.align !== undefined && ["left", "center", "right"].includes(input.align) ? { align: input.align } : {}),
      color: validateColor("color", input.color, "#f4f4f5"),
    };
  } else {
    shape = { ...base, type: "rect" };
  }

  // attach ke parent (frame/group) atau root halaman
  if (parentId) {
    const parent = page.shapes[parentId];
    if (!parent) throw new Error(`Parent frame not found: ${parentId}`);
    if (!hasChildren(parent)) throw new Error("parentId must reference a frame or group (or null for page root)");
    shape.parentId = parentId;
    // koordinat child = relatif ke parent (konvensi penpot frame)
    parent.children.push(id);
  } else {
    page.roots.push(id);
  }
  page.shapes[id] = shape;
  file.revn += 1;
  file.updatedAt = Date.now();
  saveDesignFile(workspacePath, file);
  return shape;
}

const MUTABLE_COMMON = [
  "name",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "opacity",
  "hidden",
  "locked",
  "radius",
  "fill",
  "fills",
  "strokeColor",
  "strokeWidth",
  "text",
  "fontSize",
  "fontWeight",
  "align",
  "color",
  "interaction",
  "isScreen",
  "src",
  "fit",
] as const;

export function updateDesignShape(
  workspacePath: string,
  fileId: string,
  pageId: string,
  id: string,
  patch: Record<string, unknown>,
): DesignShape {
  const file = mustGetDesignFile(workspacePath, fileId);
  const page = mustGetPage(file, pageId);
  const s = mustGetShape(page, id);
  if (s.locked) throw new Error(`Shape "${s.name}" is locked; unlock first`);
  for (const k of Object.keys(patch)) {
    if (!(MUTABLE_COMMON as readonly string[]).includes(k)) {
      throw new Error(`Cannot patch field "${k}" (mutable: ${MUTABLE_COMMON.join(", ")})`);
    }
  }
  const p = patch as Record<string, never>;
  // P3-PROTO: isScreen hanya untuk frame ROOT (penanda layar prototype)
  if ("isScreen" in patch) {
    if (s.type !== "frame") throw new Error('isScreen can only be set on frames');
    if (s.parentId !== null) {
      throw new Error('isScreen can only be set on root frames (artboards at page level)');
    }
    s.isScreen = Boolean((patch as Record<string, unknown>).isScreen);
  }
  // Prototyping: interaction {action navigate, target frame-root/page} | null (hapus)
  if ("interaction" in patch) {
    const raw = (patch as Record<string, unknown>).interaction as
      | { event?: string; action?: string; target?: unknown }
      | null
      | undefined;
    if (raw === null || raw === undefined) {
      delete s.interaction;
    } else {
      const target = String(raw.target ?? "");
      if (raw.action !== "navigate" || !target) {
        throw new Error('interaction must be { action: "navigate", target: <frameId or pageId> }');
      }
      const targetOk =
        file.pages.some((pg) => pg.id === target) ||
        (page.roots.includes(target) && page.shapes[target]?.type === "frame");
      if (!targetOk) {
        throw new Error(
          `interaction target not found: "${target}" (must be a root frame on this page, or a page id in the same file)`,
        );
      }
      s.interaction = { event: "click", action: "navigate", target };
    }
  }
  if (p.name !== undefined) s.name = String(p.name).trim().slice(0, 120) || s.name;
  if (p.x !== undefined) s.x = num(p.x);
  if (p.y !== undefined) s.y = num(p.y);
  if (p.width !== undefined) s.width = Math.max(1, num(p.width));
  if (p.height !== undefined) s.height = Math.max(1, num(p.height));
  if (p.rotation !== undefined) s.rotation = num(p.rotation) % 360;
  if (p.opacity !== undefined) s.opacity = validateOpacity("opacity", p.opacity);
  if (p.hidden !== undefined) s.hidden = Boolean(p.hidden);
  if (p.locked !== undefined) s.locked = Boolean(p.locked);
  if (p.radius !== undefined) s.radius = Math.min(200, Math.max(0, num(p.radius)));
  if (p.fill !== undefined && s.type !== "text") {
    const c = validateColor("fill", p.fill, "#2c2c34");
    const cur = s.fills[0];
    s.fills = [{ color: c, opacity: cur?.opacity ?? 1 }];
  }
  if (p.fillOpacity !== undefined && s.fills[0]) s.fills[0].opacity = validateOpacity("fillOpacity", p.fillOpacity);
  // D92: patch fills penuh (dipakai utk background image frame) — validasi tiap entri
  if (p.fills !== undefined) {
    const arr = p.fills as unknown;
    if (!Array.isArray(arr)) throw new Error("fills must be an array");
    const next: DesignFill[] = arr.map((f) => {
      const o = f as Partial<DesignFill>;
      return {
        color: validateColor("fills.color", o.color, "#2c2c34"),
        ...(o.opacity !== undefined ? { opacity: validateOpacity("fills.opacity", o.opacity) } : {}),
        ...(o.image !== undefined && o.image !== null ? { image: validateAssetSrc("fills.image", o.image) } : {}),
      };
    });
    if (next.length > 0) s.fills = next;
  }
  // D92: image src / fit
  if (p.src !== undefined && s.type === "image") {
    (s as { src: string }).src = validateAssetSrc("src", p.src);
  }
  if (p.fit !== undefined && s.type === "image") {
    const f = String(p.fit);
    if (!["cover", "contain", "stretch"].includes(f)) throw new Error('fit must be one of: cover, contain, stretch');
    (s as { fit?: string }).fit = f as "cover" | "contain" | "stretch";
  }
  if (p.strokeColor !== undefined || p.strokeWidth !== undefined) {
    const cur = s.stroke ?? { color: "#3a3a44", width: 1 };
    s.stroke = {
      color: p.strokeColor !== undefined ? validateColor("strokeColor", p.strokeColor, cur.color) : cur.color,
      width: p.strokeWidth !== undefined ? Math.max(0, num(p.strokeWidth, cur.width)) : cur.width,
    };
  }
  if (s.type === "text") {
    if (p.text !== undefined) s.text = String(p.text).slice(0, 4000);
    if (p.fontSize !== undefined) s.fontSize = Math.min(200, Math.max(8, Math.round(num(p.fontSize, 16))));
    if (p.fontWeight !== undefined) s.fontWeight = num(p.fontWeight, 400);
    if (p.align !== undefined && ["left", "center", "right"].includes(String(p.align))) s.align = p.align;
    if (p.color !== undefined) s.color = validateColor("color", p.color, "#f4f4f5");
  }
  file.revn += 1;
  file.updatedAt = Date.now();
  saveDesignFile(workspacePath, file);
  return s;
}

/** Hapus shape + seluruh subtree-nya. */
export function deleteDesignShape(workspacePath: string, fileId: string, pageId: string, id: string): { deleted: string[] } {
  const file = mustGetDesignFile(workspacePath, fileId);
  const page = mustGetPage(file, pageId);
  const s = mustGetShape(page, id);
  if (s.locked) throw new Error(`Shape "${s.name}" is locked; unlock first`);
  const removed: string[] = [];
  const walk = (sid: string) => {
    const sh = page.shapes[sid];
    if (!sh) return;
    removed.push(sid);
    if (hasChildren(sh)) for (const c of sh.children) walk(c);
  };
  walk(id);
  for (const sid of removed) delete page.shapes[sid];
  page.roots = page.roots.filter((r) => !removed.includes(r));
  for (const sh of Object.values(page.shapes)) {
    if (hasChildren(sh)) sh.children = sh.children.filter((c) => !removed.includes(c));
  }
  // bersihkan wiring prototyping yang mengarah ke shape terhapus (semua halaman)
  for (const pg of file.pages) {
    for (const sh of Object.values(pg.shapes)) {
      if (sh.interaction && removed.includes(sh.interaction.target)) delete sh.interaction;
    }
  }
  file.revn += 1;
  file.updatedAt = Date.now();
  saveDesignFile(workspacePath, file);
  return { deleted: removed };
}

export { isHexColor, normalizeHex };
