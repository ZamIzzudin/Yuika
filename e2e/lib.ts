// e2e helpers, (Home & Team Assembly).
// Freespace dihapus: alur standar kini HOME → kartu project → TeamSetup
// (playground assign) → Start Session (dropdown persona) dengan lead.
import type { Page } from "@playwright/test";

export const LEAD = "Maestro Yui"; // conductor (display name)

/** Buka project dari HOME lalu assign + mulai sesi pertama dengan LEAD. */
export async function openProjectWithLead(
  page: Page,
  projectName: string,
  persona: string = LEAD,
): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: projectName, exact: false }).first().click();
  await page.getByRole("button", { name: persona, exact: true }).click();
  await page.getByRole("button", { name: "Start Session" }).click();
}

/** Buka project dari HOME TANPA memulai sesi (mis. cukup assign persona). */
export async function openProject(page: Page, projectName: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: projectName, exact: false }).first().click();
}
