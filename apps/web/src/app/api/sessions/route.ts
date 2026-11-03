import { NextRequest, NextResponse } from "next/server";
import { CreateSessionRequest } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

export async function POST(req: NextRequest) {
  const body = CreateSessionRequest.parse(await req.json());
  const { sessionId, persona, projectId } = getRuntime().createSession(body.personaId, body.projectId ?? null);
  return NextResponse.json({ sessionId, persona, projectId });
}
