import { it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registry, resetRegistryForTests } from "../registry.js";
import { registerDesignTools } from "../tools/design-tools.js";
import { registerFileTools } from "../tools/file-tools.js";

it("probe: picasso bikin text Google Font + icon via design_add_shape", async () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "yui-probe-"));
  resetRegistryForTests();
  registerFileTools(ws);
  registerDesignTools(ws);
  const cf = { h: (a: unknown) => registry.dispatch("design_create_file", a, { projectId: "probe" } as never) };
  const add = { h: (a: unknown) => registry.dispatch("design_add_shape", a, {} as never) };
  const gf = { h: (a: unknown) => registry.dispatch("design_get_file", a, {} as never) };
  const mk = async (name: string) => (await cf.h({ name }, { projectId: "probe" })) as { result: { fileId: string; page: { id: string } } };
  const f = await mk("D102 probe");
  const fileId = f.result.fileId;
  const pageId = f.result.page.id;
  // frame
  const frame = (await add.h({ fileId, pageId, shape: { type: "frame", name: "Home", x: 0, y: 0, width: 390, height: 844 } }, {})) as { result: { id: string } };
  // text dengan Google Font
  const t = await add.h({ fileId, pageId, parentId: frame.result.id, shape: { type: "text", text: "Ringkasan", x: 24, y: 32, width: 300, height: 40, fontSize: 28, fontWeight: 700, fontFamily: "Space Grotesk", color: "#f4f4f5" } }, {}) as { result: { id: string } };
  expect(t.result.id).toBeTruthy();
  // icon
  const ic = await add.h({ fileId, pageId, parentId: frame.result.id, shape: { type: "icon", icon: "chart-line-up", x: 24, y: 88, width: 24, height: 24, fill: "#22c55e" } }, {}) as { result: { id: string } };
  expect(ic.result.id).toBeTruthy();
  // font invalid ditolak oleh schema/store
  const bad = await add.h({ fileId, pageId, shape: { type: "text", text: "x", x: 0, y: 0, width: 10, height: 10, fontFamily: "Tidak Ada Font" } }, {});
  expect(JSON.stringify(bad)).toMatch(/not in the Google Fonts bank/);
  const badIcon = await add.h({ fileId, pageId, shape: { type: "icon", icon: "unicorn", x: 0, y: 0, width: 20, height: 20 } }, {});
  expect(JSON.stringify(badIcon)).toMatch(/not found in the icon bank/);
  // ringkasan memuat fontFamily + icon
  const sum = (await gf.h({ fileId }, {})) as { result: { pages: { shapes: Record<string, unknown>[] }[] } };
  const shapes = sum.result.pages[0]!.shapes;
  expect(shapes.some((s) => s.fontFamily === "Space Grotesk")).toBe(true);
  expect(shapes.some((s) => s.icon === "chart-line-up")).toBe(true);
});
