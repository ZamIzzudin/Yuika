import { NextRequest, NextResponse } from "next/server";
import { SaveRosterRequest } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** GET /api/projects/:id/roster — roster dari project.yaml (ter-replay via file). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getRuntime().getProject(id)) return NextResponse.json({ error: "project tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ roster: getRuntime().getProjectRoster(id) });
}

/** PUT /api/projects/:id/roster — simpan roster utuh ke project.yaml. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = SaveRosterRequest.parse(await req.json());
  try {
    const roster = getRuntime().saveProjectRoster(id, body.roster);
    return NextResponse.json({ roster });
  } catch (e) {
    // unknown persona / project hilang → 400 dengan pesan jelas
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
