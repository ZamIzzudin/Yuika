import { NextRequest, NextResponse } from "next/server";
import { UpdateBudgetRequest } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** GET  → status saldo/budget (CRED-4 UI: spent today/total, burn-rate, holds, limit-hit).
 *  PUT  → update budget/limit (CRED-2/3): mode warn|block, dailyLimit, totalLimit,
 *          maxTurnsPerMinute, maxDelegationConcurrency. */
export async function GET() {
  return NextResponse.json(getRuntime().getBudgetStatus());
}

export async function PUT(req: NextRequest) {
  const body = UpdateBudgetRequest.parse(await req.json());
  return NextResponse.json(getRuntime().updateBudget(body));
}
