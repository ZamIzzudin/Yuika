import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRuntime } from "@/lib/runtime";

/** POST /api/delegations/[id] — kontrol anak delegasi dari UI parent.
 *  - { action: "cancel" }        → abort turn anak (progres tersimpan, job interrupted)
 *  - { action: "steer", text }   → arahan mid-turn (di-drain loop anak awal iterasi berikutnya)
 *  - { action: "pause" }         → P1-DEL-3: anak berhenti di batas iterasi (parent ikut menunggu)
 *  - { action: "resume" }        → lanjut dari titik pause
 *  id = childSessionId. 404 bila anak sudah selesai (tak terdaftar). */
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("steer"), text: z.string().min(1).max(4_000) }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume") }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body — use {action:'cancel'|'steer'|'pause'|'resume'} (+text for steer)" },
      { status: 400 },
    );
  }
  const rt = getRuntime();
  const ok =
    parsed.data.action === "cancel"
      ? rt.cancelDelegation(id)
      : parsed.data.action === "steer"
        ? rt.steerDelegation(id, parsed.data.text)
        : parsed.data.action === "pause"
          ? rt.pauseDelegation(id)
          : rt.resumeDelegation(id);
  if (!ok) return NextResponse.json({ error: "delegation not active (may have finished)" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
