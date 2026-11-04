import { NextRequest, NextResponse } from "next/server";
import { UsageFilter } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** GET /api/usage?projectId=&sessionId=&personaId=&since=&recent=N
 *  P1-CRED-1: summary metering (rollup per persona/model) + feed event terbaru.
 *  `since` = epoch ms (window burn-rate); `recent` (opsional) menyertakan event mentah. */
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams;
  const filter = UsageFilter.parse({
    projectId: q.get("projectId") ?? undefined,
    sessionId: q.get("sessionId") ?? undefined,
    personaId: q.get("personaId") ?? undefined,
    since: q.get("since") ? Number(q.get("since")) : undefined,
  });
  const runtime = getRuntime();
  const summary = runtime.getUsageSummary(filter);
  const recent = q.get("recent") ? runtime.getUsageRecent(Math.min(Number(q.get("recent")) || 20, 200), filter) : undefined;
  return NextResponse.json({ summary, recent });
}
