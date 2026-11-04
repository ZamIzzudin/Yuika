import { NextRequest, NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

/** GET → trace per turn sesi ini (P1-INF-4): langkah kronologis (model/tool/
 *  delegasi/approval/error) + token per turn dari ledger. UI: panel Trace. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(getRuntime().getTrace(id));
}
