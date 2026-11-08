// @yuika/core, dungeon runner : jalankan MISI sebagai sesi sandbox.
// Ruangan = project kind="dungeon" (root workspace/dungeons/<id>) → semua file
// tools persona terisolasi di sana. Run bersifat async: status dipolling UI
// (running/done/failed) & dipersist di <dungeon>/runs.json (restart → failed).
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DungeonRun, Mission } from "@yuika/contracts";
import { missionDir } from "./mission.js";

/** Prompt misi: agent tahu goal, sumber, acceptance, dan WAJIB menutup dengan
 * skill_propose (skill hasil latihan → draf , milik persona ini). */
export function buildMissionPrompt(m: Mission): string {
  const res = m.resources.length ? m.resources.map((r) => `  - ${r}`).join("\n") : "  (tidak ada, cari sumber sendiri via web research)";
  const acc = m.acceptance.map((a) => `  - ${a}`).join("\n");
  return [
    `MISI LATIHAN: ${m.title}`,
    "",
    `GOAL: ${m.goal.trim()}`,
    "",
    "SUMBER BELAJAR:",
    res,
    "",
    "KRITERIA LULUS (acceptance):",
    acc,
    "",
    `SKILL TARGET: "${m.targetSkill.name}", ${m.targetSkill.description}`,
    "",
    "CARA KERJA:",
    "1. Sumber di atas bisa URL (ambil via web_fetch) ATAU path file di folder misi",
    "   ini (file teks → read_file; PDF/Excel → doc_read bila tool tersedia).",
    "2. Pelajari sumber sampai paham, boleh cari tambahan bila kurang.",
    "3. Praktikkan di folder misi ini (sandbox, semua file di sini aman).",
    "4. Tulis hasil belajar sebagai laporan di reports/ folder misi ini.",
    "5. AKHIRI dengan tool `skill_propose` untuk skill target di atas, isi body",
    "   dengan prosedur yang kamu PRAKTIKKAN, bukan teori kosong. Tanpa itu",
    "   misi dianggap belum selesai.",
    "6. Tutup dengan ringkasan singkat: apa yang dipelajari & bukti di folder.",
  ].join("\n");
}

/** Persist ringkas status run (append + rewrite; volume kecil). */
function runsFile(workspacePath: string, missionId: string): string {
  return path.join(missionDir(workspacePath, missionId), "runs.json");
}

export function loadRuns(workspacePath: string, missionId: string): DungeonRun[] {
  const f = runsFile(workspacePath, missionId);
  if (!fs.existsSync(f)) return [];
  try {
    return JSON.parse(fs.readFileSync(f, "utf-8")) as DungeonRun[];
  } catch {
    return [];
  }
}

function saveRun(workspacePath: string, run: DungeonRun): void {
  const f = runsFile(workspacePath, run.missionId);
  const all = loadRuns(workspacePath, run.missionId).filter((r) => r.id !== run.id);
  all.push(run);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(all.slice(-20), null, 2), "utf-8");
}

/** Runtime restart saat ada run "running" → tandai failed (turn mati bersama proses). */
export function sweepStaleRuns(workspacePath: string, missions: Mission[]): void {
  for (const m of missions) {
    for (const r of loadRuns(workspacePath, m.id)) {
      if (r.status === "running") saveRun(workspacePath, { ...r, status: "failed", endedAt: Date.now(), summary: "server direstart saat misi berjalan" });
    }
  }
}

export interface DungeonRunnerDeps {
  workspacePath: string;
  /** Pastikan ruangan dungeon ada (project kind dungeon), kembalikan projectId. */
  ensureRoom: (mission: Mission) => string;
  /** Buat sesi persona di ruangan tsb (workspace ter-scope ke folder misi). */
  createSession: (personaId: string, projectId: string) => string;
  /** Jalankan turn (async, resolve saat turn selesai). */
  runTurn: (sessionId: string, text: string) => Promise<void>;
  /** Ringkasan hasil: pesan assistant terakhir sesi. */
  lastAssistantText: (sessionId: string) => string | null;
}

export function createDungeonRunner(deps: DungeonRunnerDeps) {
  /** Mulai run baru, fire-and-forget; status via listRuns/getRun. */
  function start(mission: Mission): DungeonRun {
    // satu run aktif per misi (arena latihan = fokus; antre menyusul bila perlu)
    const active = loadRuns(deps.workspacePath, mission.id).find((r) => r.status === "running");
    if (active) throw new Error(`misi '${mission.id}' sedang berjalan (run ${active.id}), tunggu selesai`);

    const projectId = deps.ensureRoom(mission);
    const sessionId = deps.createSession(mission.persona, projectId);
    const run: DungeonRun = {
      id: `run_${randomUUID().slice(0, 8)}`,
      missionId: mission.id,
      sessionId,
      projectId,
      status: "running",
      startedAt: Date.now(),
      endedAt: null,
      summary: null,
    };
    saveRun(deps.workspacePath, run);
    // turn misi jalan di background; status run di-update saat selesai
    void deps
      .runTurn(sessionId, buildMissionPrompt(mission))
      .then(() => {
        saveRun(deps.workspacePath, {
          ...run,
          status: "done",
          endedAt: Date.now(),
          summary: (deps.lastAssistantText(sessionId) ?? "").slice(0, 500) || null,
        });
      })
      .catch((e: unknown) => {
        saveRun(deps.workspacePath, {
          ...run,
          status: "failed",
          endedAt: Date.now(),
          summary: (e instanceof Error ? e.message : String(e)).slice(0, 300),
        });
      });
    return run;
  }

  return { start, runs: (missionId: string) => loadRuns(deps.workspacePath, missionId) };
}
