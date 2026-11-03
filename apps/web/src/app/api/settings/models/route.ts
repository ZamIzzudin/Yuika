import { NextRequest, NextResponse } from "next/server";
import { UpdateModelRouteRequest } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** GET /api/settings/models — route model per persona (P1-MDL-1). */
export async function GET() {
  return NextResponse.json(getRuntime().getModelRoutes());
}

/** PUT /api/settings/models — simpan override satu persona. */
export async function PUT(req: NextRequest) {
  const body = UpdateModelRouteRequest.parse(await req.json());
  try {
    getRuntime().updateModelRoute(body.personaId, { model: body.model, fallback: body.fallback });
    return NextResponse.json(getRuntime().getModelRoutes());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
