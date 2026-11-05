import { expect, test } from "@playwright/test";

/**
 * P1-PER-3 — runtime Rive + fallback permanen.
 * 1. /dev/rive default (orin.riv belum ada → HEAD 404): status "missing",
 *    fallback SVG Orin tampil (perilaku produk hari ini TIDAK berubah).
 * 2. Pilih sample.riv (aset contoh umum, tanpa state machine "Mascot"):
 *    canvas termuat (runtime wasm hidup) + panel kontrak melaporkan input
 *    mood/shape/… hilang — QA artist bekerja.
 * 3. Halaman utama: portrait persona tetap SVG sampai artist drop orin.riv.
 */
test.describe("Rive runtime (P1-PER-3)", () => {
  test("QA page: missing asset → fallback SVG + status missing", async ({ page }) => {
    await page.goto("/dev/rive");
    await expect(page.getByRole("heading", { name: "Rive asset QA" })).toBeVisible();
    await expect(page.getByText("Load: missing")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("svg[aria-label='Maskot Orin']")).toBeVisible();
    await expect(page.getByText("Fallback SVG (asset missing)")).toBeVisible();
  });

  test("QA page: sample.riv loads → canvas + contract report", async ({ page }) => {
    await page.goto("/dev/rive");
    await page.getByRole("button", { name: "sample.riv" }).click();
    await expect(page.locator(".rive-wrap canvas")).toBeVisible({ timeout: 30_000 });
    // sample.riv bukan aset kontrak — panel HARUS menandai input yang absen
    await expect(page.getByText(/Contract missing: .*mood/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Load: ok")).toBeVisible();
  });

  test("main page: portrait stays SVG fallback until orin.riv exists", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("svg[aria-label='Maskot Orin']").first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
