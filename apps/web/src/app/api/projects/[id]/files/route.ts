import { NextRequest, NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

/** GET /api/projects/[id]/files → tree (P2-STU-3).
 *  ?path=… → isi file saat ini (+ `revisions` bila diminta).
 *  ?path=…&rev=N → isi satu revisi lama (untuk diff di UI).
 *  ?path=…&revisions=1 → daftar revisi file. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const sp = new URL(req.url).searchParams;
    const p = sp.get("path");
    if (p) {
      if (sp.get("revisions")) return NextResponse.json({ revisions: getRuntime().listFileRevisions(id, p) });
      const rev = sp.get("rev");
      if (rev) return NextResponse.json({ content: getRuntime().readFileRevision(id, p, Number(rev)) });
      return NextResponse.json(getRuntime().readProjectFile(id, p));
    }
    return NextResponse.json({ tree: getRuntime().listProjectFiles(id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
