// @yuika/core, dungeon eval buta (P1-DUN-3, PLAN §13.8): gerbang tested→ready.
// "Buta" = sesi hakim FRESH (tanpa riwayat sesi latihan) di folder misi yang
// sama; hanya melihat kriteria acceptance + bukti di folder + isi skill
// (skill_view). Lulus semua kriteria → VERDICT: LULUS → status `ready`;
// selain itu tetap `tested` + alasan tersimpan (.eval.json).
import fs from "node:fs";
import path from "node:path";
import { SkillEval, type Mission } from "@yuika/contracts";
import { slugify } from "../skills/manager.js";

export function evalFile(skillDir: string): string {
  return path.join(skillDir, ".eval.json");
}

export function readEval(skillDir: string): SkillEval | null {
  try {
    return SkillEval.parse(JSON.parse(fs.readFileSync(evalFile(skillDir), "utf-8")));
  } catch {
    return null;
  }
}

export function writeEval(skillDir: string, ev: SkillEval): void {
  fs.writeFileSync(evalFile(skillDir), JSON.stringify(ev, null, 2), "utf-8");
}

/** Misi cocok skill bila nama/slug targetSkill sama (case/strip-insensitive). */
export function missionForSkill(missions: Mission[], skillName: string): Mission | null {
  const want = slugify(skillName);
  return missions.find((m) => slugify(m.targetSkill.name) === want) ?? null;
}

/** Prompt hakim, eksplisit anti-bias: nilai HANYA dari bukti, bukan cerita. */
export function buildEvalPrompt(m: Mission, skillName: string): string {
  const acc = m.acceptance.map((a, i) => `  ${i + 1}. ${a}`).join("\n");
  return [
    "EVALUASI BUTA, Anda evaluator independen.",
    "Anda TIDAK tahu dan tidak perlu tahu bagaimana artefak di folder ini dibuat.",
    "Nilai HANYA dari bukti yang bisa Anda baca sendiri di folder ini.",
    "",
    `SKILL YANG DIKLAIM: "${skillName}"`,
    `Baca isi lengkapnya via tool skill_view (nama persis: ${skillName}).`,
    "",
    "KRITERIA ACCEPTANCE, SEMUA harus terpenuhi:",
    acc,
    "",
    "BUKTI: file laporan/artefak misi di folder ini (mulai dari reports/, pakai",
    "list_files lalu read_file). Skill dianggap BENAR bila prosedurnya bisa",
    "diikuti dan bukti di folder memenuhi tiap kriteria di atas.",
    "",
    "LANGKAH: (1) baca skill; (2) baca bukti; (3) nilai tiap kriteria SATU PER",
    "SATU (kutip bukti pendek); (4) baris TERAKHIR wajib persis salah satu:",
    "VERDICT: LULUS",
    "VERDICT: GAGAL, <alasan singkat>",
    "Jangan menulis baris VERDICT sebelum analisis selesai.",
  ].join("\n");
}

/** Parser verdict dari pesan terakhir hakim, cari baris VERDICT TERAKHIR
 *  (model kadang menulis draft verdict di tengah; yang sah = terakhir). */
export function parseVerdict(text: string): { verdict: "pass" | "fail"; reason: string } {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i]!.match(/^\s*VERDICT\s*[:：]\s*(LULUS|GAGAL)\s*(?:[,—-]\s*(.*))?$/i);
    if (m) {
      const pass = m[1]!.toUpperCase() === "LULUS";
      const reason = (m[2] ?? "").trim();
      return { verdict: pass ? "pass" : "fail", reason: reason || (pass ? "semua kriteria terpenuhi" : "kriteria tidak terpenuhi") };
    }
  }
  return { verdict: "fail", reason: "hakim tidak mengeluarkan VERDICT yang valid" };
}

export interface SkillEvaluatorDeps {
  /** Sesi hakim FRESH persona misi, attach ke ruangan dungeon (scope bukti). */
  createJudgeSession: (personaId: string, projectId: string) => string;
  ensureRoom: (mission: Mission) => string;
  runTurn: (sessionId: string, text: string) => Promise<void>;
  lastAssistantText: (sessionId: string) => string | null;
  /** Lulus → naikkan status skill jadi ready (P1-DUN-2 setSkillStatus). */
  promote: (skillName: string) => void;
}

export function createSkillEvaluator(deps: SkillEvaluatorDeps) {
  /** Jalankan eval (async, resolve saat verdict turun). Tulis .eval.json
   *  pending di awal agar UI/polling tahu eval sedang berjalan. */
  async function evaluate(mission: Mission, skill: { name: string; dir: string }): Promise<SkillEval> {
    const pending: SkillEval = { verdict: "pending", reason: null, judgeSessionId: "…", at: Date.now() };
    writeEval(skill.dir, pending);
    const projectId = deps.ensureRoom(mission);
    const sessionId = deps.createJudgeSession(mission.persona, projectId);
    const running: SkillEval = { ...pending, judgeSessionId: sessionId };
    writeEval(skill.dir, running);
    let final: SkillEval;
    try {
      await deps.runTurn(sessionId, buildEvalPrompt(mission, skill.name));
      const { verdict, reason } = parseVerdict(deps.lastAssistantText(sessionId) ?? "");
      if (verdict === "pass") deps.promote(skill.name);
      final = { verdict, reason: reason.slice(0, 300), judgeSessionId: sessionId, at: Date.now() };
    } catch (e) {
      final = { verdict: "fail", reason: (e instanceof Error ? e.message : String(e)).slice(0, 300), judgeSessionId: sessionId, at: Date.now() };
    }
    writeEval(skill.dir, final);
    return final;
  }

  return { evaluate };
}
