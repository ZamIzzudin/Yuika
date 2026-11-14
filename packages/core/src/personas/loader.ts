// @yuika/core, persona loader: gabungkan persona.yaml + PERSONA.md + toolsets.yaml
// + skills.yaml + delegation.yaml menjadi Persona tervalidasi .
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { moduleLogger } from "../logger.js";
import { PersonaManifest, type PersonaManifest as Manifest } from "@yuika/contracts";
import { loadPersonaRenames } from "./rename.js";

export interface Persona {
  manifest: Manifest;
  personaMd: string;
  dir: string;
}

function readYaml(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  return YAML.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
}

export function loadPersona(dir: string): Persona {
  const manifest = PersonaManifest.parse({
    ...readYaml(path.join(dir, "persona.yaml")),
    tools: (readYaml(path.join(dir, "toolsets.yaml")).tools as string[] | undefined) ?? [],
    skills: readYaml(path.join(dir, "skills.yaml")),
    delegation: readYaml(path.join(dir, "delegation.yaml")),
  });
  const personaMdPath = path.join(dir, "PERSONA.md");
  const personaMd = fs.existsSync(personaMdPath) ? fs.readFileSync(personaMdPath, "utf-8") : "";
  return { manifest, personaMd, dir };
}

export function listPersonas(personasDir: string, workspacePath?: string): Persona[] {
  if (!fs.existsSync(personasDir)) return [];
  let personas = fs
    .readdirSync(personasDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !d.name.startsWith("_"))
    .map((d) => path.join(personasDir, d.name))
    .map(loadPersona)
    .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
  // F2 Persona Forge: persona custom = direktori di workspace/personas/.
  //  Satu custom rusak (yaml korup dsb.) TIDAK boleh merobohkan seluruh
  //  roster -> skip dengan warning (pola listSkills); built-in tetap fail-closed.
  if (workspacePath) {
    const customDir = path.join(workspacePath, "personas");
    if (fs.existsSync(customDir)) {
      for (const d of fs.readdirSync(customDir, { withFileTypes: true })) {
        if (!d.isDirectory() || d.name.startsWith(".")) continue;
        try {
          personas.push(loadPersona(path.join(customDir, d.name)));
        } catch (e) {
          moduleLogger("personas").warn({ dir: d.name }, `custom persona skipped: ${e instanceof Error ? e.message : e}`);
        }
      }
      personas.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
    }
  }
  // F1 rename: override display name/description dari workspace (id tetap).
  if (workspacePath) {
    const renames = loadPersonaRenames(workspacePath);
    if (Object.keys(renames).length > 0) {
      personas = personas.map((p) => {
        const r = renames[p.manifest.id];
        if (!r) return p;
        return {
          ...p,
          manifest: {
            ...p.manifest,
            name: r.name,
            ...(r.description ? { description: r.description } : {}),
          },
        };
      });
    }
  }
  return personas;
}
