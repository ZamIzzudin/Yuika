import { NextRequest, NextResponse } from "next/server";
import { UpdateTaskRequest } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** PATCH /api/projects/:id/tasks/:taskId — update judul/status/assignee/refs. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id, taskId } = await params;
  const body = UpdateTaskRequest.parse(await req.json());
  // scope check: task harus milik project ini
  const existing = getRuntime().listProjectTasks(id).find((t) => t.id === taskId);
  if (!existing) return NextResponse.json({ error: "task tidak ditemukan di project ini" }, { status: 404 });
  const task = getRuntime().updateProjectTask(taskId, body);
  return NextResponse.json({ task });
}
