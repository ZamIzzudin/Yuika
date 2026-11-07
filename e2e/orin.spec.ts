// Verifikasi visual Orin v8 — dijalankan manual (bukan bagian smoke CI):
//   npx playwright test e2e/orin.spec.ts
// Stack sama seperti smoke (mock :3299 · api :3291 · web :3990).
import { expect, test } from "@playwright/test";

test("Orin v8: orbit persona ter-render (bintang 1.18×)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://127.0.0.1:3990/");
  // layar awal tanpa sesi → orbit persona; tunggu maskot pusat muncul
  await page.waitForSelector("svg[aria-label='Maskot Orin']", { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "e2e/.tmp/orin-v8-orbit.png", fullPage: false });
  // katalog 15 bentuk kini ada di page Persona (card identitas) — cukup orbit
  const thumbs = await page.locator("svg[viewBox='-165 -165 330 330']").count();
  console.log("thumbnails:", thumbs, "| pageerrors:", errors.length ? errors : "none");
  if (thumbs < 8) throw new Error(`orbit harus ≥8 maskot, dapat ${thumbs}`);
  if (errors.length) throw new Error("pageerror: " + errors.join(" | "));
});

// FIX 2026-11 (NaN translate): portret di kolom chat tersembunyi (satu tab =
// satu halaman) punya rect 0 → pointermove clientX 0 → mx = 0/0 = NaN →
// menempel permanen di smx → spam console "translate(NaN …)" tiap frame.
test("Orin: pointer di atas portret tersembunyi tak menghasilkan NaN console", async ({
  page,
  request,
}) => {
  const API = "http://127.0.0.1:3291";
  const name = `Orin NaN ${Date.now()}`;
  await request.post(`${API}/api/projects`, { data: { name, description: "nan-guard" } });

  const consoleErrs: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrs.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => consoleErrs.push("PAGEERROR " + String(e).slice(0, 200)));

  await page.goto("http://127.0.0.1:3990/");
  await page.getByRole("button", { name, exact: false }).first().click();
  await expect(page.getByRole("tab", { name: "Team" })).toBeVisible({ timeout: 15_000 });

  // sembunyikan kolom chat (tab Team) lalu tembak pointermove clientX=0
  await page.getByRole("tab", { name: "Team" }).click();
  await page.evaluate(() => {
    for (const y of [60, 120, 300])
      window.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 0, clientY: y, bubbles: true }),
      );
  });
  await page.waitForTimeout(1_200);

  // kembali ke chat — animasi jalan lagi; tidak boleh ada error console sama sekali
  await page.getByRole("tab", { name: "Chat" }).click();
  await page.waitForTimeout(1_500);
  expect(consoleErrs).toEqual([]);
});
