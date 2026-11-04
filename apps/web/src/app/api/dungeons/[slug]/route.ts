import { NextRequest, NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

/** DELETE /api/dungeons/[slug] — hapus latihan buatan user beserta foldernya. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    getRuntime().deleteDungeonMission(slug);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
