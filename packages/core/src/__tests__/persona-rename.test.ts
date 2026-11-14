// F1: rename persona - override nama tampilan per-install (workspace/persona-names.json).
// Id internal TIDAK berubah; listPersonas(dir, ws) menerapkan override ke
// manifest.name/description sebelum semua konsumen (prompt, growth, roster).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listPersonas } from "../personas/loader.js";
import {
  clearPersonaRename,
  loadPersonaRenames,
  personaNamesPath,
  savePersonaRename,
} from "../personas/rename.js";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PERSONAS_DIR = path.join(REPO, "packages", "personas");

function tmpWs(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "yui-rename-"));
}

describe("persona rename store (F1)", () => {
  const IDS = ["yui-designer", "yui-coder"];

  it("tanpa file: kosong, nama default dipakai loader", () => {
    const ws = tmpWs();
    expect(loadPersonaRenames(ws)).toEqual({});
    const p = listPersonas(PERSONAS_DIR, ws).find((x) => x.manifest.id === "yui-designer");
    expect(p?.manifest.name).toBe("Picasso Yui");
  });

  it("save + apply: nama & deskripsi berubah, id tetap", () => {
    const ws = tmpWs();
    const entry = savePersonaRename(ws, "yui-designer", { name: "Rafa", description: "Studio visual wizard" }, IDS);
    expect(entry).toEqual({ personaId: "yui-designer", name: "Rafa", description: "Studio visual wizard" });
    // persist di workspace, bukan packages
    expect(fs.existsSync(personaNamesPath(ws))).toBe(true);
    const personas = listPersonas(PERSONAS_DIR, ws);
    const d = personas.find((x) => x.manifest.id === "yui-designer");
    expect(d?.manifest.name).toBe("Rafa");
    expect(d?.manifest.description).toBe("Studio visual wizard");
    // persona lain tak tersentuh
    expect(personas.find((x) => x.manifest.id === "yui-coder")?.manifest.name).toBe("Hiro Yui");
  });

  it("clear: kembali default, idempoten; description null = default description", () => {
    const ws = tmpWs();
    savePersonaRename(ws, "yui-designer", { name: "Rafa" }, IDS); // tanpa description
    const d1 = listPersonas(PERSONAS_DIR, ws).find((x) => x.manifest.id === "yui-designer");
    expect(d1?.manifest.name).toBe("Rafa");
    expect(d1?.manifest.description).toBe("Visual design, design systems, and design-to-code handoff."); // default tetap
    expect(clearPersonaRename(ws, "yui-designer")).toBe(true);
    expect(clearPersonaRename(ws, "yui-designer")).toBe(false); // idempoten
    const d2 = listPersonas(PERSONAS_DIR, ws).find((x) => x.manifest.id === "yui-designer");
    expect(d2?.manifest.name).toBe("Picasso Yui");
  });

  it("validasi: persona tak dikenal / nama kosong / > 40 / description > 120 → throw", () => {
    const ws = tmpWs();
    expect(() => savePersonaRename(ws, "hantu", { name: "X" }, IDS)).toThrow(/tidak dikenal/);
    expect(() => savePersonaRename(ws, "yui-designer", { name: "   " }, IDS)).toThrow();
    expect(() => savePersonaRename(ws, "yui-designer", { name: "x".repeat(41) }, IDS)).toThrow();
    expect(() => savePersonaRename(ws, "yui-designer", { name: "Ok", description: "y".repeat(121) }, IDS)).toThrow();
  });

  it("fail-closed: file korup → {} (default menang, bukan crash)", () => {
    const ws = tmpWs();
    fs.writeFileSync(personaNamesPath(ws), "{ not json !!", "utf-8");
    expect(loadPersonaRenames(ws)).toEqual({});
    const d = listPersonas(PERSONAS_DIR, ws).find((x) => x.manifest.id === "yui-designer");
    expect(d?.manifest.name).toBe("Picasso Yui");
  });
});
