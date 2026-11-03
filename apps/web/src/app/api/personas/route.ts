import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

export async function GET() {
  return NextResponse.json({ personas: getRuntime().listPersonas() });
}
