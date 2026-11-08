// /api/meta: version + self-host update indicator.
// Isolation: tmp YUI_AUTH_DB (auth suite pattern); fetch stubbed per case.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "yui-meta-"));
process.env.YUI_AUTH_DB = path.join(TMP, "auth.db");
process.env.YUI_META_CACHE_MS = "0"; // tanpa cache antar request test
process.env.YUI_RELEASES_API = "https://releases.test/latest";

const { buildApp } = await import("../app.js");
const { _resetMetaCacheForTests } = await import("../routes/meta.js");

const fake = { listPersonas: () => [] } as unknown as YuiRuntime;
let app: FastifyInstance;
const realFetch = globalThis.fetch;

beforeAll(() => {
  app = buildApp(fake);
});

afterAll(() => {
  _resetMetaCacheForTests();
  globalThis.fetch = realFetch;
  delete process.env.YUI_META_CACHE_MS;
  delete process.env.YUI_RELEASES_API;
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("GET /api/meta", () => {
  it("offline: latest null, updateAvailable false, versi lokal tetap terbaca", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    const r = await app.inject({ method: "GET", url: "/api/meta" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { version: string; latest: string | null; updateAvailable: boolean };
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(body.latest).toBeNull();
    expect(body.updateAvailable).toBe(false);
  });

  it("release lebih baru tersedia → updateAvailable true + URL release", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ tag_name: "v999.0.0", html_url: "https://github.com/x/y/releases/v999.0.0" }), { status: 200 }),
    ) as unknown as typeof fetch;
    const r = await app.inject({ method: "GET", url: "/api/meta" });
    const body = r.json() as { latest: string; updateAvailable: boolean; releaseUrl: string };
    expect(body.latest).toBe("v999.0.0");
    expect(body.updateAvailable).toBe(true);
    expect(body.releaseUrl).toContain("releases");
  });

  it("exempt gerbang: YUI_AUTH_REQUIRED=1 pun /api/meta tetap 200 (sebelum user ada)", async () => {
    process.env.YUI_AUTH_REQUIRED = "1";
    try {
      const r = await app.inject({ method: "GET", url: "/api/meta" });
      expect(r.statusCode).toBe(200);
    } finally {
      delete process.env.YUI_AUTH_REQUIRED;
    }
  });
});
