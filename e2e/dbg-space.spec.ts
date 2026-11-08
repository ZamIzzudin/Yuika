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

// Desktop onboarding (welcome.html) in a plain browser (no Tauri shell):
// fallback note + link to the app; the mode cards trigger nothing.
test("dbg welcome.html fallback in plain browser", async ({ page }) => {
  await page.goto("/welcome.html");
  await expect(page.getByRole("heading", { name: "Welcome to Yuika" })).toBeVisible();
  await expect(page.getByText("Launch the Yuika desktop app")).toBeVisible();
  // plain mode: kartu disembunyikan, tak ada invoke crash
  await expect(page.getByRole("button", { name: "On this device" })).toBeHidden();
  await page.screenshot({ path: "e2e/.tmp/welcome-plain.png" });
});

// Shell mode (window.__TAURI__ present): the mode cards appear; invoke
// is stubbed so clicks do not error. Guards the onboarding card layout.
test("dbg welcome.html shell mode shows mode cards", async ({ page }) => {
  await page.addInitScript(() => {
    window.__TAURI__ = { core: { invoke: async () => undefined } };
  });
  await page.goto("/welcome.html");
  await expect(
    page.getByRole("button", { name: "On this device" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect to a host" })).toBeVisible();
  await page.getByRole("button", { name: "Connect to a host" }).click();
  await expect(page.getByLabel(/Host URL/)).toBeVisible();
  await page.screenshot({ path: "e2e/.tmp/welcome-shell.png" });
});
