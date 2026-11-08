// P1-MDL-2: smoke test model, model harus MEMANGGIL tool (2 langkah tool-call),
// bukan sekadar balas teks; gagal → router markUnhealthy → fallback otomatis.
import { describe, expect, it } from "vitest";
import type { ProviderAdapter, ProviderChunk, ChatRequest, ProviderDone } from "../provider/adapter.js";
import { smokeModel } from "../provider/smoke.js";
import { buildModelRouter } from "../model-router.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Provider palsu, script per model: nama model menentukan perilaku. */
function fakeProvider(scripts: Record<string, (req: ChatRequest) => ProviderDone>): ProviderAdapter {
  return {
    id: "fake",
    chatStream: async (req) => scripts[req.model]!(req),
  };
}

const okDone: ProviderDone = {
  type: "done",
  finishReason: "tool_calls",
  text: "",
  toolCalls: [{ id: "c1", name: "ping_check", args: { v: 1 } }],
};
const textDone: ProviderDone = { type: "done", finishReason: "stop", text: "Baik, saya cek kesehatan.", toolCalls: [] };

describe("smokeModel (P1-MDL-2)", () => {
  it("lulus: model memanggil ping_check; schema dikirim sudah ternormalisasi (pelajaran GLM)", async () => {
    let seenSchema: unknown;
    const p = fakeProvider({
      good: (req) => {
        seenSchema = req.tools[0]!.parameters;
        return okDone;
      },
    });
    const r = await smokeModel(p, "good");
    expect(r.ok).toBe(true);
    expect(r.error).toBeNull();
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect((seenSchema as Record<string, unknown>)["type"]).toBeDefined(); // schema valid terkirim
  });

  it("gagal: model hanya balas teks (bukan tool-call) → ok=false + potongan teks di error", async () => {
    const p = fakeProvider({ chatty: () => textDone });
    const r = await smokeModel(p, "chatty");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("tidak memanggil ping_check");
    expect(r.error).toContain("Baik");
  });

  it("gagal rapi: provider throw / timeout abort → error terpotong, tidak reject", async () => {
    const p = fakeProvider({
      dead: () => {
        throw new Error("connection refused");
      },
    });
    const r = await smokeModel(p, "dead");
    expect(r).toMatchObject({ model: "dead", ok: false });
    expect(r.error).toContain("connection refused");
    const slow: ProviderAdapter = { id: "slow", chatStream: () => new Promise(() => undefined) };
    const t = await smokeModel(slow, "slow", 80); // timeout 80ms
    expect(t.ok).toBe(false);
    expect(t.error).toContain("timeout");
  });

  it("integrasi router: gagal smoke → markUnhealthy → route jatuh ke fallback; lulus → markHealthy pulihkan", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "yui-smk-")), "ovr.json");
    const router = buildModelRouter({ defaultModel: "primary", defaultFallback: "backup", personasDir: path.resolve("../../packages/personas"), overridesFile: file });
    expect(router.route("yui-coder")).toMatchObject({ model: "primary", fallback: "backup" });
    router.markUnhealthy("primary");
    expect(router.route("yui-coder").model).toBe("backup"); // cooldown → langsung fallback
    router.markHealthy("primary");
    expect(router.route("yui-coder").model).toBe("primary"); // pulih
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });
});
