import { NextRequest, NextResponse } from "next/server";
import { CreateMissionRequest } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** POST /api/dungeons/mission — buat latihan buatan user (P1-DUN-4):
 *  pilih persona + skill target + goal/sumber/acceptance → mission.yaml. */
export async function POST(req: NextRequest) {
  const input = CreateMissionRequest.parse(await req.json());
  try {
    const mission = getRuntime().createDungeonMission({
      personaId: input.personaId,
      title: input.title,
      goal: input.goal,
      skillName: input.skillName,
      skillDescription: input.skillDescription,
      resources: input.resources,
      acceptance: input.acceptance,
    });
    return NextResponse.json({ mission });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
