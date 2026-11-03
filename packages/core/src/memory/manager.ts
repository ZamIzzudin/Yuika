// @yui/core — Memory manager (P1-MEM-1): dua dokumen editable —
//   USER.md   (workspace, lintas project): preferensi & fakta user.
//   MEMORY.md (per project): keputusan, pelajaran, konteks proyek.
// Prinsip Hermes §4.7: file milik user — transparan, editable langsung;
// agent hanya menambah (append terkurasi, dedupe) lewat tool memory_append.
// Kapan dibaca: di-inject ke system prompt saat sesi DIBUAT (frozen per sesi,
// cache discipline) — catatan baru berlaku mulai sesi berikutnya.
import fs from "node:fs";
import path from "node:path";

export type MemoryScope = "user" | "project";

export const USER_HEADER = `# USER.md — preferensi pengguna

> Catatan yang Yui baca untuk mengenal preferensimu. Boleh diedit langsung —
> file ini milikmu. Agent menambah catatan lewat tool \`memory_append\`.

`;

export const PROJECT_HEADER = (projectName: string) => `# MEMORY.md — memori project ${projectName}

> Keputusan, pelajaran, dan konteks yang agent baca di setiap sesi baru proyek ini.

`;

const MAX_NOTES = 200; // guard: file tak berlipat tanpa batas

/** Path dokumen memori. scope user = workspace/USER.md; project = projectRoot/MEMORY.md. */
export function memoryPath(
  workspacePath: string,
  scope: MemoryScope,
  projectRootPath?: string | null,
): string {
  if (scope === "user") return path.join(workspacePath, "USER.md");
  if (!projectRootPath) throw new Error("scope project butuh projectRootPath");
  return path.join(projectRootPath, "MEMORY.md");
}

/** Baca dokumen (buat dengan header bila belum ada). Return content penuh. */
export function readMemory(workspacePath: string, scope: MemoryScope, projectRootPath?: string | null, projectName = ""): string {
  const file = memoryPath(workspacePath, scope, projectRootPath);
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf-8");
  const header = scope === "user" ? USER_HEADER : PROJECT_HEADER(projectName);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, header, "utf-8");
  return header;
}

/** Simpan utuh (dari editor user) — satu-satunya jalur menimpa. */
export function saveMemory(workspacePath: string, scope: MemoryScope, content: string, projectRootPath?: string | null): void {
  const file = memoryPath(workspacePath, scope, projectRootPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.endsWith("\n") ? content : content + "\n", "utf-8");
}

/** Normalisasi catatan untuk dedupe: buang timestamp/persona → bandingkan inti. */
function noteKey(note: string): string {
  return note.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Append terkurasi (dipakai tool memory_append):
 * - format `- [iso] persona: note`
 * - DEDUPE: skip bila inti catatan (tanpa timestamp) sudah ada di file
 * - guard MAX_NOTES
 * Return true bila tertulis.
 */
export function appendCurated(
  workspacePath: string,
  scope: MemoryScope,
  note: string,
  personaName: string,
  projectRootPath?: string | null,
): boolean {
  const trimmed = note.trim();
  if (!trimmed) return false;
  const content = readMemory(workspacePath, scope, projectRootPath);
  const lines = content.split("\n");
  if (lines.length - 1 >= MAX_NOTES) return false;
  const key = noteKey(trimmed);
  if (lines.some((l) => noteKey(l.replace(/^- \[[^\]]*\]\s*[^:]*:\s*/, "")) === key)) return false;
  fs.appendFileSync(
    memoryPath(workspacePath, scope, projectRootPath),
    `- [${new Date().toISOString().slice(0, 10)}] ${personaName}: ${trimmed}\n`,
    "utf-8",
  );
  return true;
}

/**
 * Bagian system prompt: catatan memori yang dibaca agent.
 * Dipanggil saat sesi DIBUAT (frozen) — bukan tiap turn.
 */
export function memoryPromptSection(workspacePath: string, projectRootPath?: string | null): string {
  const parts: string[] = [];
  const user = readMemory(workspacePath, "user").replace(USER_HEADER, "").trim();
  if (user) parts.push(`## Preferensi pengguna (USER.md — milik user, bisa diedit)\n${user}`);
  if (projectRootPath) {
    const proj = readMemory(workspacePath, "project", projectRootPath).replace(/^# MEMORY\.md[\s\S]*?\n\n/, "").trim();
    if (proj) parts.push(`## Memori project ini (MEMORY.md — keputusan & pelajaran)\n${proj}`);
  }
  if (parts.length === 0) return "";
  return `\n\n${parts.join("\n\n")}\n\nGunakan catatan di atas untuk menyesuaikan cara bekerjamu. Perubahan preferensi yang jelas & reusable bisa kamu simpan lewat tool memory_append.`;
}
