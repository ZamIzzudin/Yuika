import { NextRequest, NextResponse } from "next/server";
import { ApprovalModeSetting } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** GET/PUT mode approval (fix dev-10): "auto" = write_file & run_command
 *  disetujui otomatis (mode cepat); "ask" = kartu persetujuan (default). */
export async function GET() {
  return NextResponse.json({ mode: getRuntime().approvalMode() });
}

export async function PUT(req: NextRequest) {
  const body = ApprovalModeSetting.safeParse((await req.json()).mode);
  if (!body.success) {
    return NextResponse.json({ error: "mode harus 'ask' atau 'auto'" }, { status: 400 });
  }
  getRuntime().setApprovalMode(body.data);
  return NextResponse.json({ mode: body.data });
}
