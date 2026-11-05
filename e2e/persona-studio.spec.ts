// Verifikasi menu Persona → CharacterStage (character-select screen) — manual:
//   npx playwright test e2e/persona-studio.spec.ts
// Stack sama seperti smoke (mock :3299 · api :3291 · web :3990).
import { expect, test } from "@playwright/test";

test("CharacterStage: constellation stage, carousel, gallery, shape, skills, missions", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://127.0.0.1:3990/");
  await page.getByRole("button", { name: "Persona", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: /Persona/ })).toBeVisible();

  // 1) Panggung: konstelasi (svg aria-hidden besar) + maskot hero + chevron
  await expect(page.getByRole("button", { name: "Next persona" })).toBeVisible();
  await expect(page.locator("svg[aria-label='Maskot Orin']").first()).toBeVisible();
  expect(await page.locator("svg[aria-hidden] circle").count()).toBeGreaterThan(10);

  // 2) Carousel loop: next → nama berubah & galeri ikut terpilih; prev → kembali
  const first = await page.locator("h2.tracking-tight").first().innerText();
  await page.getByRole("button", { name: "Next persona" }).click();
  await expect(page.locator("h2.tracking-tight")).not.toHaveText(first);
  await expect(page.getByRole("option", { name: first, exact: true })).not.toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Previous persona" }).click();
  await expect(page.locator("h2.tracking-tight")).toHaveText(first);

  // 3) Emote + greet
  await page.getByRole("button", { name: "Party", exact: true }).click();
  await page.getByRole("button", { name: /^Greet / }).click();
  await expect(page.getByText(/Hi, I’m /)).toBeVisible();

  // 4) Ganti wujud → PUT persist + tile aktif (aria-pressed) pindah ke cloud
  const putDone = page
    .waitForResponse((r) => r.url().includes("/api/personas/shapes") && r.request().method() === "PUT" && r.ok())
    .catch(() => null);
  await page.locator('[data-shape-tile="cloud"]').click();
  expect(await putDone, "PUT /api/personas/shapes harus 200").not.toBeNull();
  await expect(page.locator('[data-shape-tile="cloud"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-shape-tile="orb"]').click(); // kembali default — idempoten
  await page.waitForTimeout(250);

  // 5) Skill loadout ala game: slot penuh → flash pesan; belum → attach/detach
  const slots = page.locator('[data-slot][aria-label^="Unequip"]');
  const tile = page.locator('[data-skill-tile][aria-pressed="false"]').first();
  if (await tile.count()) {
    const before = await slots.count();
    if (before >= 3) {
      await tile.click();
      await expect(page.getByText("Slots full — unequip one skill first.")).toBeVisible();
    } else {
      await tile.click();
      await expect(slots).toHaveCount(before + 1, { timeout: 8000 });
      await tile.hover(); // strip detail menampilkan nama + bonus skill
      await slots.last().click(); // lepas
      await expect(slots).toHaveCount(before, { timeout: 8000 });
    }
  }

  // 6) Dock galeri: counter + pilih via thumbnail
  await expect(page.getByText(/· ← → to switch/)).toBeVisible();
  await page.getByRole("option").nth(2).click();
  await expect(page.getByRole("option").nth(2)).toHaveAttribute("aria-selected", "true");

  await page.screenshot({ path: "e2e/.tmp/persona-studio.png", fullPage: true });

  // 7) Tab Missions + history tetap render tanpa error
  await page.getByRole("tab", { name: "Missions" }).click();
  await expect(page.getByRole("button", { name: /New mission/ })).toBeVisible();
  await page.getByRole("tab", { name: /Training history/ }).click();
  await page.waitForTimeout(300);

  if (errors.length) throw new Error("pageerror: " + errors.join(" | "));
});
