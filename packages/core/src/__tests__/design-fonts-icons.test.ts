// D102/D103: font bank + icon bank pada design store (validasi + substitusi).
import { it, expect, describe } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  addDesignShape,
  createDesignFile,
  updateDesignShape,
} from "../design/store.js";
import { FONT_BANK, FONT_SUBSTITUTES, isBankFont } from "../design/fonts.js";

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "yui-fonticon-"));
}

describe("D102 font bank", () => {
  it("setiap font yang dirujuk design-style-library ada di bank (atau substitusi)", () => {
    const skill = fs.readFileSync(
      path.join(process.cwd(), "..", "skills/design-style-library/SKILL.md"),
      "utf8",
    );
    const mentioned = new Set<string>();
    for (const m of skill.matchAll(/(?:h1|body-md|label-caps): ([^;\r\n]+)/g)) {
      const fam = m[1]!.replace(/\s[\d.]+(rem|px|em)?$/i, "").trim();
      if (fam) mentioned.add(fam);
    }
    expect(mentioned.size).toBeGreaterThan(20);
    const missing = [...mentioned].filter((f) => !isBankFont(f) && !FONT_SUBSTITUTES[f]);
    expect(missing, `fonts tidak ter-cover bank: ${missing.join(", ")}`).toEqual([]);
  });

  it("store menerima fontFamily bank + substitusi brand font, menolak nama asing", () => {
    const ws = tmpWorkspace();
    const f = createDesignFile(ws, "fonts");
    const p = f.pages[0]!;
    const t = addDesignShape(ws, f.id, p.id, {
      type: "text",
      text: "Halo",
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      fontFamily: "Playfair Display",
    });
    expect((t as { fontFamily?: string }).fontFamily).toBe("Playfair Display");
    // brand font (bukan Google) -> substitusi otomatis
    const t2 = addDesignShape(ws, f.id, p.id, {
      type: "text",
      text: "X",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fontFamily: "Anthropic Sans",
    });
    expect((t2 as { fontFamily?: string }).fontFamily).toBe("Inter");
    expect(() =>
      addDesignShape(ws, f.id, p.id, {
        type: "text",
        text: "X",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        fontFamily: "Comic Neue Weird",
      }),
    ).toThrow(/not in the Google Fonts bank/);
  });

  it("patch fontFamily: ganti dan hapus (kembali ke system default)", () => {
    const ws = tmpWorkspace();
    const f = createDesignFile(ws, "fonts2");
    const p = f.pages[0]!;
    const t = addDesignShape(ws, f.id, p.id, {
      type: "text",
      text: "A",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fontFamily: "JetBrains Mono",
    });
    const id = t.id;
    const u = updateDesignShape(ws, f.id, p.id, id, { fontFamily: "Inter" }) as {
      fontFamily?: string;
    };
    expect(u.fontFamily).toBe("Inter");
    const u2 = updateDesignShape(ws, f.id, p.id, id, { fontFamily: "" }) as {
      fontFamily?: string;
    };
    expect(u2.fontFamily).toBeUndefined();
  });

  it("bank punya kategori inti dan vibe per font", () => {
    const cats = new Set(FONT_BANK.map((f) => f.category));
    for (const c of ["sans", "serif", "mono", "display", "handwriting"] as const) {
      expect(cats.has(c)).toBe(true);
    }
    expect(FONT_BANK.every((f) => f.vibe.length > 3 && f.weights.length > 0)).toBe(true);
  });
});

describe("D103 icon bank", () => {
  it("store menerima nama ikon valid, menormalkan kapital, menolak nama asing", () => {
    const ws = tmpWorkspace();
    const f = createDesignFile(ws, "icons");
    const p = f.pages[0]!;
    const s = addDesignShape(ws, f.id, p.id, {
      type: "icon",
      icon: "Chart-Line-Up",
      x: 0,
      y: 0,
      width: 24,
      height: 24,
    });
    expect((s as { icon: string }).icon).toBe("chart-line-up");
    expect(() =>
      addDesignShape(ws, f.id, p.id, { type: "icon", icon: "unicorn-rainbow", x: 0, y: 0, width: 24, height: 24 }),
    ).toThrow(/not found in the icon bank/);
    expect(() =>
      addDesignShape(ws, f.id, p.id, { type: "icon" as never, x: 0, y: 0, width: 24, height: 24 }),
    ).toThrow(/non-empty string/);
  });

  it("patch icon valid dan invalid", () => {
    const ws = tmpWorkspace();
    const f = createDesignFile(ws, "icons2");
    const p = f.pages[0]!;
    const s = addDesignShape(ws, f.id, p.id, {
      type: "icon",
      icon: "star",
      x: 0,
      y: 0,
      width: 24,
      height: 24,
    });
    const u = updateDesignShape(ws, f.id, p.id, s.id, { icon: "house" }) as { icon: string };
    expect(u.icon).toBe("house");
    expect(() => updateDesignShape(ws, f.id, p.id, s.id, { icon: "nope" })).toThrow(
      /not found in the icon bank/,
    );
  });
});
