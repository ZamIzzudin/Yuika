// G-ALPHA staging smoke: JALAN DI STAGING NYATA (bukan stack lokal).
// Tanpa webServer - stack disediakan env. Self-skipping tanpa STAGING_URL.
// Jalankan:
//   STAGING_URL=https://studio.notu.dev \
//   STAGING_EMAIL=… STAGING_PASSWORD=… \
//   npx playwright test -c playwright.staging.config.ts
// Tanpa STAGING_EMAIL: mendaftarkan akun sekali-pakai di portal (register
// terbuka; rate limit per IP berlaku - untuk run rutin pakai akun khusus).
import { defineConfig } from "@playwright/test";

const url = process.env.STAGING_URL ?? "https://studio.notu.dev";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /staging\.spec\.ts/,
  timeout: 180_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: url,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
