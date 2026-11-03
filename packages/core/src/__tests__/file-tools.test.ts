// W2-A2 (TASKS.md): file tools + path safety — path escape WAJIB ditolak.
import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registry, resetRegistryForTests } from "../registry.js";
import { registerFileTools } from "../tools/file-tools.js";

const ctx = {
  sessionId: "s1",
  turnId: "t1",
  workspacePath: "",
  emit: () => {},
  requestApproval: async () => true,
};

function tool(name: string) {
  // ambil def lewat toolSchemas tak mungkin; dispatch langsung cukup untuk test
  return (args: Record<string, unknown>) => registry.dispatch(name, args, ctx);
}

describe("file tools — path safety", () => {
  beforeEach(() => {
    resetRegistryForTests();
    registerFileTools();
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "yui-files-"));
    fs.mkdirSync(path.join(ws, "sub"), { recursive: true });
    fs.writeFileSync(path.join(ws, "sub", "note.txt"), "isi");
    ctx.workspacePath = ws;
  });

  it("read/write roundtrip di dalam workspace", async () => {
    await tool("write_file")({ path: "reports/laporan.md", content: "# Halo" });
    const res = await tool("read_file")({ path: "reports/laporan.md" });
    expect(res.isError).toBeFalsy();
    if (!res.isError) expect((res.result as { content: string }).content).toBe("# Halo");
    const ls = await tool("list_files")({ dir: "reports" });
    if (!ls.isError) expect((ls.result as { entries: { name: string }[] }).entries[0]!.name).toBe("laporan.md");
  });

  it("path escape ../ DITOLAK", async () => {
    const res = await tool("read_file")({ path: "../../etc/passwd" });
    expect(res.isError).toBe(true);
    const res2 = await tool("write_file")({ path: "../escape.txt", content: "x" });
    expect(res2.isError).toBe(true);
  });

  it("absolute path DITOLAK (di luar workspace)", async () => {
    const outside = path.join(os.tmpdir(), "yui-outside.txt");
    const res = await tool("write_file")({ path: outside, content: "x" });
    expect(res.isError).toBe(true);
    expect(fs.existsSync(outside)).toBe(false);
  });

  it("prefix sibling DITOLAK: ws-evil bukan anak workspace", async () => {
    // regression: startsWithout-separator pernah meloloskan `D:\ws-evil` utk root `D:\ws`
    const ws = ctx.workspacePath;
    const sibling = ws.endsWith("-") ? `${ws}x` : `${ws}-evil`;
    fs.mkdirSync(sibling, { recursive: true });
    const res = await tool("write_file")({ path: path.relative(ws, path.join(sibling, "steal.txt")), content: "x" });
    expect(res.isError).toBe(true);
    expect(fs.existsSync(path.join(sibling, "steal.txt"))).toBe(false);
  });

  it("approval policy: null untuk reports/, alasan untuk di luar reports/", async () => {
    // kebijakan dibaca lewat dispatch dengan requestApproval yang MELEMPAR bila dipanggil
    let approvalAsked = false;
    const ctxAsk = { ...ctx, requestApproval: async () => { approvalAsked = true; return true; } };
    await registry.dispatch("write_file", { path: "reports/ok.md", content: "x" }, ctxAsk);
    expect(approvalAsked).toBe(false);
    await registry.dispatch("write_file", { path: "tmp/nope.md", content: "x" }, ctxAsk);
    expect(approvalAsked).toBe(true);
  });
});
