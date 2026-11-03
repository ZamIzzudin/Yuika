import { NextRequest, NextResponse } from "next/server";
import { InstallMcpRequest } from "@yui/contracts";
import { getRuntime } from "@/lib/runtime";

/** POST /api/mcp/install — pasang server dari katalog ke mcp.json (P1-MCP-1).
 *  Tidak auto-connect: fail-closed, user harus Trust setelah ini. */
export async function POST(req: NextRequest) {
  const body = InstallMcpRequest.parse(await req.json());
  try {
    const result = getRuntime().installMcpServer(body.catalogId, body.env);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

/** DELETE /api/mcp/install?name=… — lepas server (disconnect + hapus deklarasi). */
export async function DELETE(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ error: "parameter name wajib" }, { status: 400 });
  try {
    return NextResponse.json(await getRuntime().uninstallMcpServer(name));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
