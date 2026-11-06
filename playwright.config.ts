// P0-QA-1 — Playwright config: smoke E2E skenario demo §2.
// Tiga server dikelola Playwright: mock provider (:3299) → api (:3291) → web (:3990).
// Port & data terisolasi dari dev (3000/3211) — tidak bentrok dengan sesi dev user.
import { defineConfig } from "@playwright/test";
import path from "node:path";

const MOCK_PORT = 3299;
const API_PORT = 3291;
const WEB_PORT = 3990;
const DOUBLE_PORT = 3110; // P1-PRT-6: claim stub + SpecRelay (portal double)

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  // satu worker: mock provider & api memakai DB single-file + state global —
  // paralelisme antar file belum aman (dan smoke memang serial).
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node e2e/mock-provider.mjs",
      url: `http://127.0.0.1:${MOCK_PORT}/__health`,
      reuseExistingServer: true,
      timeout: 20_000,
    },
    {
      // Wipe auth.db & portal-device.db lama sebelum server start (gate & host
      // pairing e2e perlu state bersih).
      command:
        "node -e \"['auth.db','auth.db-wal','auth.db-shm','portal-device.db','portal-device.db-wal','portal-device.db-shm'].forEach(f=>require('fs').rmSync('e2e/.tmp/'+f,{force:true}))\" && npx tsx apps/api/src/server.ts",
      url: `http://127.0.0.1:${API_PORT}/api/personas`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        YUI_OPENAI_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/v1`,
        YUI_OPENAI_API_KEY: "e2e-mock-key",
        YUI_MODEL: "mock-model",
        YUI_API_PORT: String(API_PORT),
        YUI_API_HOST: "127.0.0.1",
        YUI_DB_PATH: "e2e/.tmp/e2e.db",
        YUI_AUTH_DB: "e2e/.tmp/auth.db",
        YUI_WORKSPACE_DIR: "e2e/.tmp/ws",
        // MCP & learn dimatikan: turn provider deterministik (nudge = panggilan ekstra).
        YUI_MCP_CONFIG: "",
        YUI_LEARN: "0",
        YUI_TRACE: "0",
        YUI_LOG_LEVEL: "warn",
        YUI_PORTAL_DEVICE_DB: "e2e/.tmp/portal-device.db",
        // Batch 2: shell terminal deterministik (fixture echo-shell — ECHO:<line>).
        YUI_TERMINAL_MODE: "local",
        YUI_TERMINAL_CMD: `node ${path.resolve("packages/core/src/terminal/__fixture__/echo-shell.mjs")}`,
      },
    },
    {
      // P1-PRT-6 — double portal: claim stub :3110 + SpecRelay ws://3111
      // (semantik SPEC-PROTOCOL v1; relay produksi = repo yuika-portal).
      command: "npx tsx e2e/portal-double.mts",
      url: `http://127.0.0.1:${DOUBLE_PORT}/healthz`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORTAL_DOUBLE_PORT: String(DOUBLE_PORT),
        PORTAL_DOUBLE_RELAY_PORT: "3111",
      },
    },
    {
      command: "npx next dev -p " + WEB_PORT,
      cwd: "apps/web",
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        NEXT_PUBLIC_API_BASE: `http://127.0.0.1:${API_PORT}`,
        NEXT_DIST_DIR: ".next-e2e",
      },
    },
  ],
});
