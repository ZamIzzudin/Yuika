import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { getRuntime } from "@/lib/runtime";

// POST /api/dungeons/[slug]/materials?name=<filename>  body = raw file bytes
// Bahan ajar user untuk latihan (P1-DUN-4) — disimpan <dungeon>/materials/,
// otomatis tercatat sebagai sumber belajar misi. Mirror sanitasi upload proyek.
const MAX = 10 * 1024 * 1024;
const OK_EXT = new Set([".pdf", ".xlsx", ".xls", ".csv", ".md", ".txt", ".json", ".html", ".htm", ".xml", ".yaml", ".yml"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const name = (new URL(req.url).searchParams.get("name") ?? "").replace(/[\\/:*?"<>|]/g, "_").trim();
    if (!name || name.includes("..")) return NextResponse.json({ error: "nama file tidak valid" }, { status: 400 });
    const ext = path.extname(name).toLowerCase();
    if (!OK_EXT.has(ext)) return NextResponse.json({ error: `format ${ext || "?"} tidak didukung (pdf/xlsx/xls/csv/md/txt/json/html/yaml)` }, { status: 400 });
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length === 0) return NextResponse.json({ error: "file kosong" }, { status: 400 });
    if (buf.length > MAX) return NextResponse.json({ error: "maks 10 MB" }, { status: 400 });
    const rel = getRuntime().writeDungeonMaterial(slug, name, buf);
    return NextResponse.json({ path: rel, bytes: buf.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
