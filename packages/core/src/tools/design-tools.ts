// @yuika/core, P3-CANVAS: tools desain embedded untuk persona Designer.
// Menggambar langsung ke file JSON host (workspace/design/) — tanpa server
// eksternal, tanpa token. User melihat + mengedit hasilnya di tab Design
// (canvas editor built-in); perubahan user juga terbaca persona lewat
// design_get_file. Jalur ini MENGGANTIKAN connector Penpot (P2-DSN-*).
import { z } from "zod";
import { registry } from "../registry.js";
import {
  addDesignPage,
  addDesignShape,
  createDesignFile,
  deleteDesignFile,
  deleteDesignPage,
  deleteDesignShape,
  getDesignFile,
  listDesignFiles,
  mustGetDesignFile,
  updateDesignShape,
} from "../design/store.js";

const shapeFields = z
  .object({
    type: z.enum(["frame", "rect", "circle", "text", "icon"]),
    name: z.string().max(120).optional(),
    x: z.number().default(0),
    y: z.number().default(0),
    width: z.number().min(1),
    height: z.number().min(1),
    fill: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
    fillOpacity: z.number().min(0).max(1).optional(),
    strokeColor: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
    strokeWidth: z.number().min(0).max(40).optional(),
    radius: z.number().min(0).max(200).optional(),
    rotation: z.number().optional(),
    opacity: z.number().min(0).max(1).optional(),
    hidden: z.boolean().optional(),
    isScreen: z.boolean().optional(),
    text: z.string().max(4000).optional(),
    fontSize: z.number().min(8).max(200).optional(),
    fontWeight: z.number().min(100).max(900).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    fontFamily: z
      .string()
      .max(64)
      .optional()
      .describe("Google Fonts bank family utk text, mis. 'Playfair Display', 'JetBrains Mono', 'Space Grotesk'; katalog di skill design-canvas-basics"),
    icon: z.string().max(64).optional().describe("nama ikon kebab-case utk type icon, mis. 'house', 'chart-line-up', 'magnifying-glass'; katalog di skill design-canvas-basics"),
    color: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
  })
  .describe("Shape fields; frame = artboard/container, text = label dengan content (fontFamily dari Google Fonts bank), group = wadah logis tanpa visual (D92), image = gambar upload (D92, pakai src), icon = ikon SVG dari bank (D103, pakai nama kebab-case di field icon)");

/** Koordinat absolut shape (jumlah rantai parent) — dipakai filter region. */
function absPos(s: DesignShapeLike, page: { shapes: Record<string, DesignShapeLike> }): { x: number; y: number } {
  let x = s.x;
  let y = s.y;
  let p = s.parentId ? page.shapes[s.parentId] : undefined;
  while (p) {
    x += p.x;
    y += p.y;
    p = p.parentId ? page.shapes[p.parentId] : undefined;
  }
  return { x, y };
}

type DesignShapeLike = {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string | null;
  hidden?: boolean;
  fills: { color?: string; opacity?: number; image?: string }[];
  radius?: number;
  stroke?: { color: string; width: number };
  children?: string[];
  interaction?: { target: string } | null;
  isScreen?: boolean;
} & Record<string, unknown>;

type DesignPageLike = {
  id: string;
  name: string;
  background: string;
  roots: string[];
  shapes: Record<string, DesignShapeLike>;
};

type DesignFileLike = {
  id: string;
  name: string;
  revn: number;
  pages: DesignPageLike[];
};

const READ_LIMIT = 18_000; // batas aman di bawah pemotong 20k tool-output loop

/** Ringkas satu shape (dipakai summarize penuh & region). */
function shapeRow(s: DesignShapeLike): Record<string, unknown> {
  return {
    id: s.id,
    name: s.name,
    type: s.type,
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
    parentId: s.parentId,
    ...(s.fills[0]?.color ? { fill: s.fills[0].color } : {}),
    ...(s.fills[0]?.opacity !== undefined && s.fills[0].opacity !== 1
      ? { fillOpacity: s.fills[0].opacity }
      : {}),
    ...(s.radius ? { radius: s.radius } : {}),
    ...(s.stroke ? { strokeColor: s.stroke.color, strokeWidth: s.stroke.width } : {}),
    ...(s.hidden ? { hidden: true } : {}),
    ...(s.type === "text"
      ? {
          text: String(s.text ?? "").slice(0, 120),
          fontSize: s.fontSize,
          ...(s.fontFamily ? { fontFamily: s.fontFamily } : {}),
          ...(s.fontWeight ? { fontWeight: s.fontWeight } : {}),
          ...(s.color ? { color: s.color } : {}),
          ...(s.align ? { align: s.align } : {}),
        }
      : {}),
    ...(s.type === "icon" ? { icon: s.icon } : {}),
    ...(s.type === "image" ? { src: s.src, fit: s.fit ?? "cover" } : {}),
    ...(s.fills[0]?.image ? { backgroundImage: s.fills[0].image } : {}),
    ...(s.type === "group" ? { children: (s.children ?? []).length } : {}),
    ...(s.interaction ? { onClick: `navigate:${s.interaction.target}` } : {}),
    ...(s.type === "frame" && !s.parentId ? { isScreen: s.isScreen !== false } : {}),
  };
}

/** Indeks frame utk file besar: root units + frame level-2 (seksi) dgn bbox
 *  ABSOLUT + jumlah subtree — peta navigasi sebelum baca per region. */
function frameIndex(file: DesignFileLike): Record<string, unknown> {
  return {
    id: file.id,
    name: file.name,
    revn: file.revn,
    tooLarge: true,
    note:
      "file too large for a single read. Browse pages[].frames below (absolute Y ranges), then call again with pageId + yMin/yMax (a 600-800px Y window) or shapeId (one component subtree).",
    pages: file.pages.map((p) => {
      const frames: Record<string, unknown>[] = [];
      const countSub = (id: string): number => {
        const s = p.shapes[id];
        if (!s) return 0;
        let n = 1;
        for (const c of s.children ?? []) n += countSub(c);
        return n;
      };
      for (const rid of p.roots) {
        const r = p.shapes[rid];
        if (!r) continue;
        const a = absPos(r, p);
        frames.push({
          id: r.id,
          name: r.name,
          level: 1,
          absX: a.x,
          absY: a.y,
          width: r.width,
          height: r.height,
          shapes: countSub(r.id),
          ...(r.interaction ? { onClick: `navigate:${r.interaction.target}` } : {}),
        });
        if (r.type === "frame" || r.type === "group") {
          for (const cid of r.children ?? []) {
            const c = p.shapes[cid];
            if (!c || (c.type !== "frame" && c.type !== "group")) continue;
            const ca = absPos(c, p);
            frames.push({
              id: c.id,
              name: c.name,
              level: 2,
              absX: ca.x,
              absY: ca.y,
              width: c.width,
              height: c.height,
              shapes: countSub(c.id),
            });
          }
        }
      }
      return {
        id: p.id,
        name: p.name,
        shapeCount: Object.keys(p.shapes).length,
        frames,
      };
    }),
  };
}

/** Baca parsial: satu page, opsional region Y absolut / subtree shapeId.
 *  Unit = root shape, atau frame level-2 saat root frame panjang (landing). */
function summarizeRegion(
  file: DesignFileLike,
  pageId: string,
  opts: { yMin?: number; yMax?: number; shapeId?: string },
): { ok: true; result: Record<string, unknown> } | { ok: false; error: string } {
  const page = file.pages.find((p) => p.id === pageId);
  if (!page) return { ok: false, error: "pageId not found in this file" };

  const hasKids = (s: DesignShapeLike) => s.type === "frame" || s.type === "group";
  const included = new Set<string>();
  const unitFrames: Record<string, unknown>[] = [];

  const addSubtree = (id: string) => {
    const s = page.shapes[id];
    if (!s || included.has(id)) return;
    included.add(id);
    for (const c of s.children ?? []) addSubtree(c);
  };

  if (opts.shapeId) {
    const t = page.shapes[opts.shapeId];
    if (!t) return { ok: false, error: "shapeId not found on this page" };
    addSubtree(opts.shapeId);
    const a = absPos(t, page);
    unitFrames.push({
      id: t.id,
      name: t.name,
      absX: a.x,
      absY: a.y,
      width: t.width,
      height: t.height,
    });
    // jalur ancestor supaya posisi absolut bisa direkonstruksi
    const chain: string[] = [];
    let p = t.parentId ? page.shapes[t.parentId] : undefined;
    while (p) {
      chain.unshift(p.id);
      included.add(p.id);
      p = p.parentId ? page.shapes[p.parentId] : undefined;
    }
    return finishRegion(file, page, included, unitFrames, chain, opts);
  }

  const yMin = opts.yMin;
  const yMax = opts.yMax;
  if (yMin === undefined && yMax === undefined) {
    // tanpa region: seluruh halaman (pemanggil sudah cek ukuran)
    for (const rid of page.roots) addSubtree(rid);
    return finishRegion(file, page, included, unitFrames, [], opts);
  }
  const lo = yMin ?? -Infinity;
  const hi = yMax ?? Infinity;

  for (const rid of page.roots) {
    const r = page.shapes[rid];
    if (!r) continue;
    const a = absPos(r, page);
    const top = a.y;
    const bot = a.y + r.height;
    if (!hasKids(r)) {
      if (bot >= lo && top <= hi) addSubtree(r.id);
      continue;
    }
    const rootInside = top >= lo && bot <= hi;
    if (rootInside) {
      addSubtree(r.id);
      const a2 = absPos(r, page);
      unitFrames.push({ id: r.id, name: r.name, absX: a2.x, absY: a2.y, width: r.width, height: r.height });
      continue;
    }
    if (bot < lo || top > hi) continue; // root di luar region
    // root panjang overlap parsial: sertakan root sbg konteks + anak level-2 yang overlap
    included.add(r.id);
    for (const cid of r.children ?? []) {
      const c = page.shapes[cid];
      if (!c) continue;
      const ca = absPos(c, page);
      const ct = ca.y;
      const cb = ca.y + c.height;
      if (cb >= lo && ct <= hi) {
        addSubtree(c.id);
        if (hasKids(c)) {
          unitFrames.push({ id: c.id, name: c.name, absX: ca.x, absY: ca.y, width: c.width, height: c.height });
        }
      }
    }
  }
  return finishRegion(file, page, included, unitFrames, [], opts);
}

function finishRegion(
  file: DesignFileLike,
  page: DesignPageLike,
  included: Set<string>,
  unitFrames: Record<string, unknown>[],
  chain: string[],
  opts: { yMin?: number; yMax?: number; shapeId?: string },
): { ok: true; result: Record<string, unknown> } | { ok: false; error: string } {
  // urut: group by parentId lalu y,x (konsisten dgn summarize penuh)
  const rows = Object.values(page.shapes)
    .filter((s) => included.has(s.id))
    .sort((a, b) => {
      const pa = a.parentId ?? "";
      const pb = b.parentId ?? "";
      if (pa !== pb) return pa < pb ? -1 : 1;
      return a.y - b.y || a.x - b.x;
    })
    .map(shapeRow);
  const result: Record<string, unknown> = {
    id: file.id,
    name: file.name,
    revn: file.revn,
    page: { id: page.id, name: page.name, background: page.background },
    ...(opts.yMin !== undefined || opts.yMax !== undefined
      ? { region: { yMin: opts.yMin ?? null, yMax: opts.yMax ?? null } }
      : {}),
    ...(opts.shapeId ? { shapeId: opts.shapeId } : {}),
    ...(chain.length ? { ancestorChain: chain } : {}),
    ...(unitFrames.length ? { unitFrames } : {}),
    shapes: rows,
    note:
      "x/y are relative to the parent shape (parentId); unitFrames/ancestorChain give absolute placement. Missing shapes live outside this region - read another window.",
  };
  const len = JSON.stringify(result).length;
  if (len > READ_LIMIT) {
    return {
      ok: false,
      error: `selected slice still too large (~${len} chars, limit ${READ_LIMIT}); narrow yMin/yMax or read a single shapeId subtree`,
    };
  }
  return { ok: true, result };
}

/** Ringkas file untuk prompt persona (tanpa mengirim seluruh JSON). */
function summarize(file: ReturnType<typeof getDesignFile> & {}): Record<string, unknown> {
  const f = file as NonNullable<ReturnType<typeof getDesignFile>>;
  return {
    id: f.id,
    name: f.name,
    revn: f.revn,
    pages: f.pages.map((p) => ({
      id: p.id,
      name: p.name,
      // flat tapi ter-grup per frame (anak mengikuti kelompok parent, urut y lalu x)
      shapes: Object.values(p.shapes)
        .sort((a, b) => {
          const pa = a.parentId ?? "";
          const pb = b.parentId ?? "";
          if (pa !== pb) return pa < pb ? -1 : 1;
          return a.y - b.y || a.x - b.x;
        })
        .map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          x: s.x,
          y: s.y,
          width: s.width,
          height: s.height,
          parentId: s.parentId,
          ...(s.fills[0]?.color ? { fill: s.fills[0].color } : {}),
          ...(s.fills[0]?.opacity !== undefined && s.fills[0].opacity !== 1
            ? { fillOpacity: s.fills[0].opacity }
            : {}),
          ...(s.radius ? { radius: s.radius } : {}),
          ...(s.stroke ? { strokeColor: s.stroke.color, strokeWidth: s.stroke.width } : {}),
          ...(s.hidden ? { hidden: true } : {}),
          ...(s.type === "text"
            ? {
                text: s.text.slice(0, 120),
                fontSize: s.fontSize,
                ...(s.fontFamily ? { fontFamily: s.fontFamily } : {}),
                ...(s.fontWeight ? { fontWeight: s.fontWeight } : {}),
                ...(s.color ? { color: s.color } : {}),
                ...(s.align ? { align: s.align } : {}),
              }
            : {}),
          ...(s.type === "icon" ? { icon: s.icon } : {}),
          ...(s.type === "image" ? { src: s.src, fit: s.fit ?? "cover" } : {}),
          ...(s.fills[0]?.image ? { backgroundImage: s.fills[0].image } : {}),
          ...(s.type === "group" ? { children: s.children.length } : {}),
          ...(s.interaction ? { onClick: `navigate:${s.interaction.target}` } : {}),
          ...(s.type === "frame" && !s.parentId ? { isScreen: s.isScreen !== false } : {}),
        })),
    })),
  };
}

export function registerDesignTools(workspacePath: string): void {
  registry.register({
    name: "design_list",
    description:
      "Daftar file desain di host ini (tab Design). Default: hanya file project sesi ini (+ file legacy tanpa project).",
    parameters: z.object({ projectId: z.string().optional() }),
    handler: async (args, ctx) => ({
      result: { files: listDesignFiles(workspacePath, args.projectId ?? ctx.projectId ?? null) },
    }),
  });

  registry.register({
    name: "design_create_file",
    description:
      "Buat file desain baru (satu halaman 'Page 1' kosong). Mulai dari sini lalu design_add_shape. File langsung terlihat user di tab Design dan otomatis terikat ke project sesi ini.",
    parameters: z.object({ name: z.string().min(1).max(120) }),
    handler: async (args, ctx) => {
      const f = createDesignFile(workspacePath, args.name, ctx.projectId ?? null);
      return { result: { fileId: f.id, name: f.name, projectId: f.projectId ?? null, page: { id: f.pages[0]!.id, name: f.pages[0]!.name }, revn: f.revn } };
    },
  });

  registry.register({
    name: "design_add_page",
    description: "Tambah halaman baru ke file desain (untuk layar/multi-flow berbeda).",
    parameters: z.object({ fileId: z.string().min(1), name: z.string().max(80).optional() }),
    handler: async (args) => {
      const p = addDesignPage(workspacePath, args.fileId, args.name);
      return { result: { pageId: p.id, name: p.name } };
    },
  });

  registry.register({
    name: "design_delete_page",
    description: "Hapus halaman dari file desain (tidak bisa menghapus halaman terakhir). Wiring navigasi ke halaman terhapus dibersihkan otomatis.",
    parameters: z.object({ fileId: z.string().min(1), pageId: z.string().min(1) }),
    handler: async (args) => ({ result: deleteDesignPage(workspacePath, args.fileId, args.pageId) }),
  });

  registry.register({
    name: "design_delete_file",
    description: "Hapus SELURUH file desain (semua halaman dan shape di dalamnya, permanen). Hanya untuk file yang jelas tidak dipakai lagi — konfirmasi dengan user bila ragu.",
    parameters: z.object({ fileId: z.string().min(1) }),
    handler: async (args) => ({ result: deleteDesignFile(workspacePath, args.fileId) }),
  });

  registry.register({
    name: "design_add_shape",
    description:
      "Tambah shape ke halaman. Alur khas: frame (artboard layar, mis. 390x844) → anak-anaknya (rect/circle/text dengan parentId=frame, koordinat RELATIF frame). Koordinat root halaman = relatif kanvas.",
    parameters: z.object({
      fileId: z.string().min(1),
      pageId: z.string().min(1),
      parentId: z.string().min(1).nullable().optional().describe("id frame induk; kosong/null = level halaman"),
      shape: shapeFields,
    }),
    handler: async (args) => {
      const s = addDesignShape(workspacePath, args.fileId, args.pageId, args.shape, args.parentId ?? null);
      return {
        result: {
          id: s.id,
          name: s.name,
          type: s.type,
          hint: "User melihat hasilnya di tab Design (refresh otomatis); koordinat anak = relatif frame induk",
        },
      };
    },
  });

  registry.register({
    name: "design_update_shape",
    description:
      "Ubah sebagian field shape (patch). Bisa dipakai untuk iterasi desain atau menyesuaikan hasil edit user. Untuk prototyping: patch.interaction = { action: 'navigate', target: <id frame root / id halaman> } meng-wire on-click; null menghapus wiring.",
    parameters: z.object({
      fileId: z.string().min(1),
      pageId: z.string().min(1),
      id: z.string().min(1),
      patch: shapeFields.partial().extend({
        locked: z.boolean().optional(),
        interaction: z
          .object({ action: z.literal("navigate"), target: z.string().min(1) })
          .nullable()
          .optional(),
      }),
    }),
    handler: async (args) => {
      const s = updateDesignShape(workspacePath, args.fileId, args.pageId, args.id, args.patch);
      return { result: { id: s.id, name: s.name, type: s.type } };
    },
  });

  registry.register({
    name: "design_delete_shape",
    description: "Hapus shape beserta seluruh anak-anaknya (kalau frame).",
    parameters: z.object({ fileId: z.string().min(1), pageId: z.string().min(1), id: z.string().min(1) }),
    handler: async (args) => ({ result: deleteDesignShape(workspacePath, args.fileId, args.pageId, args.id) }),
  });

  registry.register({
    name: "design_get_file",
    description:
      "Baca struktur file desain (ringkasan per halaman: shapes + posisi + teks). Dipakai untuk melihat hasil (termasuk edit user) atau sebagai input generate komponen (fase develop). File besar otomatis dijawab INDEKS frame (bbox absolut) - lalu panggil lagi dengan pageId + yMin/yMax (jendela Y absolut 600-800px) atau shapeId (subtree satu komponen) untuk membaca bertahap.",
    parameters: z.object({
      fileId: z.string().min(1),
      pageId: z.string().optional().describe("Baca hanya halaman ini (dari indeks/daftar page)"),
      yMin: z.number().optional().describe("Filter region: batas bawah Y absolut (world)"),
      yMax: z.number().optional().describe("Filter region: batas atas Y absolut (world)"),
      shapeId: z.string().optional().describe("Baca subtree satu shape/komponen (plus jalur ancestor)"),
    }),
    handler: async (args) => {
      const f = mustGetDesignFile(workspacePath, args.fileId);
      const partial = args.pageId || args.yMin !== undefined || args.yMax !== undefined || args.shapeId;
      if (partial) {
        const r = summarizeRegion(f as unknown as DesignFileLike, args.pageId ?? f.pages[0]!.id, {
          yMin: args.yMin,
          yMax: args.yMax,
          shapeId: args.shapeId,
        });
        if (!r.ok) return { result: { error: r.error }, isError: true };
        return { result: r.result };
      }
      const s = summarize(f);
      if (JSON.stringify(s).length > READ_LIMIT) {
        return { result: frameIndex(f as unknown as DesignFileLike) };
      }
      return { result: s };
    },
  });
}
