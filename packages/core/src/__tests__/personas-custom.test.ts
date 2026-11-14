// F2 Persona Forge: persona custom clone-template.
// Plafon by-construction: tools = salinan persis basis (jalur update tidak
// menyentuh toolsets.yaml), delegation dikunci (can_spawn [], spawnable_by
// [user]), skill harus dari bank. Custom dir = workspace/personas/custom-*.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listPersonas } from "../personas/loader.js";
import { createCustomPersona, deleteCustomPersona, updateCustomPersona, customPersonasDir } from "../personas/custom.js";
import { listSkills } from "../skills/loader.js";

let tmp = "";

afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = "";
});

function setup() {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "yui-forge-"));
  const repoRoot = path.resolve(import.meta.dirname, "../../../../");
  const personasDir = path.join(repoRoot, "packages", "personas");
  const skillsDir = path.join(repoRoot, "packages", "skills");
  const workspacePath = path.join(tmp, "ws");
  fs.mkdirSync(workspacePath, { recursive: true });
  return { personasDir, skillsDir, workspacePath };
}

const forgeInput = {
  baseId: "yui-coder",
  name: "Kohaku",
  description: "TDD coder with a warm tone",
  personaMd: "# Kohaku, Persona Layer\n\nYou are a careful coder.",
  skills: ["code-review-basics"],
};

describe("F2 Persona Forge", () => {
  it("forge: file tercipta, manifest valid, tools = basis, delegation dikunci", () => {
    const paths = setup();
    const p = createCustomPersona(paths, forgeInput);
    expect(p.manifest.id).toBe("custom-kohaku");
    expect(p.manifest.custom).toBe(true);
    expect(p.manifest.base).toBe("yui-coder");
    expect(p.manifest.tools).toEqual(listPersonas(paths.personasDir).find((x) => x.manifest.id === "yui-coder")?.manifest.tools);
    expect(p.manifest.delegation).toEqual({ can_spawn: [], spawnable_by: ["user"] });
    expect(p.personaMd).toContain("Kohaku");
    // file fisik lengkap
    const dir = path.join(customPersonasDir(paths.workspacePath), "custom-kohaku");
    for (const f of ["persona.yaml", "PERSONA.md", "toolsets.yaml", "skills.yaml", "delegation.yaml"]) {
      expect(fs.existsSync(path.join(dir, f))).toBe(true);
    }
  });

  it("listPersonas merge custom + built-in; rename overlay tetap jalan di atasnya", () => {
    const paths = setup();
    createCustomPersona(paths, forgeInput);
    const all = listPersonas(paths.personasDir, paths.workspacePath);
    expect(all.some((x) => x.manifest.id === "yui-coder")).toBe(true);
    const custom = all.find((x) => x.manifest.id === "custom-kohaku");
    expect(custom?.manifest.name).toBe("Kohaku");
    // rename F1 berlaku utk custom juga (satu jalur loader)
    fs.writeFileSync(
      path.join(paths.workspacePath, "persona-names.json"),
      JSON.stringify({ renames: [{ personaId: "custom-kohaku", name: "Kohaku Prime", description: null }] }),
      "utf-8",
    );
    const renamed = listPersonas(paths.personasDir, paths.workspacePath).find((x) => x.manifest.id === "custom-kohaku");
    expect(renamed?.manifest.name).toBe("Kohaku Prime");
  });

  it("validasi: basis tak dikenal / basis custom / skill di luar bank / nama duplikat suffix", () => {
    const paths = setup();
    expect(() => createCustomPersona(paths, { ...forgeInput, baseId: "yui-nobody" })).toThrow(/tidak dikenal/);
    createCustomPersona(paths, forgeInput);
    // basis custom → ditolak (tak terdaftar sbg basis built-in)
    expect(() => createCustomPersona(paths, { ...forgeInput, baseId: "custom-kohaku" })).toThrow(/tidak dikenal/);
    expect(() => createCustomPersona(paths, { ...forgeInput, skills: ["not-a-skill"] })).toThrow(/skill tidak dikenal/);
    // nama sama -> id suffix -2
    const second = createCustomPersona(paths, { ...forgeInput, description: "Second take" });
    expect(second.manifest.id).toBe("custom-kohaku-2");
  });

  it("update: hanya lapisan user; tools/toolsets.yaml tidak tersentuh", () => {
    const paths = setup();
    createCustomPersona(paths, forgeInput);
    const before = fs.readFileSync(path.join(customPersonasDir(paths.workspacePath), "custom-kohaku", "toolsets.yaml"), "utf-8");
    const bank = listSkills(paths.skillsDir).map((s) => s.name);
    const skill = bank.find((s) => s !== "code-review-basics") ?? "code-review-basics";
    const updated = updateCustomPersona(paths, "custom-kohaku", {
      name: "Kohaku Reforged",
      description: "Same power, new words",
      personaMd: "# Reforged\n\nNew instructions.",
      skills: [skill],
    });
    expect(updated.manifest.name).toBe("Kohaku Reforged");
    expect(updated.manifest.skills.bundled).toContain(skill);
    expect(updated.personaMd).toContain("Reforged");
    const after = fs.readFileSync(path.join(customPersonasDir(paths.workspacePath), "custom-kohaku", "toolsets.yaml"), "utf-8");
    expect(after).toBe(before);
    expect(() => updateCustomPersona(paths, "yui-coder", { name: "x", description: "y", personaMd: "z", skills: [] })).toThrow(/custom/);
  });

  it("delete: custom hilang (+ override rename/shape ikut bersih), built-in ditolak, idempoten", () => {
    const paths = setup();
    createCustomPersona(paths, forgeInput);
    fs.writeFileSync(
      path.join(paths.workspacePath, "persona-shapes.json"),
      JSON.stringify({ shapes: [{ personaId: "custom-kohaku", shape: "star" }] }),
      "utf-8",
    );
    expect(deleteCustomPersona(paths, "custom-kohaku")).toBe(true);
    expect(fs.existsSync(path.join(customPersonasDir(paths.workspacePath), "custom-kohaku"))).toBe(false);
    expect(fs.readFileSync(path.join(paths.workspacePath, "persona-shapes.json"), "utf-8")).not.toContain("custom-kohaku");
    expect(deleteCustomPersona(paths, "custom-kohaku")).toBe(false); // idempoten
    expect(() => deleteCustomPersona(paths, "yui-coder")).toThrow(/custom/);
    // built-in tetap ada
    expect(listPersonas(paths.personasDir, paths.workspacePath).some((x) => x.manifest.id === "yui-coder")).toBe(true);
  });

  it("satu custom korup tidak merobohkan roster (skip + built-in utuh)", () => {
    const paths = setup();
    createCustomPersona(paths, forgeInput);
    fs.mkdirSync(path.join(customPersonasDir(paths.workspacePath), "custom-broken"), { recursive: true });
    fs.writeFileSync(path.join(customPersonasDir(paths.workspacePath), "custom-broken", "persona.yaml"), "id: [invalid");
    const all = listPersonas(paths.personasDir, paths.workspacePath);
    expect(all.some((x) => x.manifest.id === "yui-coder")).toBe(true);
    expect(all.some((x) => x.manifest.id === "custom-kohaku")).toBe(true);
    expect(all.some((x) => x.manifest.id === "custom-broken")).toBe(false);
  });
});
