import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRuntime } from "@/lib/runtime";

/** GET /api/dungeons — daftar misi + riwayat run (P1-DUN-1). */
export async function GET() {
  return NextResponse.json({ dungeons: getRuntime().listDungeons() });
}

/** POST /api/dungeons — jalankan misi ({missionId}) → run sandbox dimulai. */
export async function POST(req: NextRequest) {
  const { missionId } = z.object({ missionId: z.string().min(1) }).parse(await req.json());
  try {
    return NextResponse.json(getRuntime().startDungeonRun(missionId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
