// GET /api/personas/growth — P1-PER-4: growth persona (level + statistik nyata).
import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";
import { PersonaGrowth } from "@yui/contracts";

export async function GET() {
  const growth = getRuntime().personaGrowth();
  return NextResponse.json(PersonaGrowth.array().parse(growth));
}
