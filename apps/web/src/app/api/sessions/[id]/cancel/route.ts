import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

/** POST /api/sessions/:id/cancel — tombol Stop (P0-CORE-1).
 *  Abort HTTP provider + loop; progres tersimpan, turn berakhir graceful. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return NextResponse.json({ cancelled: getRuntime().cancelTurn(id) });
}
