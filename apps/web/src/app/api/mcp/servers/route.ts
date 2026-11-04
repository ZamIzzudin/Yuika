import { NextRequest, NextResponse } from "next/server";
import { SetMcpTrustRequest } from "@yui/contracts";
import { z } from "zod";
import { getRuntime } from "@/lib/runtime";

/** GET /api/mcp/servers — status trust + koneksi semua server MCP workspace. */
export async function GET() {
  return NextResponse.json({ servers: getRuntime().mcpServerStatuses() });
}

/** POST /api/mcp/servers — P0-MCP-1: hubungkan ulang server (parked/reconnecting)
 *  sekarang juga, tanpa menunggu backoff. */
export async function POST(req: NextRequest) {
  const { server } = z.object({ server: z.string().min(1) }).parse(await req.json());
  try {
    await getRuntime().mcpRetryConnect(server);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
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
