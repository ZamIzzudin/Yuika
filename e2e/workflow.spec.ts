// P2-FLOW-5 — board workflow E2E: start run (template 7 fase) → kolom fase &
// kartu step live → gerbang approve (×6) → run done, fase Deliverable hijau.
// Provider = mock lokal (fallback "ok" — tiap step selesai instan).
import { expect, test } from "@playwright/test";

const API = "http://127.0.0.1:3291";

test("FLOW-5: start → board live → gate approve ×6 → done", async ({ page, request }) => {
  test.setTimeout(120_000);

  // project segre untuk spec ini (nama unik → aman paralel/ulang)
  const name = `Flow E2E ${Date.now()}`;
  const r = await request.post(`${API}/api/projects`, { data: { name, description: "workflow board e2e" } });
  expect(r.ok()).toBeTruthy();
  const { project } = (await r.json()) as { project: { id: string } };

  // UI: buka app → pilih project → tab Flow
  await page.goto("/");
  const board = page.getByLabel("Workflow board");
  await page.getByRole("button", { name, exact: false }).first().click();
  await page.getByRole("tab", { name: "Flow" }).click(); // TabPills role=tab

  // start run (template default; brief opsional diisi agar terlihat di UI)
  await page.getByLabel("Run brief").fill("Build a small landing page from scratch.");
  await page.getByRole("button", { name: "Start run" }).click();

  // kolom fase muncul + status running
  await expect(page.locator('[data-phase="planning"]')).toBeVisible({ timeout: 20_000 });
  await expect(board.getByText("running", { exact: true })).toBeVisible({ timeout: 20_000 });

  // 6 gerbang (planning..docs; deliverable gate off) — approve satu-satu
  for (let i = 0; i < 6; i++) {
    const approve = page.getByRole("button", { name: "Approve" });
    await expect(approve).toBeVisible({ timeout: 30_000 });
    await approve.click();
  }

  // run done: chip status + semua kartu step Deliverable selesai (check icon)
  await expect(board.getByText("done", { exact: true })).toBeVisible({ timeout: 60_000 });
  const deliverable = page.locator('[data-phase="deliverable"]');
  await expect(deliverable.locator('[aria-label="done"]').first()).toBeVisible({ timeout: 30_000 });
});
