import { NextRequest, NextResponse } from "next/server";
import { CreateProjectRequest } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** GET /api/projects — daftar semua project (P1-PRJ-1). */
export async function GET() {
  return NextResponse.json({ projects: getRuntime().listProjects() });
}

/** POST /api/projects — buat project baru (root workspace dibuat otomatis). */
export async function POST(req: NextRequest) {
  const body = CreateProjectRequest.parse(await req.json());
  const project = getRuntime().createProject(body.name, body.description);
  return NextResponse.json({ project }, { status: 201 });
}
