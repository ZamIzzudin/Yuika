// P0-QA-1, E2E smoke: skenario demo §2 (pilih Conductor → tugas riset →
// delegasi Scholar → selesai → replay tahan-refresh). Provider = mock lokal
// (e2e/mock-provider.mjs), deterministik, tanpa biaya, tanpa API key nyata.
import { expect, test } from "@playwright/test";

const MOCK = "http://127.0.0.1:3299";

/** Antri jawaban mock (FIFO, urutan panggilan provider). */
async function enqueue(request: import("@playwright/test").APIRequestContext, scripts: unknown[]): Promise<void> {
  const r = await request.post(`${MOCK}/__script`, { data: scripts });
  expect(r.ok()).toBeTruthy();
}

test("demo §2: Conductor → riset → delegasi Scholar → selesai → replay", async ({ page, request }) => {
  test.setTimeout(120_000);

  // Script provider, urutan:
  // 1. Turn 1 Conductor → delegate_task ke yui-scholar.
  // 2. Turn anak (Scholar) → teks riset selesai.
  // 3. Turn 2 Conductor (setelah tool result) → ringkasan final.
  await enqueue(request, [
    {
      reasoning: "memecah tugas",
      toolCalls: [{ id: "call_1", name: "delegate_task", args: { persona: "yui-scholar", goal: "Riset framework JS modern dan tulis ringkasan" } }],
    },
    { text: "Riset selesai. Ketiga framework matang; pilihan bergantung kebutuhan tim." },
    { text: "Ringkasan riset Scholar sudah masuk. Laporan final terlampir di bawah." },
  ]);

  // 1. Halaman utama → konstelasi persona → pilih Conductor ("Maestro Yui")
  const logs: string[] = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`));
  await page.goto("/");
  const sessionReady = page.waitForResponse((r) => r.url().endsWith("/api/sessions") && r.request().method() === "POST");
  // Batch 16: freespace dihapus, sesi WAJIB di dalam project. Buat project
  // dari kartu HOME (modal), assign Maestro di TeamSetup, mulai sesi.
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByPlaceholder("Project Name").fill(`Smoke Flow ${Date.now()}`);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "Maestro Yui", exact: true }).click();
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect(page.getByPlaceholder(/Describe a task/)).toBeVisible({ timeout: 30_000 });

  // 2. Kirim tugas riset
  const prompt = "Riset framework JS modern, lalu tulis ringkasan singkat.";
  await page.getByPlaceholder(/Describe a task/).fill(prompt);
  await page.keyboard.press("Enter");

  // 3. Kartu delegasi Scholar muncul (delegation.started via SSE)
  try {
    await expect(page.getByText("Delegation · scholar")).toBeVisible({ timeout: 60_000 });
  } catch (e) {
    await page.screenshot({ path: "e2e/.tmp/deleg-fail.png", fullPage: true });
    const fs = await import("node:fs");
    fs.writeFileSync("e2e/.tmp/console.txt", logs.join("\n"));
    throw e;
  }

  // 4. Jawaban final Conductor tampil (message.done)
  await expect(page.getByText(/Laporan final terlampir/).first()).toBeVisible({ timeout: 60_000 });

  // 5. Replay tahan-refresh: events sesi persist di DB, dibaca ulang via REST
  //    (UI reload kembali ke picker, jadi resume dibuktikan di lapisan data).
  const sess = (await (await sessionReady).json()) as { sessionId: string };
  expect(sess.sessionId).toBeTruthy();
  const r = await request.get(`http://127.0.0.1:3291/api/sessions/${sess.sessionId}/events`);
  const body = await r.text();
  expect(body).toContain("delegation.started");
  expect(body).toContain("message.done");
  expect(body).toContain("Riset selesai");

  // 6. Delete project kini lewat POPUP konfirmasi (bukan aksi langsung):
  //    buka HOME (logo sidebar) → kartu New project (modal) → project dummy →
  //    tombol 🗑 (opacity-0 → includeHidden+force) → dialog “Delete project” →
  //    Cancel (popup tervalidasi, data tak berubah).
  await page.getByRole("button", { name: "Home, all projects" }).click();
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByPlaceholder("Project Name").fill("Popup smoke check");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const row = page.getByRole("button", { name: /^Popup smoke check/ }).first();
  await expect(row).toBeVisible();
  const trash = page
    .getByRole("button", { name: "Delete project Popup smoke check" })
    .first();
  await trash.click({ force: true });
  const dlg = page.getByRole("dialog", { name: "Delete project" });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole("button", { name: "Delete permanently" })).toBeVisible();
  await expect(dlg.getByText("Popup smoke check")).toBeVisible();
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(dlg).toBeHidden();
  await expect(row).toBeVisible(); // batal → project tetap ada
});
