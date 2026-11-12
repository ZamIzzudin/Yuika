// D93: attach komponen desain sebagai context chat. Shape terpilih di
// canvas (klik kanan → "Attach to chat") berpindah ke composer sebagai chip;
// saat dikirim, snapshot JSON subtree ditanam ke pesan user (transparan,
// ter-persist di riwayat — sama dgn pola lampiran dokumen D88). Persona
// membaca data langsung + bisa live-edit via design_update_shape.
import type { DesignFile, DesignShape } from "@yuika/core/design";

/** Maks komponen per pesan (file dokumen = 5; komponen lebih padat). */
export const MAX_DESIGN_REFS = 3;

export interface DesignRefPayload {
  fileId: string;
  fileName: string;
  pageId: string;
  pageName: string;
  shapeId: string;
  shapeName: string;
  shapeType: DesignShape["type"];
  /** revn file saat di-attach (persona bisa cek via design_get_file). */
  revn: number;
  /** JSON string subtree shape (dgn anaknya). */
  snapshot: string;
}

const hasChildren = (s: DesignShape): s is Extract<DesignShape, { children: string[] }> =>
  s.type === "frame" || s.type === "group";

/** Pohon shape utk snapshot (children nested, dengan cap). */
function subtree(
  page: { shapes: Record<string, DesignShape> },
  id: string,
  budget: { nodes: number },
): Record<string, unknown> | null {
  const s = page.shapes[id];
  if (!s) return null;
  const out: Record<string, unknown> = { ...s };
  if (hasChildren(s) && s.children.length > 0) {
    if (budget.nodes <= 0) {
      out.children = `… (${s.children.length} more children, use design_get_file)`;
    } else {
      const kids = [];
      for (const c of s.children) {
        budget.nodes -= 1;
        const kid = subtree(page, c, budget);
        if (kid) kids.push(kid);
        if (budget.nodes <= 0) break;
      }
      out.children = kids;
    }
  }
  return out;
}

/** Bangun payload refs dari shape terpilih (top-level saja; child ikut
 *  snapshot parent-nya kalau parent yang dipilih). */
export function makeDesignRefs(
  file: DesignFile,
  pageId: string,
  shapeIds: string[],
): DesignRefPayload[] {
  const page = file.pages.find((p) => p.id === pageId);
  if (!page) return [];
  const refs: DesignRefPayload[] = [];
  for (const id of shapeIds) {
    const s = page.shapes[id];
    if (!s) continue;
    let snap = subtree(page, id, { nodes: 40 });
    if (!snap) continue;
    let json = JSON.stringify(snap, null, 1);
    if (json.length > 6000) {
      snap = { ...s, note: "snapshot truncated; full tree via design_get_file" };
      json = JSON.stringify(snap, null, 1);
    }
    refs.push({
      fileId: file.id,
      fileName: file.name,
      pageId: page.id,
      pageName: page.name,
      shapeId: id,
      shapeName: s.name,
      shapeType: s.type,
      revn: file.revn,
      snapshot: json,
    });
    if (refs.length >= MAX_DESIGN_REFS) break;
  }
  return refs;
}

export function designRefLabel(r: DesignRefPayload): string {
  return `${r.fileName} / ${r.pageName} / ${r.shapeType} "${r.shapeName}"`;
}

/** Teks yang ditanam ke pesan user (dibaca persona). */
export function buildDesignAttachmentText(refs: DesignRefPayload[]): string {
  const lines = refs.map(
    (r) => `- ${designRefLabel(r)} (id ${r.shapeId}, page ${r.pageId}, rev ${r.revn})`,
  );
  return [
    "[design component attached]",
    ...lines,
    "",
    "```json",
    refs.length === 1 ? refs[0]!.snapshot : `[${refs.map((r) => r.snapshot).join(",")}]`,
    "```",
    "(live data: design_get_file; edit: design_update_shape)",
  ].join("\n");
}

export interface ParsedDesignAttachment {
  /** teks pesan tanpa blok attachment. */
  text: string;
  /** label chip per komponen. */
  labels: string[];
  /** json snapshot utk tampilan collapsed. */
  json: string;
}

/** Parse balik blok attachment dari konten riwayat (utk render chip).
 *  Return null bila pesan tak memuat attachment desain. */
export function parseDesignAttachment(content: string): ParsedDesignAttachment | null {
  const marker = "[design component attached]";
  const at = content.indexOf(marker);
  if (at < 0) return null;
  const before = content.slice(0, at).replace(/\s+$/, "");
  const rest = content.slice(at + marker.length);
  const fence = rest.indexOf("```json");
  const head = fence >= 0 ? rest.slice(0, fence) : rest;
  const labels = head
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2));
  let json = "";
  let tail = "";
  if (fence >= 0) {
    const after = rest.slice(fence + 7);
    const end = after.indexOf("```");
    if (end >= 0) {
      json = after.slice(0, end).trim();
      tail = after.slice(end + 3).trim();
    } else json = after.trim();
  }
  const text = [before, tail].filter((t) => t && t !== "(live data: design_get_file; edit: design_update_shape)").join("\n").trim();
  if (labels.length === 0 && !json) return null;
  return { text, labels, json };
}
