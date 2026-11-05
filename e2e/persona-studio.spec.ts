// Verifikasi menu Persona (character studio) — dijalankan manual:
//   npx playwright test e2e/persona-studio.spec.ts
// Stack sama seperti smoke (mock :3299 · api :3291 · web :3990).
import { expect, test } from "@playwright/test";

test("Persona Studio: roster, ganti wujud (persist), skill loadout, missions", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://127.0.0.1:3990/");
  await page.getByRole("button", { name: "Persona", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: /Persona/ })).toBeVisible();

  // 1) Roster + preview maskot hidup + emote
  await expect(page.getByText("Roster", { exact: true })).toBeVisible();
  await expect(page.locator("svg[aria-label='Maskot Orin']").first()).toBeVisible();
  await page.getByRole("button", { name: "Rayakan" }).click(); // emote switch
  await page.waitForTimeout(400);

  // 2) Ganti wujud: persona pertama (default orb) → Awan → PUT persist + tombol aktif pindah
  const putDone = page
    .waitForResponse((r) => r.url().includes("/api/personas/shapes") && r.request().method() === "PUT" && r.ok())
    .catch(() => null);
  await page.locator("button[title^='Jadikan wujud']").filter({ hasText: "Awan" }).click();
  expect(await putDone, "PUT /api/personas/shapes harus 200").not.toBeNull();
  await expect(page.locator("button[title^='Jadikan wujud']").filter({ hasText: "Awan" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("custom", { exact: true }).first()).toBeVisible();

  // 3) Kembali ke default (orb) agar test idempoten
  await page.locator("button[title^='Jadikan wujud']").filter({ hasText: "Bola" }).click();
  await page.waitForTimeout(300);

  // 4) Skill loadout: pasang skill pertama yang tersedia
  const attach = page.getByRole("button", { name: "Pasang", exact: true }).first();
  if (await attach.count()) {
    await attach.click();
    await expect(page.getByRole("button", { name: /Terpasang/ }).first()).toBeVisible({ timeout: 8000 });
  }

  await page.screenshot({ path: "e2e/.tmp/persona-studio.png", fullPage: true });

  // 5) Tab Missions + history render tanpa error
  await page.getByRole("tab", { name: "Missions" }).click();
  await expect(page.getByRole("button", { name: /Misi baru/ })).toBeVisible();
  await page.getByRole("tab", { name: /Training history/ }).click();
  await page.waitForTimeout(300);

  if (errors.length) throw new Error("pageerror: " + errors.join(" | "));
});
