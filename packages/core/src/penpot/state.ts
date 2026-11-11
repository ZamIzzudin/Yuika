// @yuika/core, P2-DSN-2: state connector Penpot di workspace.
// `.yuika/penpot.json`: default team/project (dibuat sekali oleh setup),
// dan cache per file (shareId untuk embed viewer + revn terakhir untuk
// optimistic concurrency update-file).
import fs from "node:fs";
import path from "node:path";

export interface PenpotFileState {
  name: string;
  shareId?: string;
  revn: number;
  vern?: number;
  pages?: Array<{ id: string; name: string }>;
  updatedAt: number;
}

export interface PenpotState {
  defaultTeamId?: string;
  defaultProjectId?: string;
  lastFileId?: string;
  files: Record<string, PenpotFileState>;
}

export function penpotStateFile(workspacePath: string): string {
  return path.join(workspacePath, ".yuika", "penpot.json");
}

export function loadPenpotState(workspacePath: string): PenpotState {
  try {
    const raw = JSON.parse(fs.readFileSync(penpotStateFile(workspacePath), "utf-8")) as PenpotState;
    return { ...raw, files: raw.files ?? {} };
  } catch {
    return { files: {} };
  }
}

export function savePenpotState(workspacePath: string, state: PenpotState): void {
  fs.mkdirSync(path.join(workspacePath, ".yuika"), { recursive: true });
  fs.writeFileSync(penpotStateFile(workspacePath), JSON.stringify(state, null, 2), "utf-8");
}
