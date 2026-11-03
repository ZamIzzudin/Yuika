import { NextRequest, NextResponse } from "next/server";
import { SetMcpTrustRequest } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** GET /api/mcp/servers — status trust + koneksi semua server MCP workspace. */
export async function GET() {
  return NextResponse.json({ servers: getRuntime().mcpServerStatuses() });
}

/** PUT /api/mcp/servers — set trust + deny list (connect/disconnect dinamis). */
export async function PUT(req: NextRequest) {
  const body = SetMcpTrustRequest.parse(await req.json());
  try {
    const entry = await getRuntime().setMcpTrust(body);
    return NextResponse.json({ entry });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
