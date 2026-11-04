import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRuntime } from "@/lib/runtime";

/** POST /api/skills/eval — P1-DUN-3: eval buta skill `tested` → lulus = ready.
 *  Async (sesi hakim jalan di background); hasil di-polling field `eval`
 *  di GET /api/skills (verdict pending/pass/fail + alasan). */
export async function POST(req: NextRequest) {
  const { slug } = z.object({ slug: z.string().min(1) }).parse(await req.json());
  try {
    return NextResponse.json(getRuntime().evalSkill(slug));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
