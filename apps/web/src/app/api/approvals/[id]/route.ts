import { NextRequest, NextResponse } from "next/server";
import { ApprovalDecisionRequest } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = ApprovalDecisionRequest.parse(await req.json());
  const ok = getRuntime().resolveApproval(id, body.approved, body.remember ?? false);
  if (!ok) return NextResponse.json({ error: "request tidak dikenal / sudah selesai" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
