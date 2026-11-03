import { NextRequest, NextResponse } from "next/server";
import { CreateSessionRequest } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

export async function POST(req: NextRequest) {
  const body = CreateSessionRequest.parse(await req.json());
  const { sessionId, persona, projectId } = getRuntime().createSession(body.personaId, body.projectId ?? null);
  return NextResponse.json({ sessionId, persona, projectId });
}

/** Riwayat sesi sebuah project (terbaru dulu) — pintu resume percakapan. */
export async function GET(req: NextRequest) {
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ sessions: [] });
  const sessions = getRuntime().listProjectSessions(projectId);
  return NextResponse.json({ sessions });
}
