// P1-DUN-3: eval buta — parser verdict, prompt anti-bias, evaluator penuh
// (pending → pass = promote ready; fail = tetap tested + alasan; throw = fail rapi).
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { Mission } from "@yui/contracts";
import { buildEvalPrompt, createSkillEvaluator, missionForSkill, parseVerdict, readEval, writeEval } from "../dungeon/eval.js";
import { proposeSkill, acceptDraft } from "../skills/manager.js";
import { listSkills } from "../skills/loader.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-evl-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const missionYaml = `id: demo-research
title: "Riset contoh"
persona: yui-scholar
goal: "Pelajari topik contoh dan susun ringkasan."
resources: []
acceptance:
  - Ringkasan jelas dan benar
targetSkill:
  name: Demo Skill
  description: "Skill hasil misi contoh."
`;

const mission = () => Mission.parse(YAML.parse(missionYaml));

describe("parseVerdict (P1-DUN-3)", () => {
  it("LULUS + alasan GAGAL; verdict TERAKHIR yang dihitung (model kadang nulis draft di tengah)", () => {
    expect(parseVerdict("analisis...\nVERDICT: GAGAL — kekurangan contoh").verdict).toBe("fail");
    expect(parseVerdict("VERDICT: LULUS").reason).toBe("semua kriteria terpenuhi");
    expect(parseVerdict("draft VERDICT: GAGAL — mungkin\nfinal: bukti cukup\nVERDICT: LULUS").verdict).toBe("pass");
    expect(parseVerdict("VERDICT: GAGAL — kriteria 2 tidak ada bukti")).toEqual({ verdict: "fail", reason: "kriteria 2 tidak ada bukti" });
    expect(parseVerdict("tanpa verdict sama sekali")).toEqual({ verdict: "fail", reason: "hakim tidak mengeluarkan VERDICT yang valid" });
  });
});

describe("evaluator (P1-DUN-3)", () => {
  it("prompt buta: kriteria + skill_view + tanpa cerita pembuat", () => {
    const p = buildEvalPrompt(mission(), "Demo Skill");
    expect(p).toContain("EVALUASI BUTA");
    expect(p).toContain("skill_view");
    expect(p).toContain("Ringkasan jelas dan benar");
    expect(p).not.toContain("bagaimana artefak dibuat");
  });

  it("missionForSkill: match via slug (nama beda format)", () => {
    expect(missionForSkill([mission()], "demo-skill")!.id).toBe("demo-research");
    expect(missionForSkill([mission()], "Demo Skill")).not.toBeNull();
    expect(missionForSkill([mission()], "skill-lain")).toBeNull();
  });

  it("alur penuh: pending → pass → promote ready; .eval.json tersimpan", async () => {
    // skill tested hasil misi
    const skillsDir = path.join(dir, "skills");
    proposeSkill(skillsDir, "Demo Skill", "Skill hasil misi contoh.", "Langkah 1.");
    acceptDraft(skillsDir, "demo-skill");
    const skill = listSkills(skillsDir)[0]!;
    expect(skill.status).toBe("tested");

    const promoted: string[] = [];
    const judgeTurns: string[] = [];
    const ev = createSkillEvaluator({
      createJudgeSession: (persona, projectId) => {
        expect(persona).toBe("yui-scholar");
        expect(projectId).toBe("p_dungeon-demo-research");
        return "s_judge";
      },
      ensureRoom: () => "p_dungeon-demo-research",
      runTurn: async (_sid, text) => {
        judgeTurns.push(text);
      },
      lastAssistantText: () => "kriteria 1: ada di reports/summary.md ✓\nVERDICT: LULUS",
      promote: (name) => promoted.push(name),
    });
    const final = await ev.evaluate(mission(), { name: skill.name, dir: skill.dir });
    expect(final.verdict).toBe("pass");
    expect(promoted).toEqual(["Demo Skill"]);
    expect(judgeTurns[0]).toContain("VERDICT: LULUS");
    expect(listSkills(skillsDir)[0]!.status).toBe("tested"); // promote via callback — runtime yang memanggil setSkillStatus
    const stored = readEval(skill.dir);
    expect(stored?.verdict).toBe("pass");
    expect(stored?.judgeSessionId).toBe("s_judge");
  });

  it("gagal verdict → fail + alasan; throw runtime → fail rapi (bukan reject)", async () => {
    const skillsDir = path.join(dir, "skills");
    proposeSkill(skillsDir, "Demo Skill", "Skill hasil misi contoh.", "Langkah 1.");
    acceptDraft(skillsDir, "demo-skill");
    const skill = listSkills(skillsDir)[0]!;
    const ev = createSkillEvaluator({
      createJudgeSession: () => "s_j1",
      ensureRoom: () => "p_x",
      runTurn: () => Promise.reject(new Error("model timeout")),
      lastAssistantText: () => null,
      promote: () => undefined,
    });
    const fail = await ev.evaluate(mission(), { name: skill.name, dir: skill.dir });
    expect(fail.verdict).toBe("fail");
    expect(fail.reason).toContain("model timeout");
    expect(readEval(skill.dir)?.verdict).toBe("fail");
    // gagal verdict eksplisit
    const ev2 = createSkillEvaluator({
      createJudgeSession: () => "s_j2",
      ensureRoom: () => "p_x",
      runTurn: () => Promise.resolve(),
      lastAssistantText: () => "kriteria 1 tidak ada buktinya di folder.\nVERDICT: GAGAL — laporan tidak memuat contoh kode",
      promote: () => undefined,
    });
    const fail2 = await ev2.evaluate(mission(), { name: skill.name, dir: skill.dir });
    expect(fail2).toEqual({ verdict: "fail", reason: "laporan tidak memuat contoh kode", judgeSessionId: "s_j2", at: fail2.at });
    writeEval(skill.dir, fail2); // idempotent write
  });
});
