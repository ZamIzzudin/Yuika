import { NextRequest, NextResponse } from "next/server";
import { CreateTaskRequest } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** GET /api/projects/:id/tasks — tasklist project (P1-PRJ-4). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getRuntime().getProject(id)) return NextResponse.json({ error: "project tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ tasks: getRuntime().listProjectTasks(id) });
}

/** POST /api/projects/:id/tasks — tambah task. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getRuntime().getProject(id)) return NextResponse.json({ error: "project tidak ditemukan" }, { status: 404 });
  const body = CreateTaskRequest.parse(await req.json());
  const task = getRuntime().createProjectTask(id, body.title, body.assignee ?? null);
  return NextResponse.json({ task }, { status: 201 });
}
