import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

/** GET /api/settings/provider/smoke — hasil smoke terakhir (P1-MDL-2). */
export async function GET() {
  return NextResponse.json(getRuntime().getModelSmoke());
}

/** POST /api/settings/provider/smoke — jalankan smoke semua model aktif
 *  (default + fallback + route tiap persona); gagal → router fallback otomatis. */
export async function POST() {
  const results = await getRuntime().runModelSmoke();
  return NextResponse.json({ running: false, results });
}
