import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

/** GET /api/mcp/runtime — status uvx (server Python: git, time, sentry). */
export async function GET() {
  return NextResponse.json(await getRuntime().mcpUvxCheck());
}

/** POST /api/mcp/runtime — jalankan installer resmi uv (astral.sh).
 *  UI WAJIB konfirmasi eksplisit dulu: ini memasang tool di mesin user. */
export async function POST() {
  const r = await getRuntime().mcpInstallUv();
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
