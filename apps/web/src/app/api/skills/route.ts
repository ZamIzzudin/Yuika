import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRuntime } from "@/lib/runtime";

/** GET /api/skills — draf (perlu validasi) + skill siap pakai. */
export async function GET() {
  return NextResponse.json(getRuntime().listSkillsWithDrafts());
}

const DraftUpdate = z.object({ slug: z.string().min(1), name: z.string().min(3), description: z.string().min(10), body: z.string().min(20) });

/** PUT /api/skills — edit draf (validasi user sebelum terima). */
export async function PUT(req: NextRequest) {
  const body = DraftUpdate.parse(await req.json());
  try {
    getRuntime().updateSkillDraft(body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

/** POST /api/skills — terima draf ({slug}) → lint + pindah ke skill aktif. */
export async function POST(req: NextRequest) {
  const { slug } = (await req.json()) as { slug: string };
  try {
    return NextResponse.json(getRuntime().acceptSkillDraft(slug));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

/** DELETE /api/skills?slug= — tolak draf (hapus). */
export async function DELETE(req: NextRequest) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  try {
    getRuntime().rejectSkillDraft(slug);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
