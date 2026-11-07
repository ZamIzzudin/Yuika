// P2-FLOW-5/6 e2e — SATU COMPOSER (keputusan user 2026-11-08 tahap 2):
// toggle Workflow Mode (sejajar Hardcore Mode) ON → pesan chat = brief run;
// run hidup → pesan chat = steer; OFF & tanpa run → chat biasa. Strip status
// (chip/gate/pause) tetap di bar; observasi alur = tab TEAM (canvas delegasi,
// run = root conductor, fase implisit); reassign step = tab TASK. Provider =
// mock lokal (fallback "ok" — step selesai instan).
import { expect, test } from "@playwright/test";
import { openProjectWithLead } from "./lib";

const API = "http://127.0.0.1:3291";

test("FLOW-5: start via chat → gate approve ×6 → done; alur terlihat di Team", async ({ page, request }) => {
  test.setTimeout(120_000);

  // project segre untuk spec ini (nama unik → aman paralel/ulang)
  const name = `Flow E2E ${Date.now()}`;
  const r = await request.post(`${API}/api/projects`, { data: { name, description: "workflow board e2e" } });
  expect(r.ok()).toBeTruthy();
  const { project } = (await r.json()) as { project: { id: string } };

  // UI: buka app → pilih project → CHAT (persona default conductor)
  await openProjectWithLead(page, name);

  // nyalakan Workflow Mode (sejajar Hardcore Mode) → bar armed muncul
  const toggle = page.getByRole("button", { name: "Ad-hoc Mode" });
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  await toggle.click();
  const bar = page.getByLabel("Workflow run bar");
  await expect(bar).toBeVisible({ timeout: 10_000 });

  // SATU COMPOSER: pesan pertama = brief run (mock cepat: chip bisa langsung
  // "awaiting approval" melewati "running")
  await page
    .getByPlaceholder("Describe the goal — this message starts a workflow run")
    .fill("Build a small landing page from scratch.");
  await page.getByLabel("Send").click();
  await expect(bar.getByText(/^(running|awaiting approval)$/)).toBeVisible({ timeout: 20_000 });

  // observasi: tab Team — run tampil sbg root delegasi (fase implisit)
  await page.getByRole("tab", { name: "Team" }).click();
  const canvas = page.getByLabel("Delegation hierarchy diagram — canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas.getByText(/Workflow ·/, { exact: false })).toBeVisible({ timeout: 20_000 });
  await expect(canvas.getByLabel("delegation branch").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: "Chat" }).click();

  // 6 gerbang (planning..docs; deliverable gate off) — approve satu-satu dari chat
  for (let i = 0; i < 6; i++) {
    const approve = bar.getByRole("button", { name: "Approve", exact: true });
    await expect(approve).toBeVisible({ timeout: 30_000 });
    await approve.click();
  }

  // run done: chip status di bar
  await expect(bar.getByText("done", { exact: true })).toBeVisible({ timeout: 60_000 });
});

test("FLOW-6: steer + reassign (Task) + pause/resume mid-run — semua via chat", async ({ page, request }) => {
  test.setTimeout(120_000);

  const name = `Steer E2E ${Date.now()}`;
  const r = await request.post(`${API}/api/projects`, { data: { name, description: "steering e2e" } });
  expect(r.ok()).toBeTruthy();

  await openProjectWithLead(page, name);
  await page.getByRole("button", { name: "Ad-hoc Mode" }).click(); // Workflow Mode
  const bar = page.getByLabel("Workflow run bar");
  await expect(bar).toBeVisible({ timeout: 10_000 });
  await page
    .getByPlaceholder("Describe the goal — this message starts a workflow run")
    .fill("Build a product landing page.");
  await page.getByLabel("Send").click();
  await expect(bar.getByRole("button", { name: "Approve", exact: true })).toBeVisible({ timeout: 30_000 }); // gate planning

  // 1) steer mid-run lewat COMPOSER (run hidup → pesan = steer) — instruksi
  //    tercatat sbg bubble user di thread
  const steerBox = page.getByPlaceholder("Steer the running workflow — e.g. keep scope minimal");
  await steerBox.fill("Keep the scope minimal for v1.");
  await page.getByLabel("Send").click();
  await expect(steerBox).toHaveValue("");
  await expect(page.getByText("Keep the scope minimal for v1.").last()).toBeVisible();

  // 2) reassign step pending fase research → analyst — di TAB TASK (fokus assign)
  await page.getByRole("tab", { name: "Task" }).click();
  // P2-PM-4/5: dashboard progres tampil di atas board (run hidup → iterasi #1)
  const dash = page.getByLabel("Project dashboard");
  await expect(dash).toBeVisible({ timeout: 10_000 });
  await expect(dash.getByText("Iterations")).toBeVisible();
  await expect(dash.getByText("#1", { exact: true })).toBeVisible();
  const research = page.locator('[data-phase="research"]');
  await expect(research).toBeVisible({ timeout: 15_000 });
  await research.getByLabel("Reassign tech-notes").selectOption("yui-analyst");
  await expect(
    research.locator('[data-step="tech-notes"] [title="yui-analyst"]'),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("tab", { name: "Chat" }).click();

  // 3) pause saat gate → status paused LANGSUNG (eksekusi berhenti) → approve
  //    gate sambil paused → tetap paused → resume → lanjut fase berikut
  const pauseResp = page.waitForResponse((res) => res.url().includes("/pause"));
  await bar.getByRole("button", { name: "Pause", exact: true }).click();
  await pauseResp;
  await expect(bar.getByText("paused", { exact: true })).toBeVisible({ timeout: 15_000 });
  await bar.getByRole("button", { name: "Approve", exact: true }).click();
  await page.waitForTimeout(800); // gerbang di-approve saat paused — harus TETAP paused
  await expect(bar.getByText("paused", { exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0); // banner gate hilang (diputuskan)
  await bar.getByRole("button", { name: "Resume", exact: true }).click();

  // 4) gerbang sisanya (research..docs ×5) → done
  for (let i = 0; i < 5; i++) {
    const approve = bar.getByRole("button", { name: "Approve", exact: true });
    await expect(approve).toBeVisible({ timeout: 30_000 });
    await approve.click();
  }
  await expect(bar.getByText("done", { exact: true })).toBeVisible({ timeout: 60_000 });
});
