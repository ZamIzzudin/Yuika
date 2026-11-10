// @yuika/core, blind test persona (P1-PER-5): bukti anti "hanya kosmetik".
// Beberapa persona menjawab SATU prompt uji yang sama dalam sesi FRESH;
// penguji (manusia) melihat jawaban TERANONIM (huruf A/B/C…) dan menebak
// persona penulisnya. Gerbang lulus: ≥80% tebakan benar per run.
//
// Anonimisasi: mapping huruf→persona HANYA di file run server-side
// (workspace/blindtests/<id>.json); view untuk UI dibersihkan
// (personaId/sessionId dicabut) sampai tebakan disubmit → reveal.
// Jawaban boleh dilihat utuh: justru itu yang dinilai (gaya + proses),
// asal identitas penulisnya tidak bocor dari UI.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface BlindPrompt {
  id: string;
  label: string;
  text: string;
}

/** 5 prompt uji lintas ranah. Netral (bisa dijawab persona mana pun) tapi
 * memancing karakter khas: cara memulai, struktur, alat yang disebut,
 * kehati-hatian, format laporan. Jawaban bahasa bebas (persona default ID). */
export const BLIND_PROMPTS: BlindPrompt[] = [
  {
    id: "plan",
    label: "Perencanaan fitur",
    text:
      "User meminta fitur ekspor laporan ke PDF pada aplikasi web yang ada. " +
      "Tuliskan rencana eksekusimu (maks 180 kata). Jangan bertanya balik, tulis langsung.",
  },
  {
    id: "debug",
    label: "Debug produksi",
    text:
      "Sebuah service produksi restart sendiri tiap 5 menit sejak deploy tadi malam. " +
      "Log berisi crash setiap restart. Jelaskan langkahmu menangani ini (maks 180 kata).",
  },
  {
    id: "review",
    label: "Review kode",
    text:
      "Kamu diberi akses ke repo aplikasi baru yang belum pernah kamu lihat. " +
      "Tugasmu memahami arsitekturnya untuk laporan singkat tim. " +
      "Bagaimana kamu membacanya? Urutan dan apa yang kamu laporkan (maks 180 kata).",
  },
  {
    id: "research",
    label: "Riset singkat",
    text:
      "Tim butuh ringkasan pembanding dua library chart JS yang populer untuk " +
      "aplikasi internal. Tulis pendekatanmu + hasil ringkasnya (maks 180 kata).",
  },
  {
    id: "qa",
    label: "Menjaga kualitas",
    text:
      "Rilis fitur besar dalam 3 hari. Sebutkan bagaimana kamu memastikan kualitasnya " +
      "sebelum hari H (maks 180 kata).",
  },
];

export interface BlindEntry {
  letter: string;
  personaId: string; // server-side; dicabut dari view sebelum reveal
  sessionId: string; // server-side (jangan bocorkan: chat bisa dibuka)
  status: "running" | "done" | "failed";
  answer: string | null;
  error: string | null;
}

export interface BlindRun {
  id: string;
  promptId: string;
  promptLabel: string;
  promptText: string;
  createdAt: number;
  endedAt: number | null;
  status: "running" | "done" | "failed";
  entries: BlindEntry[];
  /** letter → personaId tebakan penguji (setelah submit). */
  guesses: Record<string, string> | null;
  correct: number | null;
  /** 0..1 */
  score: number | null;
  gatePass: boolean | null;
}

export interface BlindTestDeps {
  workspacePath: string;
  /** Buat sesi FRESH (projectId null — chat mandiri, bukan dungeon room). */
  createSession: (personaId: string, projectId: null) => string;
  /** Jalankan turn; resolve saat selesai. */
  runTurn: (sessionId: string, text: string) => Promise<void>;
  /** Pesan assistant terakhir sesi. */
  lastAssistantText: (sessionId: string) => string | null;
  /** Daftar persona valid (manifest ids). */
  validPersonaIds: () => string[];
}

function blindDir(workspacePath: string): string {
  return path.join(workspacePath, "blindtests");
}

function runFile(workspacePath: string, id: string): string {
  return path.join(blindDir(workspacePath), `${id}.json`);
}

function saveRun(deps: BlindTestDeps, run: BlindRun): void {
  fs.mkdirSync(blindDir(deps.workspacePath), { recursive: true });
  fs.writeFileSync(runFile(deps.workspacePath, run.id), JSON.stringify(run, null, 2), "utf-8");
}

export function loadBlindRuns(workspacePath: string): BlindRun[] {
  const dir = blindDir(workspacePath);
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as BlindRun)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

function loadRun(deps: BlindTestDeps, id: string): BlindRun | null {
  try {
    return JSON.parse(fs.readFileSync(runFile(deps.workspacePath, id), "utf-8")) as BlindRun;
  } catch {
    return null;
  }
}

const LETTERS = "ABCDEFGH";

export function createBlindTest(deps: BlindTestDeps) {
  /** Mulai run baru: 2..6 persona × satu prompt. Satu run aktif global. */
  function start(personaIds: string[], promptId: string): BlindRun {
    const unique = [...new Set(personaIds)];
    if (unique.length < 2 || unique.length > 6) {
      throw new Error("pilih 2-6 persona berbeda");
    }
    const valid = new Set(deps.validPersonaIds());
    for (const p of unique) if (!valid.has(p)) throw new Error(`persona tidak dikenal: ${p}`);
    const prompt = BLIND_PROMPTS.find((x) => x.id === promptId);
    if (!prompt) throw new Error(`prompt tidak dikenal: ${promptId}`);
    const running = loadBlindRuns(deps.workspacePath).find((r) => r.status === "running");
    if (running) throw new Error(`masih ada run aktif (${running.id}), tunggu selesai atau submit dulu`);

    // shuffle → huruf anon (mapping rahasia sampai submit)
    const shuffled = [...unique];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    const run: BlindRun = {
      id: `bt_${randomUUID().slice(0, 8)}`,
      promptId: prompt.id,
      promptLabel: prompt.label,
      promptText: prompt.text,
      createdAt: Date.now(),
      endedAt: null,
      status: "running",
      entries: shuffled.map((personaId, i) => {
        const sessionId = deps.createSession(personaId, null);
        return { letter: LETTERS[i]!, personaId, sessionId, status: "running", answer: null, error: null };
      }),
      guesses: null,
      correct: null,
      score: null,
      gatePass: null,
    };
    saveRun(deps, run);

    // semua persona paralel; run done bila semua entry selesai (gagal = failed)
    void Promise.all(
      run.entries.map(async (e) => {
        try {
          await deps.runTurn(e.sessionId, prompt.text);
          e.answer = deps.lastAssistantText(e.sessionId)?.slice(0, 4000) ?? null;
          e.status = "done";
        } catch (err) {
          e.status = "failed";
          e.error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
        }
      }),
    ).then(() => {
      run.status = run.entries.some((e) => e.status === "done") ? "done" : "failed";
      run.endedAt = Date.now();
      saveRun(deps, run);
    });
    return anonymize(run);
  }

  /** View untuk UI: personaId/sessionId dicabut; mapping hanya setelah submit. */
  function anonymize(run: BlindRun): BlindRun {
    const revealed = run.guesses !== null;
    return {
      ...run,
      entries: run.entries.map((e) => ({
        ...e,
        personaId: revealed ? e.personaId : "",
        sessionId: revealed ? e.sessionId : "",
      })),
    };
  }

  function get(id: string): BlindRun | null {
    const run = loadRun(deps, id);
    return run ? anonymize(run) : null;
  }

  function list(): BlindRun[] {
    return loadBlindRuns(deps.workspacePath).map((r) => anonymize(r));
  }

  /** Submit tebakan; hitung skor + reveal mapping. Idempotent-guard: sekali. */
  function submit(id: string, guesses: Record<string, string>): BlindRun {
    const run = loadRun(deps, id);
    if (!run) throw new Error(`run tidak ditemukan: ${id}`);
    if (run.status === "running") throw new Error("run masih berjalan, tunggu jawaban lengkap");
    if (run.guesses !== null) return anonymize(run); // sudah pernah → tampil ulang

    const guessable = run.entries.filter((e) => e.status === "done");
    if (Object.keys(guesses).length !== guessable.length) {
      throw new Error(`isi tebakan untuk semua ${guessable.length} jawaban`);
    }
    let correct = 0;
    for (const e of guessable) {
      if (guesses[e.letter] === e.personaId) correct += 1;
    }
    run.guesses = guesses;
    run.correct = correct;
    run.score = guessable.length > 0 ? correct / guessable.length : 0;
    run.gatePass = run.score >= 0.8;
    saveRun(deps, run);
    return anonymize(run);
  }

  return { start, get, list, submit };
}
