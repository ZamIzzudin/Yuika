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

test("FLOW-6: steer + reassign + pause/resume mid-run", async ({ page, request }) => {
  test.setTimeout(120_000);

  const name = `Steer E2E ${Date.now()}`;
  const r = await request.post(`${API}/api/projects`, { data: { name, description: "steering e2e" } });
  expect(r.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByRole("button", { name, exact: false }).first().click();
  await page.getByRole("tab", { name: "Flow" }).click();
  const board = page.getByLabel("Workflow board");
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(page.getByRole("button", { name: "Approve" })).toBeVisible({ timeout: 30_000 }); // gate planning

  // 1) steer mid-run — instruksi masuk, input ter-clear
  const steer = page.getByLabel("Steer instruction");
  await steer.fill("Keep the scope minimal for v1.");
  await page.getByRole("button", { name: "Steer", exact: true }).click();
  await expect(steer).toHaveValue("");

  // 2) reassign step pending fase research → analyst (kartu tampil persona baru)
  const research = page.locator('[data-phase="research"]');
  await expect(research).toBeVisible();
  await research.getByLabel("Reassign tech-notes").selectOption("yui-analyst");
  await expect(
    research.locator('[data-step="tech-notes"] [title="yui-analyst"]'),
  ).toBeVisible({ timeout: 10_000 });

  // 3) pause saat gate → status paused LANGSUNG (eksekusi berhenti) → approve
  //    gate sambil paused → tetap paused → resume → lanjut fase berikut
  const pauseResp = page.waitForResponse((r) => r.url().includes("/pause"));
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await pauseResp;
  await expect(board.getByText("paused", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.waitForTimeout(800); // gerbang di-approve saat paused — harus TETAP paused
  await expect(board.getByText("paused", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0); // banner gate hilang (diputuskan)
  await page.getByRole("button", { name: "Resume", exact: true }).click();

  // 4) gerbang sisanya (research..docs ×5) → done
  for (let i = 0; i < 5; i++) {
    const approve = page.getByRole("button", { name: "Approve", exact: true });
    await expect(approve).toBeVisible({ timeout: 30_000 });
    await approve.click();
  }
  await expect(board.getByText("done", { exact: true })).toBeVisible({ timeout: 60_000 });
});
