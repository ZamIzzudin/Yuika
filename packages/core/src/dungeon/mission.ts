// @yui/core — dungeon missions (P1-DUN-1, PLAN §13.8): arena latihan persona.
// Format `mission.yaml` di workspace/dungeons/<slug>/ — goal, sumber belajar,
// acceptance, skill target. Sesi latihan jalan di ruangan sandbox (project
// kind="dungeon") sehingga file tools terisolasi dari workspace produksi.
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { Mission, type Mission as MissionType } from "@yui/contracts";

export const DUNGEONS_DIRNAME = "dungeons";

/** Misi contoh (dibuat bila dungeons/ kosong — acceptance P1-DUN-1:
 *  "misi contoh riset dokumentasi Phaser parse & jalan"). */
const SEED_MISSIONS: Record<string, string> = {
  "phaser-research": `id: phaser-research
title: "Riset dokumentasi Phaser"
persona: yui-scholar
goal: >
  Pelajari dasar game framework Phaser (scene lifecycle, sprites, input,
  physics arcade) dari dokumentasi resmi, lalu susun ringkasan praktis
  untuk developer yang mau mulai proyek game 2D.
resources:
  - https://phaser.io/docs
  - https://phaser.io/tutorials/making-your-first-phaser-3-game
acceptance:
  - Menjelaskan scene lifecycle (create vs update) dengan benar
  - Menyertakan contoh kode minimal sprite + input keyboard yang jalan
  - Ringkasan ≤ 500 kata, berbahasa Indonesia, tanpa istilah yang tidak dijelaskan
targetSkill:
  name: phaser-basics
  description: "Dasar Phaser 3 — scene, sprite, input, physics arcade — untuk memulai game 2D."
`,
};

export function dungeonsDir(workspacePath: string): string {
  return path.join(workspacePath, DUNGEONS_DIRNAME);
}

/** Pastikan misi seed ada (idempotent) lalu kembalikan semua misi ter-parse. */
export function loadMissions(workspacePath: string): MissionType[] {
  const root = dungeonsDir(workspacePath);
  fs.mkdirSync(root, { recursive: true });
  for (const [slug, yamlText] of Object.entries(SEED_MISSIONS)) {
    const dir = path.join(root, slug);
    if (!fs.existsSync(path.join(dir, "mission.yaml"))) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "mission.yaml"), yamlText, "utf-8");
    }
  }
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, "mission.yaml")))
    .map((d) => {
      const raw = fs.readFileSync(path.join(root, d.name, "mission.yaml"), "utf-8");
      const m = Mission.parse(YAML.parse(raw));
      return { ...m, id: m.id || d.name };
    });
}

export function missionDir(workspacePath: string, missionId: string): string {
  return path.join(dungeonsDir(workspacePath), missionId);
}
