// W2-A2 : file tools + path safety, path escape WAJIB ditolak.
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

describe("file tools, path safety", () => {
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

  it("routing artefak kode: .html di reports/ → mendarat di code/ (fix test user)", async () => {
    const r = await tool("write_file")({ path: "reports/florist-landing/index.html", content: "<h1>hi</h1>" });
    expect(r.isError).toBeFalsy();
    const out = r.result as { path: string; redirectedFrom?: string; note?: string };
    expect(out.path).toBe("code/florist-landing/index.html");
    expect(out.redirectedFrom).toBe("reports/florist-landing/index.html");
    // file fisik ada di code/, bukan reports/
    expect(fs.existsSync(path.join(ctx.workspacePath, "code", "florist-landing", "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(ctx.workspacePath, "reports", "florist-landing"))).toBe(false);
  });

  it("routing tidak menyentuh laporan markdown di reports/", async () => {
    const r = await tool("write_file")({ path: "reports/design-notes.md", content: "ok" });
    const out = r.result as { path: string; redirectedFrom?: string };
    expect(out.path).toBe("reports/design-notes.md");
    expect(out.redirectedFrom).toBeUndefined();
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

describe("file tools, isolasi project ()", () => {
  beforeEach(() => {
    resetRegistryForTests();
    registerFileTools();
  });

  it("project A TIDAK bisa baca/tulis path project B via ../", async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "yui-workspace-"));
    const rootA = path.join(ws, "projects", "p_a");
    const rootB = path.join(ws, "projects", "p_b");
    for (const r of [rootA, rootB]) fs.mkdirSync(path.join(r, "reports"), { recursive: true });
    fs.writeFileSync(path.join(rootB, "reports", "secret.txt"), "rahasia B");

    ctx.workspacePath = rootA; // sesi melekat ke project A
    const rel = path.join("..", "p_b", "reports", "secret.txt");
    const read = await tool("read_file")({ path: rel });
    expect(read.isError).toBe(true); // safeResolve menolak keluar root project A

    const write = await tool("write_file")({ path: path.join("..", "p_b", "reports", "steal.txt"), content: "x" });
    expect(write.isError).toBe(true);
    expect(fs.existsSync(path.join(rootB, "reports", "steal.txt"))).toBe(false);

    // di dalam root project A sendiri tetap lancar (path relatif terhadap root project)
    const ok = await tool("write_file")({ path: "reports/a.md", content: "isi A" });
    expect(ok.isError).toBeFalsy();
    expect(fs.existsSync(path.join(rootA, "reports", "a.md"))).toBe(true);
  });
});
