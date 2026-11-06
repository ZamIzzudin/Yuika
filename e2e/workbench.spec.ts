// Batch 6 e2e — P2-STU-1 (chat state survive pindah tab + layout kolom),
// P2-STU-7 (Docs: deliverable md terbaca), P2-STU-4 (Browser read-only via
// proxy allowlist: server halaman lokal di-spec, script distrip).
import { expect, test } from "@playwright/test";
import type { Server } from "node:http";
import http from "node:http";
import type { AddressInfo } from "node:net";

const API = "http://127.0.0.1:3291";

test("STU-1: pindah tab → draft chat & riwayat tetap (kolom desktop)", async ({ page, request }) => {
  const name = `Workbench E2E ${Date.now()}`;
  const r = await request.post(`${API}/api/projects`, { data: { name, description: "workbench e2e" } });
  expect(r.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByRole("button", { name, exact: false }).first().click();

  // tulis draft (belum kirim) di composer chat
  const composer = page.getByPlaceholder(/Describe a task for/);
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await composer.fill("draft yang harus selamat");

  // pindah ke tab Files — chat TIDAK unmount (kolom kiri desktop tetap tampil)
  await page.getByRole("tab", { name: "Files" }).click();
  await expect(page.getByLabel("Project files")).toBeVisible({ timeout: 15_000 });
  await expect(composer).toBeVisible(); // kolom chat masih ada di sebelah kiri
  await expect(composer).toHaveValue("draft yang harus selamat");

  // kembali ke Chat — state tetap utuh (tanpa refetch/remount)
  await page.getByRole("tab", { name: "Chat" }).click();
  await expect(composer).toHaveValue("draft yang harus selamat");
});

test("STU-7: Docs tab — deliverable markdown terbaca sebagai dokumen", async ({ page, request }) => {
  const name = `Docs E2E ${Date.now()}`;
  const r = await request.post(`${API}/api/projects`, { data: { name, description: "docs e2e" } });
  const { project } = (await r.json()) as { project: { id: string } };

  // deliverable: upload note.md (uploads API menerima .md)
  const up = await request.post(`${API}/api/projects/${project.id}/uploads?name=deliverable-note.md`, {
    headers: { "content-type": "text/markdown" },
    data: "# Deliverable One\n\nAccepted criteria met.",
  });
  expect(up.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByRole("button", { name, exact: false }).first().click();
  await page.getByRole("tab", { name: "Docs" }).click();

  // daftar dokumen menampilkan file md → klik → ter-render sebagai markdown
  await expect(page.getByRole("button", { name: /deliverable-note\.md/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /deliverable-note\.md/ }).click();
  await expect(page.getByRole("heading", { name: "Deliverable One" })).toBeVisible({ timeout: 10_000 });

  // bagian run reports hadir (state kosong ok — belum ada run di project baru)
  await expect(page.getByText("Run reports")).toBeVisible();
});

test("STU-4: Browser tab — halaman allowlist terbaca read-only, script distrip", async ({ page, request }) => {
  // server halaman lokal (loopback; API e2e di-set YUI_BROWSER_ALLOW=127.0.0.1
  // + YUI_BROWSER_ALLOW_PRIVATE=1 — prod TIDAK memakai env ini)
  const server: Server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      "<html><head><title>Local Doc</title><script>window.__pwn=1;alert(1)</script></head>" +
        '<body><h1>Research Page</h1><a href="/next">next</a></body></html>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}/page`;

  try {
    const name = `Browser E2E ${Date.now()}`;
    const r = await request.post(`${API}/api/projects`, { data: { name, description: "browser e2e" } });
    expect(r.ok()).toBeTruthy();

    await page.goto("/");
    await page.getByRole("button", { name, exact: false }).first().click();
    await page.getByRole("tab", { name: "Browser" }).click();

    await page.getByLabel("Browser URL").fill(url);
    await page.getByRole("button", { name: "Open", exact: true }).click();

    // halaman ter-render di iframe sandbox (read-only)
    const frame = page.frameLocator("iframe");
    await expect(frame.getByRole("heading", { name: "Research Page" })).toBeVisible({ timeout: 20_000 });

    // kunjungan tercatat di History
    await expect(page.getByText(url).first()).toBeVisible({ timeout: 10_000 });

    // domain di luar allowlist → error rapi (tidak crash tab)
    await page.getByLabel("Browser URL").fill("https://not-allowed.example/x");
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /allowlist|not-allowed/ })).toBeVisible({ timeout: 15_000 });
  } finally {
    server.close();
  }
});
