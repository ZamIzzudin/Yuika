import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRuntime } from "@/lib/runtime";

/** POST /api/delegations/[id] — P0-DEL-2: kontrol anak delegasi dari UI parent.
 *  - { action: "cancel" } → abort turn anak (progres tersimpan, job interrupted)
 *  - { action: "steer", text } → arahan mid-turn (di-drain loop anak awal iterasi berikutnya)
 *  id = childSessionId. 404 bila anak sudah selesai (tak terdaftar). */
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("steer"), text: z.string().min(1).max(4_000) }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "body tidak valid — {action:'cancel'} atau {action:'steer', text}" }, { status: 400 });
  }
  const rt = getRuntime();
  const ok =
    parsed.data.action === "cancel" ? rt.cancelDelegation(id) : rt.steerDelegation(id, parsed.data.text);
  if (!ok) return NextResponse.json({ error: "delegasi tidak aktif (mungkin sudah selesai)" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
