// @yuika/core, USER.md stub : preview learning-loop. JANGAN klaim lebih:
// ini hanya menempelkan 1 catatan preferensi statis per sesi baru. Loop belajar
// sungguhan (nudge → skill-from-experience → curasi) = P1-MEM .
import fs from "node:fs";
import path from "node:path";

export const USER_MD = "USER.md";
const MAX_NOTES = 50; // demo guard: file tak berlipat tanpa batas

export function userMdPath(workspacePath: string): string {
  return path.join(workspacePath, USER_MD);
}

/** Header file saat pertama dibuat, transparan & editable user (pola Hermes §4.7). */
const HEADER = `# USER.md, preferensi pengguna

> Catatan yang Yui baca untuk mengenal preferensimu. Boleh diedit langsung,
> file ini milikmu. (Fitur "What Yui knows" penuh menyusul di P1.)

`;
const FOOTER_NOTE = (personaName: string, iso: string) =>
  `- (preview) ${iso} · sesi dengan ${personaName}: preferensi default, jawaban ringkas, bahasa mengikuti user.\n`;

/**
 * Append 1 catatan preferensi statis per sesi baru (label "preview").
 * Idempotent terhadap crash: append biasa, tidak pernah menimpa isi user.
 */
export function appendUserPreferenceNote(workspacePath: string, personaName: string): void {
  const file = userMdPath(workspacePath);
  fs.mkdirSync(workspacePath, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, HEADER, "utf-8");
  }
  const content = fs.readFileSync(file, "utf-8");
  if (content.split("\n").length - 1 >= MAX_NOTES) return; // demo guard
  fs.appendFileSync(file, FOOTER_NOTE(personaName, new Date().toISOString()), "utf-8");
}
