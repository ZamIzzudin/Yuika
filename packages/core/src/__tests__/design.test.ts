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

it("prototyping: wiring interaction on-click + validasi target + cleanup saat delete", async () => {
  const f = await run("design_create_file", { name: "Flow" });
  const fileId = f.fileId as string;
  const p1 = (f.page as { id: string }).id;
  const login = (await run("design_add_shape", {
    fileId, pageId: p1, shape: { type: "frame", name: "Login", x: 0, y: 0, width: 390, height: 844 },
  })) as { id: string };
  const dash = (await run("design_add_shape", {
    fileId, pageId: p1, shape: { type: "frame", name: "Dashboard", x: 450, y: 0, width: 390, height: 844 },
  })) as { id: string };
  const btn = (await run("design_add_shape", {
    fileId, pageId: p1, parentId: login.id, shape: { type: "rect", name: "Button Sign in", x: 48, y: 700, width: 294, height: 48, fill: "#007cf7" },
  })) as { id: string };

  // wire ke frame root lain + ke halaman
  await run("design_update_shape", { fileId, pageId: p1, id: btn.id, patch: { interaction: { action: "navigate", target: dash.id } } });
  const p2 = await run("design_add_page", { fileId, name: "Onboarding" });
  const heading = (await run("design_add_shape", {
    fileId, pageId: p1, parentId: login.id, shape: { type: "text", name: "Title", x: 24, y: 60, width: 342, height: 40, text: "Welcome", fontSize: 28, color: "#f4f4f5" },
  })) as { id: string };
  await run("design_update_shape", { fileId, pageId: p1, id: heading.id, patch: { interaction: { action: "navigate", target: (p2 as { pageId: string }).pageId } } });

  let file = getDesignFile(dir, fileId)!;
  expect(file.pages[0]!.shapes[btn.id]!.interaction).toEqual({ event: "click", action: "navigate", target: dash.id });

  // ringkasan persona/coder menampilkan wiring
  const got = await run("design_get_file", { fileId });
  const btnSum = (got.pages as Array<{ shapes: Array<Record<string, unknown>> }>)[0]!.shapes.find((s) => s.name === "Button Sign in")!;
  expect(btnSum.onClick).toBe(`navigate:${dash.id}`);

  // target tidak valid ditolak (ENGLISH)
  await expect(
    run("design_update_shape", { fileId, pageId: p1, id: btn.id, patch: { interaction: { action: "navigate", target: "nope" } } }),
  ).rejects.toThrow(/target not found/);
  // shape non-root (btn adalah anak frame) tidak sah sebagai target
  await expect(
    run("design_update_shape", { fileId, pageId: p1, id: btn.id, patch: { interaction: { action: "navigate", target: btn.id } } }),
  ).rejects.toThrow(/target not found/);

  // null = hapus wiring
  await run("design_update_shape", { fileId, pageId: p1, id: heading.id, patch: { interaction: null } });
  file = getDesignFile(dir, fileId)!;
  expect(file.pages[0]!.shapes[heading.id]!.interaction).toBeUndefined();

  // hapus frame target → wiring yang mengarah ke sana ikut bersih
  await run("design_update_shape", { fileId, pageId: p1, id: btn.id, patch: { interaction: { action: "navigate", target: dash.id } } });
  await run("design_delete_shape", { fileId, pageId: p1, id: dash.id });
  file = getDesignFile(dir, fileId)!;
  expect(file.pages[0]!.shapes[btn.id]!.interaction).toBeUndefined();
});

it("isScreen: frame root default layar, nested/loose tidak; validasi English", async () => {
  const f = await run("design_create_file", { name: "S" });
  const fileId = f.fileId as string;
  const p1 = (f.page as { id: string }).id;
  const root = (await run("design_add_shape", {
    fileId, pageId: p1, shape: { type: "frame", name: "Artboard", x: 0, y: 0, width: 390, height: 844 },
  })) as { id: string };
  const nested = addDesignShape(dir, fileId, p1, { type: "frame", width: 100, height: 50, x: 0, y: 0 }, root.id);
  const loose = addDesignShape(dir, fileId, p1, { type: "rect", width: 10, height: 10, x: 0, y: 0 });

  let file = getDesignFile(dir, fileId)!;
  expect((file.pages[0]!.shapes[root.id] as { isScreen?: boolean }).isScreen).toBe(true); // default root = screen
  expect((file.pages[0]!.shapes[nested.id] as { isScreen?: boolean }).isScreen).toBe(false); // nested bukan layar
  // loose node tidak punya konsep isScreen (bukan frame)
  expect(file.pages[0]!.shapes[loose.id]!.type).toBe("rect");

  // uncheck → keluar dari prototype
  await run("design_update_shape", { fileId, pageId: p1, id: root.id, patch: { isScreen: false } });
  file = getDesignFile(dir, fileId)!;
  expect((file.pages[0]!.shapes[root.id] as { isScreen?: boolean }).isScreen).toBe(false);

  // isScreen pada non-frame / frame bersarang → error English
  await expect(
    run("design_update_shape", { fileId, pageId: p1, id: loose.id, patch: { isScreen: true } }),
  ).rejects.toThrow(/only be set on frames/);
  await expect(
    run("design_update_shape", { fileId, pageId: p1, id: nested.id, patch: { isScreen: true } }),
  ).rejects.toThrow(/root frames/);
  expect(() =>
    addDesignShape(dir, fileId, p1, { type: "frame", width: 10, height: 10, x: 0, y: 0, isScreen: true }, root.id),
  ).toThrow(/root frames/);

  // ringkasan menampilkan isScreen untuk frame root
  await run("design_update_shape", { fileId, pageId: p1, id: root.id, patch: { isScreen: true } });
  const got = await run("design_get_file", { fileId });
  const art = (got.pages as Array<{ shapes: Array<Record<string, unknown>> }>)[0]!.shapes.find((s) => s.name === "Artboard")!;
  expect(art.isScreen).toBe(true);
  expect((got.pages as Array<{ shapes: Array<Record<string, unknown>> }>)[0]!.shapes.find((s) => s.id === nested.id)!.isScreen).toBeUndefined(); // nested frame tidak diberi penanda di ringkasan
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
