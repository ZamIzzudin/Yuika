// P3-CANVAS: store + tools desain embedded (menggantikan jalur Penpot RPC).
import { it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registry, resetRegistryForTests } from "../registry.js";
import { registerDesignTools } from "../tools/design-tools.js";
import {
  createDesignFile,
  addDesignShape,
  addDesignPage,
  updateDesignShape,
  deleteDesignShape,
  getDesignFile,
  listDesignFiles,
} from "../design/store.js";

let dir: string = "";
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-design-"));
  resetRegistryForTests();
  registerDesignTools(dir);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const ctx = { sessionId: "s", turnId: "t", workspacePath: dir, emit: () => {}, requestApproval: async () => true };
const run = async (name: string, args: unknown) => {
  const res = await registry.dispatch(name, args, ctx);
  const r = res.result as Record<string, unknown>;
  if (res.isError) throw new Error(String(r.error));
  return r;
};

it("create → add shapes (frame + anak + text) → get ringkasan", async () => {
  const f = await run("design_create_file", { name: "Login — Mobile" });
  expect(f.page).toMatchObject({ name: "Page 1" });
  const fileId = f.fileId as string;
  const pageId = (f.page as { id: string }).id;

  const frame = (await run("design_add_shape", {
    fileId,
    pageId,
    shape: { type: "frame", name: "Artboard 390", x: 0, y: 0, width: 390, height: 844, fill: "#101014" },
  })) as { id: string };
  const btn = (await run("design_add_shape", {
    fileId,
    pageId,
    parentId: frame.id,
    shape: { type: "rect", name: "Button Sign in", x: 48, y: 520, width: 294, height: 48, fill: "#007cf7", radius: 10 },
  })) as { id: string };
  await run("design_add_shape", {
    fileId,
    pageId,
    parentId: frame.id,
    shape: { type: "text", name: "Button label", x: 48, y: 536, width: 294, height: 20, text: "Sign in", fontSize: 15, color: "#ffffff", align: "center" },
  });

  const got = await run("design_get_file", { fileId });
  const page = (got.pages as Array<{ id: string; shapes: Array<Record<string, unknown>> }>)[0]!;
  expect(page.shapes).toHaveLength(3);
  const art = page.shapes.find((s) => s.name === "Artboard 390")!;
  expect(art.type).toBe("frame");
  const label = page.shapes.find((s) => s.name === "Button label")!;
  expect(label.parentId).toBe(art.id);
  // P2-DSN-4: ringkasan kaya untuk coder — fill/radius + teks lengkap
  const btnShape = page.shapes.find((s) => s.name === "Button Sign in")!;
  expect(btnShape.fill).toBe("#007cf7");
  expect(btnShape.radius).toBe(10);
  expect(label).toMatchObject({ text: "Sign in", fontSize: 15 });
  expect((got as { revn: number }).revn).toBeGreaterThanOrEqual(3);

  // update patch
  await run("design_update_shape", { fileId, pageId, id: btn.id, patch: { fill: "#22c55e", radius: 24 } });
  const f2 = getDesignFile(dir, fileId)!;
  const b2 = f2.pages[0]!.shapes[btn.id]!;
  expect(b2.fills[0]!.color).toBe("#22c55e");
  expect(b2.radius).toBe(24);

  // delete frame → anak ikut
  const del = await run("design_delete_shape", { fileId, pageId, id: frame.id });
  expect((del.deleted as string[]).sort()).toEqual([btn.id, frame.id, label.id].sort());
  const f3 = getDesignFile(dir, fileId)!;
  expect(Object.keys(f3.pages[0]!.shapes)).toHaveLength(0);
  expect(f3.pages[0]!.roots).toHaveLength(0);
});

it("add_page + list + hit test koordinat relatif tersimpan benar", async () => {
  const f = await run("design_create_file", { name: "Multi" });
  const p2 = await run("design_add_page", { fileId: f.fileId, name: "Dashboard" });
  expect((p2 as { name: string }).name).toBe("Dashboard");
  const file = getDesignFile(dir, f.fileId as string)!;
  expect(file.pages).toHaveLength(2);
  const lst = await run("design_list", {});
  expect((lst.files as Array<{ id: string; pages: number }>)[0]!.pages).toBe(2);

  const fr = addDesignShape(dir, f.fileId as string, file.pages[0]!.id, { type: "frame", width: 100, height: 100, x: 10, y: 20 });
  addDesignShape(dir, f.fileId as string, file.pages[0]!.id, { type: "rect", width: 30, height: 30, x: 5, y: 5 }, fr.id);
  const stored = getDesignFile(dir, f.fileId as string)!;
  const rect = Object.values(stored.pages[0]!.shapes).find((s) => s.type === "rect")!;
  expect(rect.x).toBe(5); // relatif frame, bukan absolut
  expect(rect.parentId).toBe(fr.id);
  expect(stored.pages[0]!.roots).toEqual([fr.id]);
});

it("validasi: warna salah, ukuran, dan field patch terlarang ditolak (ENGLISH)", async () => {
  const f = await run("design_create_file", { name: "V" });
  const fileId = f.fileId as string;
  const pageId = (f.page as { id: string }).id;
  // level schema (zod) → "invalid args"; level handler/store → pesan English eksplisit
  await expect(
    run("design_add_shape", { fileId, pageId, shape: { type: "rect", width: 10, height: 10, fill: "merah" } }),
  ).rejects.toThrow();
  expect(() =>
    addDesignShape(dir, fileId, pageId, { type: "rect", width: 10, height: 10, x: 0, y: 0, fill: "merah" }),
  ).toThrow(/hex color/);
  await expect(
    run("design_add_shape", { fileId, pageId, shape: { type: "rect", width: 0, height: 10 } }),
  ).rejects.toThrow(); // schema zod menolak lebih dulu (invalid args)
  expect(() =>
    addDesignShape(dir, fileId, pageId, { type: "rect", width: 0, height: 10, x: 0, y: 0 }),
  ).toThrow(/width\/height/);
  const s = (await run("design_add_shape", { fileId, pageId, shape: { type: "rect", width: 10, height: 10 } })) as { id: string };
  await expect(
    run("design_update_shape", { fileId, pageId, id: s.id, patch: { type: "circle" } }),
  ).rejects.toThrow(/Cannot patch field "type"/);
  await expect(run("design_get_file", { fileId: "tidakada" })).rejects.toThrow(/not found/);
});
