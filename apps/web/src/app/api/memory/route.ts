import { NextRequest, NextResponse } from "next/server";
import { MemoryScope, SaveMemoryRequest } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** GET /api/memory?scope=user|project&projectId=… — baca USER.md / MEMORY.md (P1-MEM-1). */
export async function GET(req: NextRequest) {
  const scope = MemoryScope.parse(req.nextUrl.searchParams.get("scope") ?? "user");
  const projectId = req.nextUrl.searchParams.get("projectId");
  try {
    return NextResponse.json({ scope, projectId, content: getRuntime().readMemory(scope, projectId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

/** PUT /api/memory — simpan utuh dari editor user (satu-satunya jalur menimpa). */
export async function PUT(req: NextRequest) {
  const body = SaveMemoryRequest.parse(await req.json());
  try {
    getRuntime().saveMemory(body.scope, body.content, body.projectId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
