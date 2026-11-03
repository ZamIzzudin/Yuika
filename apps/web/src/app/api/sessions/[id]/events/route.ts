import { NextRequest, NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

/** Replay event (resume/reconnect) — pola events.since Hermes. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const since = Number(new URL(req.url).searchParams.get("since") ?? 0);
  return NextResponse.json({ events: getRuntime().getEvents(id, since) });
}
