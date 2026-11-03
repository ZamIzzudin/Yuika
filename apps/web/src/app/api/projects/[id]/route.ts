import { NextRequest, NextResponse } from "next/server";
import { UpdateProjectRequest } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** GET /api/projects/:id — detail project. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getRuntime().getProject(id);
  if (!project) return NextResponse.json({ error: "project tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ project });
}

/** PATCH /api/projects/:id — rename/description/archive. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = UpdateProjectRequest.parse(await req.json());
  const project = getRuntime().updateProject(id, body);
  if (!project) return NextResponse.json({ error: "project tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ project });
}
