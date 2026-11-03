import { NextRequest, NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

/** GET /api/mcp/audit?limit=50 — audit panggilan tool MCP (terbaru dulu). */
export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50, 200);
  return NextResponse.json({ entries: getRuntime().mcpAuditRecent(limit) });
}
