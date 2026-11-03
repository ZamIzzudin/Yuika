import { NextRequest, NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

/** GET /api/projects/:id/tree — TaskTree (P1-PRJ-7, PLAN §13.7): pohon utuh
 *  dari replay event project (append-only). Refresh = fold ulang, tanpa state kedua. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getRuntime().getProject(id)) return NextResponse.json({ error: "project tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ nodes: getRuntime().getTaskTree(id) });
}
