// D49 lazy-config: API boleh boot tanpa provider (trio kosong). Turn baru
// ditolak dengan pesan jelas; updateProviderSettings mengisi + persist
// YUI_OPENAI_* (nama var = persis var boot — bug lama menulis YUI_BASE_URL
// yang diabaikan saat restart).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createYuiRuntime } from "../runtime.js";
import { resetRegistryForTests } from "../registry.js";

let dir: string;
let oldCwd: string;
const savedEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-lazy-"));
  // resolveRepoRoot jalan-naik cari turbo.json: chdir tmp berisi turbo.json
  // supaya updateProviderSettings menulis .env ke tmp, bukan repo asli.
  fs.writeFileSync(path.join(dir, "turbo.json"), "{}");
  oldCwd = process.cwd();
  for (const k of ["YUI_OPENAI_BASE_URL", "YUI_OPENAI_API_KEY", "YUI_MODEL", "YUI_PROVIDER_KIND"]) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  process.chdir(oldCwd);
  for (const k of ["YUI_OPENAI_BASE_URL", "YUI_OPENAI_API_KEY", "YUI_MODEL", "YUI_PROVIDER_KIND"]) {
    delete process.env[k];
  }
});

afterAll(() => {
  process.chdir(oldCwd);
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* sqlite lock di Windows: biarkan OS bersihkan */
  }
});

function makeRuntime() {
  return createYuiRuntime({
    provider: { baseUrl: "", apiKey: "", model: "" },
    paths: { workspacePath: dir, dbPath: path.join(dir, "t.db"), mcpConfigPath: null },
  });
}

describe("D49 lazy-config: boot tanpa provider", () => {
  it("runtime hidup; providerConfigured false; settings mencerminkan kosong", async () => {
    const rt = makeRuntime();
    try {
    expect(rt.providerConfigured()).toBe(false);
    const st = rt.getProviderSettings();
    expect(st.baseUrl).toBe("");
    expect(st.hasApiKey).toBe(false);
    expect(st.model).toBe("");
    } finally {
      await rt.dispose?.();
      resetRegistryForTests();
    }
  });

  it("runTurn tanpa provider -> event session.error dengan pesan jelas (bukan error provider mentah)", async () => {
    const rt = makeRuntime();
    try {
    const { sessionId } = rt.createSession("yui-coder", null);
    await rt.runTurn(sessionId, "halo");
    const events = rt.getEvents(sessionId);
    const err = events.find((e) => e.type === "session.error");
    expect(err).toBeDefined();
    expect((err as { message?: string }).message).toContain("Provider is not configured");
    } finally {
      await rt.dispose?.();
      resetRegistryForTests();
    }
  });

  it("updateProviderSettings mengisi trio + persist YUI_OPENAI_* ke .env root (nama var boot)", async () => {
    const rt = makeRuntime();
    try {
    process.chdir(dir);
    rt.updateProviderSettings({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-lazy-123",
      model: "test-model",
    });
    expect(rt.providerConfigured()).toBe(true);
    expect(rt.getProviderSettings().hasApiKey).toBe(true);
    expect(rt.getProviderSettings().keyPreview).toBe("…-123");
    const envTxt = fs.readFileSync(path.join(dir, ".env"), "utf8");
    expect(envTxt).toContain("YUI_OPENAI_BASE_URL=https://api.example.com/v1");
    expect(envTxt).toContain("YUI_OPENAI_API_KEY=sk-lazy-123");
    expect(envTxt).toContain("YUI_MODEL=test-model");
    // tidak menulis nama legacy (bug lama)
    expect(envTxt).not.toMatch(/^YUI_BASE_URL=/m);
    expect(envTxt).not.toMatch(/^YUI_API_KEY=/m);
    } finally {
      await rt.dispose?.();
      resetRegistryForTests();
    }
  });
});
