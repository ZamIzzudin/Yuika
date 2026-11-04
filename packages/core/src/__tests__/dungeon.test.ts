// P1-DUN-1/2: dungeon — misi parse & jalan (v0), ruangan = project kind dungeon,
// run status persist + sweep restart; skill lifecycle draft→tested (accept).
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Mission, type DungeonRun } from "@yui/contracts";
import { loadMissions, dungeonsDir } from "../dungeon/mission.js";
import { buildMissionPrompt, createDungeonRunner, sweepStaleRuns } from "../dungeon/runner.js";
import { ProjectStore } from "../project/store.js";
import { proposeSkill, acceptDraft } from "../skills/manager.js";
import { listSkills } from "../skills/loader.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-dgn-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const missionYaml = `id: demo-research
title: "Riset contoh"
persona: yui-scholar
goal: "Pelajari topik contoh dan susun ringkasan."
resources:
  - https://contoh.example/docs
acceptance:
  - Ringkasan jelas dan benar
targetSkill:
  name: demo-skill
  description: "Skill hasil misi contoh."
`;

describe("dungeon mission (P1-DUN-1)", () => {
  it("loadMissions: seed contoh (phaser) dibuat & ter-parse", () => {
    const missions = loadMissions(dir);
    expect(missions.some((m) => m.id === "phaser-research")).toBe(true);
    const phaser = missions.find((m) => m.id === "phaser-research")!;
    expect(phaser.persona).toBe("yui-scholar");
    expect(phaser.acceptance.length).toBeGreaterThan(0);
    expect(Mission.safeParse(phaser).success).toBe(true);
  });

  it("runner: misi kustom parse → run sandbox; status done + summary; sweep restart", async () => {
    fs.mkdirSync(path.join(dungeonsDir(dir), "demo-research"), { recursive: true });
    fs.writeFileSync(path.join(dungeonsDir(dir), "demo-research", "mission.yaml"), missionYaml);
    const missions = loadMissions(dir);
    const m = missions.find((x) => x.id === "demo-research")!;

    expect(buildMissionPrompt(m)).toContain("skill_propose");

    const store = new ProjectStore(path.join(dir, "db.sqlite"));
    const turns: Array<{ sid: string; text: string }> = [];
    const runner = createDungeonRunner({
      workspacePath: dir,
      ensureRoom: (mission) => {
        const id = `p_dungeon-${mission.id}`;
        if (!store.getProject(id)) store.createProject({ id, name: `Dungeon: ${mission.title}`, rootPath: `dungeons/${mission.id}`, kind: "dungeon" });
        return id;
      },
      createSession: (persona, projectId) => {
        expect(persona).toBe("yui-scholar");
        expect(projectId).toBe("p_dungeon-demo-research");
        return "s_test";
      },
      runTurn: async (sid, text) => {
        turns.push({ sid, text });
      },
      lastAssistantText: () => "Misi selesai: ringkasan dibuat + skill diusulkan.",
    });

    const run = runner.start(m);
    expect(run.status).toBe("running");
    expect(turns).toHaveLength(1);
    expect(turns[0]!.text).toContain("MISI LATIHAN: Riset contoh");
    await new Promise((r) => setTimeout(r, 150)); // background settle
    const runs = runner.runs("demo-research") as DungeonRun[];
    expect(runs[runs.length - 1]!.status).toBe("done");
    expect(runs[runs.length - 1]!.summary).toContain("Misi selesai");

    // ruangan = project kind dungeon
    const room = store.getProject("p_dungeon-demo-research")!;
    expect(room.kind).toBe("dungeon");
    store.close();

    // run kedua saat masih running → ditolak (satu run aktif per misi)
    const r2 = createDungeonRunner({
      workspacePath: dir,
      ensureRoom: () => "p_dungeon-demo-research",
      createSession: () => "s_2",
      runTurn: () => new Promise(() => undefined), // hanging
      lastAssistantText: () => null,
    });
    // tandai manual running (simulasi) lalu coba start ulang
    fs.writeFileSync(
      path.join(dungeonsDir(dir), "demo-research", "runs.json"),
      JSON.stringify([{ id: "run_hang", missionId: "demo-research", sessionId: "s_hang", projectId: "p_x", status: "running", startedAt: 1, endedAt: null, summary: null }]),
    );
    expect(() => r2.start(m)).toThrow(/sedang berjalan/);
    sweepStaleRuns(dir, missions); // restart sweep → failed
    const after = r2.runs("demo-research");
    expect(after.find((x) => x.id === "run_hang")!.status).toBe("failed");
  });
});

describe("skill lifecycle (P1-DUN-2)", () => {
  it("propose → draft; accept → tested (bukan ready — eval P1-DUN-3 menyusul)", () => {
    const skillsDir = path.join(dir, "skills");
    proposeSkill(skillsDir, "demo-skill", "Skill hasil misi contoh.", "Langkah 1.\nLangkah 2.");
    let skills = listSkills(skillsDir); // drafts terpisah
    expect(skills).toHaveLength(0);
    acceptDraft(skillsDir, "demo-skill");
    skills = listSkills(skillsDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.status).toBe("tested");
    expect(skills[0]!.personas).toEqual([]);
    // seed tanpa status eksplisit = ready
    expect(listSkills(path.resolve("../../packages/skills")).every((s) => s.status === "ready" || s.status === "tested")).toBe(true);
  });
});
