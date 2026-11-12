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
    type: z.enum(["frame", "rect", "circle", "text"]),
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
    color: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
  })
  .describe("Shape fields; frame = artboard/container, text = label dengan content, group = wadah logis tanpa visual (D92), image = gambar upload (D92, pakai src)");

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
                ...(s.fontWeight ? { fontWeight: s.fontWeight } : {}),
                ...(s.color ? { color: s.color } : {}),
                ...(s.align ? { align: s.align } : {}),
              }
            : {}),
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
      "Baca struktur file desain (ringkasan per halaman: shapes + posisi + teks). Dipakai untuk melihat hasil (termasuk edit user) atau sebagai input generate komponen (fase develop).",
    parameters: z.object({ fileId: z.string().min(1) }),
    handler: async (args) => {
      const f = mustGetDesignFile(workspacePath, args.fileId);
      const s = summarize(f);
      const json = JSON.stringify(s);
      if (json.length > 60_000) {
        return { result: { ...s, note: "file besar; per halaman perlu diproses bertahap" } };
      }
      return { result: s };
    },
  });
}
