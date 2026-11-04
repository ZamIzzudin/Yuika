// Dev quirk (bug user dev-10: klik "Setujui" → 404 "sudah selesai" padahal
// kartu baru muncul): Next.js dev membundel @yui/core per route — route
// POST /api/approvals/:id memegang copy modul SENDIRI. pendingEngines yang
// module-local berarti map kosong di copy route → resolve gagal 404.
// Map HARUS di-cache di globalThis (pola yang sama dengan bus emitter).
import { describe, expect, it, vi } from "vitest";
import { ApprovalEngine } from "../approval/engine.js";

describe("pendingEngines tahan module re-eval (fix approval 404)", () => {
  it("approval didaftarkan instance A → resolve lewat copy modul B tetap BERHASIL", async () => {
    // Instance A (route sesi/runTurn) meminta approval out-of-workspace.
    let requestId = "";
    const engineA = new ApprovalEngine((d) => {
      if (d.type === "approval.requested") requestId = (d as { requestId: string }).requestId;
    });
    const pending = engineA.request("write_file", { path: "outside/x.txt" }, "menulis di luar code|docs|reports");
    await new Promise((r) => setTimeout(r, 5)); // emit sinkron, tapi beri jeda event loop
    expect(requestId.startsWith("apr_")).toBe(true);

    // Simulasi HMR / copy modul route approvals: modul dievaluasi ulang.
    vi.resetModules();
    const { resolvePendingApproval: resolveB } = await import("../approval/engine.js");
    // Sebelum fix: map B kosong → false (→ 404 di UI). Sesudah: shared globalThis.
    expect(resolveB(requestId, true, true)).toBe(true);
    expect(await pending).toBe(true); // tool anak lanjut — turn tidak menggantung
  });

  it("cache map ada di globalThis (kontrak fix)", () => {
    expect((globalThis as { __yuiPendingApprovalEngines?: Map<string, unknown> }).__yuiPendingApprovalEngines).toBeDefined();
  });
});
