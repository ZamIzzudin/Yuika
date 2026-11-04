import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRuntime } from "@/lib/runtime";

/** GET — payload mapping skill↔persona (menu Dungeon tab "Mapping Skill"):
 *  skills siap-attach (ready/tested) + persona (bundled/attached/detached/effective). */
export async function GET() {
  return NextResponse.json(getRuntime().getSkillBindings());
}

const Body = z.object({
  personaId: z.string().min(1),
  skill: z.string().min(1),
  action: z.enum(["attach", "detach"]),
});

/** PUT — toggle satu skill untuk satu persona (persist skill-bindings.json). */
export async function PUT(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "body: {personaId, skill, action: attach|detach}" }, { status: 400 });
  }
  try {
    const binding = getRuntime().setSkillBinding(parsed.data.personaId, parsed.data.skill, parsed.data.action);
    return NextResponse.json({ ok: true, binding });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "gagal menyimpan binding" }, { status: 404 });
  }
}
