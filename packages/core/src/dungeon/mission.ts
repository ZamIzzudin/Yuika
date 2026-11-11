// @yuika/core, dungeon missions : arena latihan persona.
// Format `mission.yaml` di workspace/dungeons/<slug>/, goal, sumber belajar,
// acceptance, skill target. Sesi latihan jalan di ruangan sandbox (project
// kind="dungeon") sehingga file tools terisolasi dari workspace produksi.
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { Mission, type Mission as MissionType } from "@yuika/contracts";
import { slugify } from "../skills/manager.js";

export const DUNGEONS_DIRNAME = "dungeons";

/** Misi contoh (dibuat bila dungeons/ kosong, acceptance
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
  description: "Dasar Phaser 3, scene, sprite, input, physics arcade, untuk memulai game 2D."
`,
  "penpot-design": `id: penpot-design
title: "Desain produk di Penpot (headless)"
persona: yui-designer
goal: >
  Pelajari protocol changes Penpot (add-obj/mod-obj/del-obj) dan skill
  penpot-designer-basics, lalu produksi satu file desain "Login — Mobile
  390x844" berisi: frame canvas, kartu login (frame), label + input (rect),
  tombol (rect berwarna aksen), dan heading (text). Bahasa konten English.
resources:
  - skill:penpot-designer-basics
acceptance:
  - File Penpot berisi minimal 8 objek dengan penamaan jelas (bukan default)
  - Semua objek berada dalam frame 390x844, tanpa tumpang tindih liar
  - Satu tombol dengan warna aksen dan teks "Sign in"
  - viewerUrl share-link disertakan di laporan akhir
targetSkill:
  name: penpot-designer-basics
  description: "Menggambar desain multi-layar di Penpot secara headless (changes protocol), siap dipantau live dari tab Design."
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

// ---- : latihan buatan user (halaman Dungeon) ----

export interface CreateMissionInput {
  title: string;
  persona: string;
  goal: string;
  resources?: string[];
  acceptance: string[];
  skillName: string;
  skillDescription: string;
}

/** Buat misi baru milik user (folder + mission.yaml, origin: user).
 *  Slug = slugify(skillName), unik; bentrok → error jelas. */
export function createMission(workspacePath: string, input: CreateMissionInput): MissionType {
  const slug = slugify(input.skillName);
  if (!slug) throw new Error("nama skill kosong setelah disanitasi");
  const dir = missionDir(workspacePath, slug);
  if (fs.existsSync(path.join(dir, "mission.yaml"))) throw new Error(`latihan '${slug}' sudah ada, pakai nama skill lain`);
  const mission: MissionType = Mission.parse({
    id: slug,
    title: input.title.slice(0, 120),
    persona: input.persona,
    goal: input.goal,
    resources: input.resources ?? [],
    acceptance: input.acceptance,
    targetSkill: { name: input.skillName, description: input.skillDescription },
    origin: "user",
  });
  for (const sub of ["materials", "reports", "code"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  fs.writeFileSync(path.join(dir, "mission.yaml"), YAML.stringify(mission), "utf-8");
  return mission;
}

/** Tambah sumber belajar ke misi (dipakai upload bahan ajar, dedupe). */
export function appendMissionResource(workspacePath: string, slug: string, resource: string): void {
  const file = path.join(missionDir(workspacePath, slug), "mission.yaml");
  if (!fs.existsSync(file)) throw new Error(`latihan '${slug}' tidak ditemukan`);
  const m = Mission.parse(YAML.parse(fs.readFileSync(file, "utf-8")));
  if (!m.resources.includes(resource)) {
    m.resources = [...m.resources, resource];
    fs.writeFileSync(file, YAML.stringify(m), "utf-8");
  }
}

export function deleteMission(workspacePath: string, slug: string): void {
  const dir = missionDir(workspacePath, slug);
  if (!fs.existsSync(path.join(dir, "mission.yaml"))) throw new Error(`latihan '${slug}' tidak ditemukan`);
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Sanitasi nama file bahan ajar (dipakai REST upload, mirror project uploads). */
export function sanitizeMaterialName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}
