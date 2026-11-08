import { expect, test } from "@playwright/test";

// D44 dbg: latar antariksa Home — maskot & bintang render, tanpa pageerror.
test("dbg space home renders mascots & stars", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New project" })).toBeVisible();
  await page.waitForTimeout(1_500);
  const mascots = page.locator("[data-mascot]");
  const n = await mascots.count();
  // transform mesti terisi loop fisika (bukan opacity-0 mentah)
  const t = await mascots.first().getAttribute("style");
  console.log("mascots:", n, "| style:", (t ?? "").slice(0, 60));
  expect(n).toBeGreaterThan(0);
  await page.screenshot({ path: "e2e/.tmp/space-home.png" });
  if (errors.length) throw new Error("pageerror: " + errors.join(" | "));
});

// D47: onboarding desktop (welcome.html) di browser biasa — tanpa shell
// Tauri → fallback note + link ke app; kartu mode tak memicu apa pun.
test("dbg welcome.html fallback in plain browser", async ({ page }) => {
  await page.goto("/welcome.html");
  await expect(page.getByRole("heading", { name: "Welcome to Yuika" })).toBeVisible();
  await expect(page.getByText("Launch the Yuika desktop app")).toBeVisible();
  // plain mode: kartu disembunyikan, tak ada invode crash
  await expect(page.getByRole("button", { name: "On this device" })).toBeHidden();
});
