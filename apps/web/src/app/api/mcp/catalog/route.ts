import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

/** GET /api/mcp/catalog — katalog kurasi server MCP (P1-MCP-1). */
export async function GET() {
  return NextResponse.json({ catalog: getRuntime().mcpCatalog() });
}
