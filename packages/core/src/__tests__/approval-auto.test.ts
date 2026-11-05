// Mode approval "auto" (fix dev-10 user: approval kedaluwarsa → turn terasa
// stuck; alur tulis+jalankan kode jadi tersendat). "auto" = write_file &
// run_command disetujui otomatis (event resolved tetap muncul — jujur &
// traceable); tool lain tetap minta kartu persetujuan.
import { describe, expect, it, afterEach } from "vitest";
import { ApprovalEngine, getApprovalMode, setApprovalMode, resolvePendingApproval } from "../approval/engine.js";
import type { EventDraft } from "@yuika/contracts";

afterEach(() => setApprovalMode("ask")); // jangan bocor ke test lain

describe("approval mode auto (mode cepat)", () => {
  it("write_file & run_command disetujui otomatis + event resolved jujur; tanpa pending", async () => {
    setApprovalMode("auto");
    expect(getApprovalMode()).toBe("auto");
    const events: EventDraft[] = [];
    const engine = new ApprovalEngine((d) => events.push(d));

    const a = engine.request("write_file", { path: "code/x.ts" }, "di luar direktori");
    const b = engine.request("run_command", { cmd: "npm test" }, "jalankan kode");
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    const resolved = events.filter((e) => e.type === "approval.resolved");
    expect(resolved.length).toBe(2);
    expect(engine.hasPending()).toBe(false); // tak ada kartu menggantung
  });

  it("tool di luar daftar cepat tetap minta persetujuan (MCP dsb.)", async () => {
    setApprovalMode("auto");
    let requestId = "";
    const engine = new ApprovalEngine((d) => {
      if (d.type === "approval.requested") requestId = d.requestId;
    });
    const p = engine.request("mcp__filesystem__delete", {}, "hapus file sistem");
    await new Promise((r) => setTimeout(r, 5));
    expect(requestId.startsWith("apr_")).toBe(true); // kartu tetap muncul
    expect(resolvePendingApproval(requestId, false)).toBe(true); // tolak → false
    expect(await p).toBe(false);
  });
});
