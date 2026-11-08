// @yuika/core, roster project : siapa mengerjakan apa di project.
// Sumber kebenaran = `project.yaml` di root project (deklaratif, ter-replay via file,
// bukan state DB kedua). Binding MCP di file yang sama dipakai .
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ProjectManifest, type RosterEntry } from "@yuika/contracts";

export function projectManifestPath(projectRoot: string): string {
  return path.join(projectRoot, "project.yaml");
}

/** Muat roster; project tanpa project.yaml = roster kosong (bukan error). */
export function loadRoster(projectRoot: string): RosterEntry[] {
  const file = projectManifestPath(projectRoot);
  if (!fs.existsSync(file)) return [];
  const raw = YAML.parse(fs.readFileSync(file, "utf-8")) as unknown;
  const manifest = ProjectManifest.parse(raw ?? {});
  return manifest.roster;
}

/** Tulis roster utuh ke project.yaml (replace, bentuk deklaratif sederhana). */
export function saveRoster(projectRoot: string, roster: RosterEntry[]): void {
  const manifest = ProjectManifest.parse({ roster });
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(projectManifestPath(projectRoot), YAML.stringify(manifest), "utf-8");
}
