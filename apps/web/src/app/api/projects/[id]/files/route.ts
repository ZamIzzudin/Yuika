import { NextRequest, NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

/** GET /api/projects/[id]/files → tree (P2-STU-3 v0).
 *  ?path=… → isi satu file (scoped dir project; >256 KB → truncated). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const p = new URL(req.url).searchParams.get("path");
    if (p) return NextResponse.json(getRuntime().readProjectFile(id, p));
    return NextResponse.json({ tree: getRuntime().listProjectFiles(id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
