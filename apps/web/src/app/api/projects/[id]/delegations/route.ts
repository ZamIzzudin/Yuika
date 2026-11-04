import { NextResponse } from "next/server";
import { DelegationJob } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** GET /api/projects/[id]/delegations → semua edge delegasi lintas sesi
 *  (graf nyata: parent→child, termasuk delegasi cucu dari sesi anak) —
 *  sumber diagram hierarki tab Tim.
 *  P0-DEL-1: + `jobs` — baris job persist (audit/status lintas restart). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const rt = getRuntime();
    const delegations = rt.getProjectDelegations(id);
    const jobs = DelegationJob.array().parse(rt.delegationJobs(id));
    return NextResponse.json({ delegations, jobs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
