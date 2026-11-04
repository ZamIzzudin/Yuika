import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

/** GET /api/projects/[id]/delegations → semua edge delegasi lintas sesi
 *  (graf nyata: parent→child, termasuk delegasi cucu dari sesi anak) —
 *  sumber diagram hierarki tab Tim. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ delegations: getRuntime().getProjectDelegations(id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
