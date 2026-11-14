// F2 Persona Forge v2: persona custom = persona BARU di luar 9 built-in
// (Mary jadi ke-10). Bukan clone: user pilih native functions sendiri
// (validasi CUSTOM_ALLOWED_TOOLS - delegate_task/consult/mcp__* ditolak),
// skill dari bank, prompt layer sendiri. Delegation terkunci (can_spawn [],
// spawnable_by [user]). Share: export/import file JSON tervalidasi penuh.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listPersonas } from "../personas/loader.js";
import {
  createCustomPersona,
  updateCustomPersona,
  deleteCustomPersona,
  exportPersona,
  importPersona,
  customPersonasDir,
} from "../personas/custom.js";
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
  name: "Mary",
  description: "Ops analyst with a calm voice",
  personaMd: "# Mary, Persona Layer\n\nYou are a careful analyst.",
  tools: ["read_file", "write_file", "terminal", "web_search"],
  skills: ["web-research"],
};

describe("F2 Persona Forge (persona mandiri)", () => {
  it("create: file lengkap, manifest valid, tools = pilihan user, delegation dikunci", () => {
    const paths = setup();
    const p = createCustomPersona(paths, forgeInput);
    expect(p.manifest.id).toBe("custom-mary");
    expect(p.manifest.custom).toBe(true);
    expect(p.manifest.base).toBeUndefined(); // bukan clone
    expect(p.manifest.tools).toEqual(["read_file", "write_file", "terminal", "web_search"]);
    expect(p.manifest.delegation).toEqual({ can_spawn: [], spawnable_by: ["user"] });
    expect(p.personaMd).toContain("Mary");
    const dir = path.join(customPersonasDir(paths.workspacePath), "custom-mary");
    for (const f of ["persona.yaml", "PERSONA.md", "toolsets.yaml", "skills.yaml", "delegation.yaml"]) {
      expect(fs.existsSync(path.join(dir, f))).toBe(true);
    }
  });

  it("listPersonas merge custom + built-in (10 persona); rename overlay tetap jalan", () => {
    const paths = setup();
    createCustomPersona(paths, forgeInput);
    const all = listPersonas(paths.personasDir, paths.workspacePath);
    expect(all.some((x) => x.manifest.id === "yui-coder")).toBe(true);
    const mary = all.find((x) => x.manifest.id === "custom-mary");
    expect(mary?.manifest.name).toBe("Mary");
    expect(all.length).toBe(listPersonas(paths.personasDir).length + 1);
    fs.writeFileSync(
      path.join(paths.workspacePath, "persona-names.json"),
      JSON.stringify({ renames: [{ personaId: "custom-mary", name: "Mary Prime", description: null }] }),
      "utf-8",
    );
    expect(
      listPersonas(paths.personasDir, paths.workspacePath).find((x) => x.manifest.id === "custom-mary")?.manifest.name,
    ).toBe("Mary Prime");
  });

  it("validasi tools: kosong / di luar katalog (delegate_task, consult, mcp__*, unknown) ditolak", () => {
    const paths = setup();
    expect(() => createCustomPersona(paths, { ...forgeInput, tools: [] })).toThrow(/minimal satu/);
    expect(() => createCustomPersona(paths, { ...forgeInput, tools: ["delegate_task"] })).toThrow(/tidak diizinkan/);
    expect(() => createCustomPersona(paths, { ...forgeInput, tools: ["consult"] })).toThrow(/tidak diizinkan/);
    expect(() => createCustomPersona(paths, { ...forgeInput, tools: ["mcp__filesystem"] })).toThrow(/tidak diizinkan/);
    expect(() => createCustomPersona(paths, { ...forgeInput, tools: ["ray_gun"] })).toThrow(/tidak diizinkan/);
    expect(() => createCustomPersona(paths, { ...forgeInput, skills: ["not-a-skill"] })).toThrow(/skill tidak dikenal/);
    // nama sama -> id suffix -2 (setelah satu Mary sukses dibuat)
    createCustomPersona(paths, forgeInput);
    expect(createCustomPersona(paths, { ...forgeInput, description: "Second take" }).manifest.id).toBe("custom-mary-2");
  });

  it("update: identitas/prompt/tools/skills berubah; delegation.yaml tidak tersentuh", () => {
    const paths = setup();
    createCustomPersona(paths, forgeInput);
    const dir = path.join(customPersonasDir(paths.workspacePath), "custom-mary");
    const before = fs.readFileSync(path.join(dir, "delegation.yaml"), "utf-8");
    const bank = listSkills(paths.skillsDir).map((s) => s.name);
    const updated = updateCustomPersona(paths, "custom-mary", {
      name: "Mary Reforged",
      description: "Wider mandate now",
      personaMd: "# Reforged\n\nNew instructions.",
      tools: ["read_file", "browser_open", "browser_snapshot", "design_list"],
      skills: [bank[0]!],
    });
    expect(updated.manifest.name).toBe("Mary Reforged");
    expect(updated.manifest.tools).toContain("browser_open");
    expect(updated.manifest.tools).not.toContain("terminal");
    expect(fs.readFileSync(path.join(dir, "delegation.yaml"), "utf-8")).toBe(before);
    expect(() => updateCustomPersona(paths, "yui-coder", { ...forgeInput, name: "x" })).toThrow(/custom/);
  });

  it("share: export -> import round-trip (validasi penuh; id baru dari nama)", () => {
    const paths = setup();
    createCustomPersona(paths, forgeInput);
    const file = exportPersona(paths, "custom-mary");
    expect(file.format).toBe("yuika-persona");
    expect(file.tools).toEqual(forgeInput.tools);
    // import di "install lain" (workspace beda): persona ke-10 lahir utuh
    const other = path.join(tmp, "ws2");
    fs.mkdirSync(other, { recursive: true });
    const imported = importPersona({ ...paths, workspacePath: other }, file);
    expect(imported.manifest.id).toBe("custom-mary");
    expect(imported.manifest.tools).toEqual(forgeInput.tools);
    expect(imported.manifest.skills.bundled).toEqual(["web-research"]);
    expect(imported.personaMd).toContain("Mary");
    // import file curang (tool ilegal diselundupkan) -> ditolak
    expect(() => importPersona({ ...paths, workspacePath: other }, { ...file, tools: ["delegate_task"] })).toThrow(
      /tidak diizinkan/,
    );
    // export built-in -> ditolak (bukan custom)
    expect(() => exportPersona(paths, "yui-coder")).toThrow(/custom/);
  });

  it("delete: custom hilang (+ override rename/shape ikut bersih), built-in ditolak, idempoten", () => {
    const paths = setup();
    createCustomPersona(paths, forgeInput);
    fs.writeFileSync(
      path.join(paths.workspacePath, "persona-shapes.json"),
      JSON.stringify({ shapes: [{ personaId: "custom-mary", shape: "star" }] }),
      "utf-8",
    );
    expect(deleteCustomPersona(paths, "custom-mary")).toBe(true);
    expect(fs.existsSync(path.join(customPersonasDir(paths.workspacePath), "custom-mary"))).toBe(false);
    expect(fs.readFileSync(path.join(paths.workspacePath, "persona-shapes.json"), "utf-8")).not.toContain("custom-mary");
    expect(deleteCustomPersona(paths, "custom-mary")).toBe(false);
    expect(() => deleteCustomPersona(paths, "yui-coder")).toThrow(/custom/);
    expect(listPersonas(paths.personasDir, paths.workspacePath).some((x) => x.manifest.id === "yui-coder")).toBe(true);
  });

  it("satu custom korup tidak merobohkan roster (skip + built-in utuh)", () => {
    const paths = setup();
    createCustomPersona(paths, forgeInput);
    fs.mkdirSync(path.join(customPersonasDir(paths.workspacePath), "custom-broken"), { recursive: true });
    fs.writeFileSync(path.join(customPersonasDir(paths.workspacePath), "custom-broken", "persona.yaml"), "id: [invalid");
    const all = listPersonas(paths.personasDir, paths.workspacePath);
    expect(all.some((x) => x.manifest.id === "yui-coder")).toBe(true);
    expect(all.some((x) => x.manifest.id === "custom-mary")).toBe(true);
    expect(all.some((x) => x.manifest.id === "custom-broken")).toBe(false);
  });
});
