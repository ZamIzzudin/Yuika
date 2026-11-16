// G-ALPHA staging smoke (nyata): meta publik, api terkunci, SSO portal
// (login -> consent -> callback), buat project, satu turn persona kecil,
// jawaban masuk, lalu bersih-bersih (hapus project).
// WAJIB akun OWNER portal (studio single-owner; akun lain ditolak 403
// owner-lock). Tanpa STAGING_EMAIL/PASSWORD: skip.
// Jalankan: STAGING_URL=https://studio.notu.dev \
//   STAGING_EMAIL=… STAGING_PASSWORD=… \
//   npx playwright test -c playwright.staging.config.ts
import { expect, test } from "@playwright/test";

const EMAIL = process.env.STAGING_EMAIL ?? "";
const PASSWORD = process.env.STAGING_PASSWORD ?? "";

test("staging: health -> SSO -> project -> 1 turn -> cleanup", async ({ page, request }) => {
  test.skip(!EMAIL || !PASSWORD, "butuh STAGING_EMAIL/STAGING_PASSWORD (akun owner)");
  test.setTimeout(180_000);

  // ── 1. Health publik + api terkunci ────────────────────────────────
  const meta = await request.get("/api/meta");
  expect(meta.ok()).toBeTruthy();
  const m = (await meta.json()) as { version: string };
  expect(m.version).toBeTruthy();

  const locked = await request.get("/api/personas");
  expect(locked.status()).toBe(401); // 200 = auth mati = bahaya

  // ── 2. SSO via portal ──────────────────────────────────────────────
  await page.goto("/");

  // Dua wajah gerbang: kartu gate studio (tombol portal) ATAU sudah
  // ter-redirect ke login portal. Race keduanya, klik bila perlu.
  const email = EMAIL;
  const password = PASSWORD;
  const portalHeading = page.getByRole("heading", { name: "Sign in" });
  const gateBtn = page.getByRole("button", { name: "Sign in with Yuika Portal" });
  await Promise.race([
    portalHeading.waitFor({ timeout: 60_000 }),
    gateBtn.waitFor({ timeout: 60_000 }),
  ]);
  if (await gateBtn.isVisible().catch(() => false)) {
    await gateBtn.click();
  }
  await expect(portalHeading).toBeVisible({ timeout: 60_000 });

  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Your password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  // ── 3. Consent portal -> kembali ke studio ─────────────────────────
  await expect(page.getByRole("button", { name: "Accept", exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(`Sign out \\(${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) })).toBeVisible({ timeout: 60_000 });

  // ── 4. Project + satu turn persona (biaya kecil) ───────────────────
  const projectName = `Staging Smoke ${Date.now()}`;
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByPlaceholder("Project Name").fill(projectName);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  // Pierre (scholar): persona pelaksana, prompt satu jawaban pendek.
  await page.getByRole("button", { name: "Pierre Yui", exact: true }).click();
  await page.getByRole("button", { name: "Start Session" }).click();
  const composer = page.getByPlaceholder(/Describe a task/);
  await expect(composer).toBeVisible({ timeout: 60_000 });
  await composer.fill("Reply with exactly STAGING-OK and nothing else.");
  await page.keyboard.press("Enter");
  await expect(page.getByText("STAGING-OK").first()).toBeVisible({ timeout: 120_000 });

  // ── 5. Bersih-bersih: hapus project smoke ──────────────────────────
  await page.getByRole("button", { name: "Home, all projects" }).click();
  const trash = page.getByRole("button", { name: `Delete project ${projectName}` }).first();
  await trash.click({ force: true });
  const dlg = page.getByRole("dialog", { name: "Delete project" });
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Delete permanently" }).click();
  await expect(dlg).toBeHidden({ timeout: 30_000 });
});
