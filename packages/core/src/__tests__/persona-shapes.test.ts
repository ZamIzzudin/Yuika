// Menu Persona — override bentuk geometri maskot (persona-shapes.json):
// validasi persona dikenal + bentuk salah satu dari 15; persist; reset
// (clear) idempoten; file korup → dianggap tanpa override (bukan crash boot).
import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clearPersonaShape, loadPersonaShapes, personaShapeOf, savePersonaShape } from "../personas/shapes.js";

let dir: string;
beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-shapes-"))));

const IDS = ["yui-conductor", "yui-coder"];

describe("persona shapes (menu Persona)", () => {
  it("set → persist & terbaca ulang; bentuk tak dikenal → error", () => {
    const e = savePersonaShape(dir, "yui-coder", "star", IDS);
    expect(e).toEqual({ personaId: "yui-coder", shape: "star" });
    expect(loadPersonaShapes(dir)).toEqual({ "yui-coder": "star" });
    expect(() => savePersonaShape(dir, "yui-coder", "heptagon", IDS)).toThrow();
  });

  it("persona tak terdaftar → error (fail-closed, bukan fallback diam-diam)", () => {
    expect(() => savePersonaShape(dir, "orang-asing", "orb", IDS)).toThrow(/tidak dikenal/);
  });

  it("clear: hapus override → default; idempoten (false saat tak ada)", () => {
    savePersonaShape(dir, "yui-coder", "orb", IDS);
    expect(clearPersonaShape(dir, "yui-coder")).toBe(true);
    expect(loadPersonaShapes(dir)).toEqual({});
    expect(clearPersonaShape(dir, "yui-coder")).toBe(false);
  });

  it("file korup → {} (default manifest menang, boot tak crash)", () => {
    fs.writeFileSync(path.join(dir, "persona-shapes.json"), "{bukan json");
    expect(loadPersonaShapes(dir)).toEqual({});
  });

  it("personaShapeOf: nilai valid dikembalikan; nilai asing → undefined", () => {
    expect(personaShapeOf({ "yui-coder": "star" }, "yui-coder")).toBe("star");
    expect(personaShapeOf({ "yui-coder": "heptagon" }, "yui-coder")).toBeUndefined();
    expect(personaShapeOf({}, "yui-coder")).toBeUndefined();
  });
});
