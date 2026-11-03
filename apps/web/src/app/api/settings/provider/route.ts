import { NextRequest, NextResponse } from "next/server";
import { UpdateProviderSettingsRequest } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** GET /api/settings/provider — config aktif (key disamarkan). */
export async function GET() {
  return NextResponse.json(getRuntime().getProviderSettings());
}

/** PUT /api/settings/provider — swap panas + persist ke .env (apiKey kosong = keep). */
export async function PUT(req: NextRequest) {
  const body = UpdateProviderSettingsRequest.parse(await req.json());
  try {
    return NextResponse.json(getRuntime().updateProviderSettings(body));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
