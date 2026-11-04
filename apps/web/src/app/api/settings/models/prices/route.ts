import { NextRequest, NextResponse } from "next/server";
import { UpdateModelPriceRequest } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** GET /api/settings/models/prices — price book (indikator biaya, P1-MDL-3). */
export async function GET() {
  return NextResponse.json(getRuntime().getModelPrices());
}

/** PUT /api/settings/models/prices — upsert harga satu model (per 1 jt token). */
export async function PUT(req: NextRequest) {
  const body = UpdateModelPriceRequest.parse(await req.json());
  try {
    getRuntime().updateModelPrice(body.model, body.price);
    return NextResponse.json(getRuntime().getModelPrices());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
