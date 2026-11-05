// Verifikasi visual Orin v8 — dijalankan manual (bukan bagian smoke CI):
//   npx playwright test e2e/orin.spec.ts
// Stack sama seperti smoke (mock :3299 · api :3291 · web :3990).
import { test } from "@playwright/test";

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
