// Verifikasi menu Persona (character studio) — dijalankan manual:
//   npx playwright test e2e/persona-studio.spec.ts
// Stack sama seperti smoke (mock :3299 · api :3291 · web :3990).
import { expect, test } from "@playwright/test";

test("Persona Studio: carousel + gallery, shape switch (persist), skills, missions", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://127.0.0.1:3990/");
  await page.getByRole("button", { name: "Persona", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: /Persona/ })).toBeVisible();

  // 1) Stage 3 kolom: detail kiri · maskot + chevron tengah · galeri bawah
  await expect(page.getByRole("button", { name: "Next persona" })).toBeVisible();
  await expect(page.locator("svg[aria-label='Maskot Orin']").first()).toBeVisible();

  // 2) Carousel: chevron next → persona berganti (nama kartu kiri berubah) + pop-in
  const first = await page.locator("h2.text-display").first().innerText();
  await page.getByRole("button", { name: "Next persona" }).click();
  await expect(page.locator("h2.text-display")).not.toHaveText(first);
  // galeri: kartu terpilih ikut berganti (aria-selected)
  await expect(page.getByRole("option").filter({ hasText: first })).not.toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Previous persona" }).click();
  await expect(page.locator("h2.text-display")).toHaveText(first);

  // 3) Emote switch
  await page.getByRole("button", { name: "Party", exact: true }).click();
  await page.waitForTimeout(400);

  // 4) Shape tab: ganti ke Cloud → PUT persist + tombol aktif pindah + chip custom
  const putDone = page
    .waitForResponse((r) => r.url().includes("/api/personas/shapes") && r.request().method() === "PUT" && r.ok())
    .catch(() => null);
  await page.locator("button[title^=\"Set \"]").filter({ hasText: "Cloud" }).click();
  expect(await putDone, "PUT /api/personas/shapes harus 200").not.toBeNull();
  await expect(page.locator("button[title^=\"Set \"]").filter({ hasText: "Cloud" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("custom shape", { exact: true }).first()).toBeVisible();

  // kembali ke default (Ball) agar test idempoten
  await page.locator("button[title^=\"Set \"]").filter({ hasText: "Ball" }).click();
  await page.waitForTimeout(300);

  // 5) Skills tab: equip skill pertama yang tersedia
  await page.getByRole("tab", { name: /Skills/ }).click();
  const equip = page.getByRole("button", { name: "Equip", exact: true }).first();
  if (await equip.count()) {
    await equip.click();
    await expect(page.getByRole("button", { name: "✓" }).first()).toBeVisible({ timeout: 8000 });
  }

  await page.screenshot({ path: "e2e/.tmp/persona-studio.png", fullPage: true });

  // 6) Tab Missions + history render tanpa error
  await page.getByRole("tab", { name: "Missions" }).click();
  await expect(page.getByRole("button", { name: /New mission/ })).toBeVisible();
  await page.getByRole("tab", { name: /Training history/ }).click();
  await page.waitForTimeout(300);

  if (errors.length) throw new Error("pageerror: " + errors.join(" | "));
});
