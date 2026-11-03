import { NextRequest, NextResponse } from "next/server";
import { SendMessageRequest } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = SendMessageRequest.parse(await req.json());
  const rt = getRuntime();
  // Fire-and-forget: turn jalan async; client menerima progres via SSE stream.
  void rt.runTurn(id, body.text).catch((err: unknown) => {
    console.error("[yui] turn gagal:", err);
    rt.emitSessionError(id, err instanceof Error ? err.message : String(err));
  });
  return NextResponse.json({ accepted: true });
}
