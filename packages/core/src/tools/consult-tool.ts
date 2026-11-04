// @yui/core — consult (P2-PM-2, D22): brainstorm multi-persona TERSTRUKTUR.
// Planner mengajukan SATU pertanyaan tajam ke 2–3 persona spesialis secara
// PARALEL (via delegation runner yang sudah ada — metering, cap, event, audit
// ikut jalan), lalu menerima jawaban berlabel per persona untuk disintesis.
// Bukan chat bebas: prompt anak memaksa format tetap (pendapat/risiko/saran/
// asumsi) agar hasil bisa dikutip di dokumen perencanaan.
import { z } from "zod";
import { registry } from "../registry.js";
import { runChildPersona, type DelegationDeps } from "../delegation/runner.js";

const schema = z.object({
  personas: z.array(z.string().min(1)).min(1).max(3).describe("1–3 persona id, mis. [yui-scholar, yui-analyst]"),
  question: z.string().min(1).describe("SATU pertanyaan tajam yang bisa dijawab mandiri oleh tiap persona"),
  context: z.string().nullish().describe("konteks singkat yang sama untuk semua persona (opsional)"),
});

export function registerConsultTool(deps: DelegationDeps): void {
  registry.register({
    name: "consult",
    description:
      "Brainstorm terstruktur: tanyakan SATU pertanyaan ke beberapa persona spesialis sekaligus (paralel) dan terima jawaban berformat tetap per persona untuk disintesis. " +
      "Gunakan saat menyusun rencana & ada ketidakpastian berdampak besar (teknis, data, format deliverable). Bukan untuk tugas eksekusi.",
    parameters: schema,
    handler: async (args: z.infer<typeof schema>, ctx) => {
      const uniq = [...new Set(args.personas)];
      // Paralel via runner yang sama dengan delegate_task (cap maxChildren tetap berlaku —
      // kelebihan anak akan throw di runner, pesannya menjelaskan cara menaikkan cap).
      const handles = uniq.map((personaId) =>
        runChildPersona(
          { ...deps, workspacePath: ctx.workspacePath },
          { sessionId: ctx.sessionId, turnId: ctx.turnId },
          personaId,
          buildPrompt(personaId, args.question, args.context ?? null),
          null,
          ctx.emit,
        ),
      );
      const answers = await Promise.all(
        handles.map(async (h, i) => ({ persona: uniq[i]!, childSessionId: h.childSessionId, answer: await h.summary })),
      );
      return {
        result: {
          question: args.question,
          answers,
          // instruksi sintesis untuk Planner (pemanggil) — bukan jawaban final
          guidance:
            "Sintesis jawaban di atas: ambil posisi per topik, catat perbedaan pendapat sebagai keputusan terbuka (butuh user), kutip persona per keputusan.",
        },
      };
    },
  });
}

/** Prompt anak: format tetap agar jawaban bisa dikutip & dibandingkan. */
function buildPrompt(personaId: string, question: string, context: string | null): string {
  return [
    `Konsultasi perencanaan (${personaId}). Jawab PERTANYAAN berikut dari keahlianmu.`,
    context ? `Konteks: ${context}` : "",
    "",
    `PERTANYAAN: ${question}`,
    "",
    "Balas HANYA dengan format berikut (ringkas, total ≤250 kata, bahasa Indonesia):",
    "PENDAPAT: <inti jawabanmu>",
    "RISIKO: <1–3 risiko paling berdampak bila pendapatmu diikuti>",
    "SARAN: <langkah konkret pertama yang kamu sarankan>",
    "ASUMSI: <asumsi yang kamu pakai>",
  ]
    .filter(Boolean)
    .join("\n");
}
