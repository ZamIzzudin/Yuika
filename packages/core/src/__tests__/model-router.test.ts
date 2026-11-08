import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildModelRouter, loadModelOverrides, saveModelOverride } from "../model-router.js";

let dir: string;
let personas: string;
let overridesFile: string;


function setup(py = "") {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-mr-"));
  personas = path.join(dir, "personas");
  fs.mkdirSync(personas, { recursive: true });
  if (py) {
    fs.mkdirSync(path.join(personas, "yui-coder"));
    fs.writeFileSync(path.join(personas, "yui-coder", "persona.yaml"), py);
  }
  overridesFile = path.join(dir, "model-overrides.json");
}

describe("model router ( + )", () => {
  it("tanpa override/persona.yaml → default + fallback env", () => {
    setup();
    const r = buildModelRouter({ defaultModel: "glm/glm-5.1", defaultFallback: "glm/glm-5", personasDir: personas, overridesFile });
    expect(r.route("yui-coder")).toEqual({ model: "glm/glm-5.1", fallback: "glm/glm-5" });
  });

  it("persona.yaml model.primary.name menang atas default", () => {
    setup("id: yui-coder\nname: Coder\nversion: 0.1.0\nexpertise: code\ntags: [code]\ndescription: uji\nassets:\n  portrait: null\n  riv: null\nmemory:\n  domain: code\n  learn: true\nmodel:\n  primary:\n    quality: high\n    name: glm/glm-5\n  aux:\n    quality: low\n");
    const r = buildModelRouter({ defaultModel: "glm/glm-5.1", defaultFallback: "glm/glm-5", personasDir: personas, overridesFile });
    expect(r.route("yui-coder").model).toBe("glm/glm-5");
    expect(r.route("yui-coder").fallback).toBeUndefined(); // fallback == model → tak berguna, buang
    expect(r.route("yui-scribe")).toEqual({ model: "glm/glm-5.1", fallback: "glm/glm-5" });
  });

  it("override file (Settings) menang atas persona.yaml; hapus bila kosong", () => {
    setup("id: yui-coder\nname: Coder\nversion: 0.1.0\nexpertise: code\ntags: [code]\ndescription: uji\nassets:\n  portrait: null\n  riv: null\nmemory:\n  domain: code\n  learn: true\nmodel:\n  primary:\n    quality: high\n    name: glm/glm-5\n  aux:\n    quality: low\n");
    saveModelOverride(overridesFile, "yui-coder", { model: "glm/glm-4.6", fallback: "glm/glm-5" });
    const r = buildModelRouter({ defaultModel: "glm/glm-5.1", personasDir: personas, overridesFile });
    expect(r.route("yui-coder")).toEqual({ model: "glm/glm-4.6", fallback: "glm/glm-5" });
    saveModelOverride(overridesFile, "yui-coder", {}); // kosong = hapus
    expect(r.route("yui-coder").model).toBe("glm/glm-5"); // kembali ke persona.yaml
  });

  it("defaultModel getter, swap panas via Settings terbaca tanpa rebuild", () => {
    setup();
    let cur = "glm/glm-5.1";
    const r = buildModelRouter({ defaultModel: () => cur, personasDir: personas, overridesFile });
    expect(r.route("yui-coder").model).toBe("glm/glm-5.1");
    cur = "glm/glm-4.6";
    expect(r.route("yui-coder").model).toBe("glm/glm-4.6");
  });

  it("cooldown: primary unhealthy → resolve langsung fallback", () => {
    setup();
    const r = buildModelRouter({ defaultModel: "glm/glm-5.1", defaultFallback: "glm/glm-5", personasDir: personas, overridesFile });
    expect(r.route("yui-coder").model).toBe("glm/glm-5.1");
    r.markUnhealthy("glm/glm-5.1");
    expect(r.isCooling("glm/glm-5.1")).toBe(true);
    expect(r.route("yui-coder").model).toBe("glm/glm-5"); // jangan buang retry lagi ke model sekarat
    expect(r.route("yui-coder").fallback).toBeUndefined(); // fallback==model → tanpa fallback
  });

  it("loadModelOverrides: file hilang/rusak → {} (bukan crash)", () => {
    setup();
    expect(loadModelOverrides(overridesFile)).toEqual({});
    fs.writeFileSync(overridesFile, "{rusak");
    expect(loadModelOverrides(overridesFile)).toEqual({});
  });
});
