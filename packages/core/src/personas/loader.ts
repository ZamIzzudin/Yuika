// @yuika/core — persona loader: gabungkan persona.yaml + PERSONA.md + toolsets.yaml
// + skills.yaml + delegation.yaml menjadi Persona tervalidasi (PLAN §7.2).
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { PersonaManifest, type PersonaManifest as Manifest } from "@yuika/contracts";

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

export function listPersonas(personasDir: string): Persona[] {
  if (!fs.existsSync(personasDir)) return [];
  return fs
    .readdirSync(personasDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !d.name.startsWith("_"))
    .map((d) => path.join(personasDir, d.name))
    .map(loadPersona)
    .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
}
