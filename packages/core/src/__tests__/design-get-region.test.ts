// D111: design_get_file bertahap utk file besar (kasus KodeKraf 2704px yang
// terpotong di 20k tool-output loop). Tanpa filter + > READ_LIMIT -> indeks
// frame (bbox absolut). pageId+yMin/yMax -> region; shapeId -> subtree.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registry, resetRegistryForTests } from "../registry.js";
import { registerDesignTools } from "../tools/design-tools.js";

async function mkBigFile() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "yui-region-"));
  resetRegistryForTests();
  registerDesignTools(ws);
  const d = async (name: string, a: unknown) =>
    (await registry.dispatch(name, a, {} as never)) as {
      result?: Record<string, never> & { error?: string };
      isError?: boolean;
    };
  const cf = (await d("design_create_file", { name: "Tall Landing" })) as unknown as {
    result: { fileId: string; page: { id: string } };
  };
  const fileId = cf.result.fileId;
  const pageId = cf.result.page.id;
  const root = (await d("design_add_shape", {
    fileId, pageId,
    shape: { type: "frame", name: "Artboard", x: 0, y: 0, width: 1440, height: 2704 },
  })) as unknown as { result: { id: string } };
  // 3 seksi level-2 (Hero y0, Services y900, CTA y1800), tiap seksi 40 teks
  const sections: { id: string; tag: string }[] = [];
  for (const [i, tag] of ["HERO", "SERVICES", "CTA"].entries()) {
    const sec = (await d("design_add_shape", {
      fileId, pageId, parentId: root.result.id,
      shape: { type: "frame", name: `Section ${tag}`, x: 0, y: i * 900, width: 1440, height: 860 },
    })) as unknown as { result: { id: string } };
    sections.push({ id: sec.result.id, tag });
    for (let k = 0; k < 40; k++) {
      await d("design_add_shape", {
        fileId, pageId, parentId: sec.result.id,
        shape: {
          type: "text", name: `${tag} row ${k}`,
          x: 40 + (k % 4) * 330, y: 24 + Math.floor(k / 4) * 90,
          width: 300, height: 60, text: `${tag} content line ${k} lorem placeholder text`,
          fontSize: 16, color: "#f4f4f5",
        },
      });
    }
  }
  return { d, fileId, pageId, sections };
}

describe("design_get_file staged reads (D111)", () => {
  it("file besar tanpa filter -> indeks frame dengan bbox absolut + note", async () => {
    const { d, fileId } = await mkBigFile();
    const res = (await d("design_get_file", { fileId })) as unknown as {
      result: { tooLarge?: boolean; pages: { frames: Record<string, unknown>[] }[] };
    };
    expect(res.result.tooLarge).toBe(true);
    const frames = res.result.pages[0]!.frames;
    expect(frames.some((f) => f.level === 1 && f.name === "Artboard")).toBe(true);
    const svc = frames.find((f) => f.name === "Section SERVICES");
    expect(svc?.absY).toBe(900);
    expect(Number(svc?.shapes)).toBeGreaterThanOrEqual(41);
    // indeks sendiri harus muat di bawah limit output
    expect(JSON.stringify(res.result).length).toBeLessThan(20_000);
  }, 30_000);

  it("region yMin/yMax membaca seksi bawah saja (< limit, tanpa konten atas)", async () => {
    const { d, fileId, pageId } = await mkBigFile();
    const res = (await d("design_get_file", { fileId, pageId, yMin: 1900, yMax: 2500 })) as unknown as {
      result: { shapes: Record<string, unknown>[]; unitFrames: Record<string, unknown>[] };
    };
    const blob = JSON.stringify(res.result);
    expect(blob).toContain("CTA content");
    expect(blob).not.toContain("HERO content");
    expect(res.result.unitFrames.some((u) => u.name === "Section CTA")).toBe(true);
    expect(blob.length).toBeLessThan(20_000);
  }, 30_000);

  it("shapeId subtree + ancestorChain; shapeId salah = isError EN", async () => {
    const { d, fileId, pageId, sections } = await mkBigFile();
    const ok = (await d("design_get_file", { fileId, pageId, shapeId: sections[1]!.id })) as unknown as {
      result: { ancestorChain: string[]; shapes: Record<string, unknown>[] };
    };
    expect(ok.result.ancestorChain.length).toBe(1);
    expect(JSON.stringify(ok.result)).toContain("SERVICES content");
    expect(JSON.stringify(ok.result)).not.toContain("CTA content");
    const bad = (await d("design_get_file", { fileId, pageId, shapeId: "ngawur" })) as unknown as {
      result: { error?: string };
      isError?: boolean;
    };
    expect(bad.isError).toBe(true);
    expect(bad.result?.error).toMatch(/shapeId not found/);
  }, 30_000);

  it("region seluruh halaman tetap besar -> error minta perkecil (EN)", async () => {
    const { d, fileId, pageId } = await mkBigFile();
    const res = (await d("design_get_file", { fileId, pageId, yMin: -1, yMax: 99999 })) as unknown as {
      result: { error?: string };
      isError?: boolean;
    };
    expect(res.isError).toBe(true);
    expect(res.result?.error).toMatch(/narrow yMin\/yMax/);
  }, 30_000);
});
