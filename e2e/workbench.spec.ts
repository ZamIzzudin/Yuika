// Batch 6 e2e, P2-STU-1 (chat state survive pindah tab + layout kolom),
// P2-STU-7 (Docs: deliverable md terbaca), P2-STU-4 (Browser read-only via
// proxy allowlist: server halaman lokal di-spec, script distrip).
import { expect, test } from "@playwright/test";
import type { Server } from "node:http";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { openProjectWithLead } from "./lib";

const API = "http://127.0.0.1:3291";

test("STU-1: pindah tab → chat tertutup penuh, draft tetap selamat", async ({ page, request }) => {
  const name = `Workbench E2E ${Date.now()}`;
  const r = await request.post(`${API}/api/projects`, { data: { name, description: "workbench e2e" } });
  expect(r.ok()).toBeTruthy();

  await openProjectWithLead(page, name);

  // tulis draft (belum kirim) di composer chat
  const composer = page.getByPlaceholder(/Describe a task for/);
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await composer.fill("draft yang harus selamat");

  // pindah ke tab Files, SATU TAB SATU HALAMAN: chat tertutup penuh,
  // tab aktif lebar penuh (bukan lagi layout kolom Batch 6 awal)
  await page.getByRole("tab", { name: "Files" }).click();
  await expect(page.getByLabel("Project files")).toBeVisible({ timeout: 15_000 });
  await expect(composer).toBeHidden();

  // kembali ke Chat, state tetap utuh (komponen disembunyikan, bukan unmount)
  await page.getByRole("tab", { name: "Chat" }).click();
  await expect(composer).toBeVisible();
  await expect(composer).toHaveValue("draft yang harus selamat");
});

test("STU-7 (merge ke Files): upload md → Files tab ter-render markdown + seksi Run reports", async ({ page, request }) => {
  const name = `Docs E2E ${Date.now()}`;
  const r = await request.post(`${API}/api/projects`, { data: { name, description: "docs e2e" } });
  const { project } = (await r.json()) as { project: { id: string } };

  // deliverable: upload note.md (uploads API menerima .md)
  const up = await request.post(`${API}/api/projects/${project.id}/uploads?name=deliverable-note.md`, {
    headers: { "content-type": "text/markdown" },
    data: "# Deliverable One\n\nAccepted criteria met.",
  });
  expect(up.ok()).toBeTruthy();

  await openProjectWithLead(page, name);
  // tab Docs sudah dihapus, fungsinya diserap tab Files (keputusan user)
  await page.getByRole("tab", { name: "Files" }).click();

  // tree menampilkan file (folder uploads) → klik file → default ter-render markdown
  const fileBtn = page.getByRole("tree").getByRole("button", { name: /deliverable-note\.md/ });
  await expect(fileBtn).toBeVisible({ timeout: 15_000 });
  await fileBtn.click();
  await expect(page.getByRole("heading", { name: "Deliverable One" })).toBeVisible({ timeout: 10_000 });

  // toggle Source → mentah; kembali Rendered
  await page.getByRole("button", { name: "source" }).click();
  await expect(page.getByText("# Deliverable One")).toBeVisible();
  await page.getByRole("button", { name: "rendered" }).click();
  await expect(page.getByRole("heading", { name: "Deliverable One" })).toBeVisible();

  // seksi Run reports hadir (state kosong ok, belum ada run di project baru)
  await expect(page.getByText("Run reports")).toBeVisible();
});

test("STU-4 (Batch 14a++): policy browser di Config + fetch reader via REST", async ({ page, request }) => {
  // Reader UI dihapus dari tab (user 2026-11), policy kini di Config →
  // Browser; halaman tetap bisa di-fetch via REST (sanitasi jalan). Server
  // lokal loopback; API e2e di-set YUI_BROWSER_ALLOW=127.0.0.1 +
  // YUI_BROWSER_ALLOW_PRIVATE=1 (prod TIDAK memakai env ini).
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
    const pid = ((await r.json()) as { project: { id: string } }).project.id;

    await openProjectWithLead(page, name);

    // toggle policy di Config → Browser (persist .yuika/browser.json)
    await page.getByRole("tab", { name: "Config" }).click();
    await page.getByRole("button", { name: "Browser", exact: true }).click();
    await page.getByRole("checkbox", { name: /Allow all public domains/ }).click();
    await expect
      .poll(async () => {
        const p = (await (
          await request.get(`${API}/api/projects/${pid}/browser/policy`)
        ).json()) as { allowAll?: boolean };
        return p.allowAll === true;
      })
      .toBeTruthy();

    // host di luar allowlist ditolak sebelum allowAll… kini ON → fetch OK +
    // script distrip oleh sanitizer (pertahanan server tetap jalan).
    const fr = await request.get(`${API}/api/projects/${pid}/browser/fetch?url=${encodeURIComponent(url)}`);
    expect(fr.ok()).toBeTruthy();
    const body = (await fr.json()) as { html: string };
    expect(body.html).not.toContain("window.__pwn");
    expect(body.html).toContain("Research Page");

    // allowAll OFF kembali → host luar allowlist ditolak rapi
    await page.getByRole("checkbox", { name: /Allow all public domains/ }).click();
    const denied = await request.get(
      `${API}/api/projects/${pid}/browser/fetch?url=${encodeURIComponent("https://not-allowed.example/x")}`,
    );
    expect(denied.status()).toBe(403);
  } finally {
    server.close();
  }
});

test("FLOW gate: pintu Workflow dari chat conductor (keputusan user: flow = alat orchestrator)", async ({ page, request }) => {
  test.setTimeout(240_000); // suite paralel: langkah UI bertambah (TeamSetup)
  const name = `Gate Flow E2E ${Date.now()}`;
  const r = await request.post(`${API}/api/projects`, { data: { name, description: "flow gate e2e" } });
  expect(r.ok()).toBeTruthy();

  await openProjectWithLead(page, name);

  // persona default = conductor → toggle Workflow Mode di sebelah Hardcore Mode
  const toggle = page.getByRole("button", { name: "Ad-hoc Mode" });
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  await toggle.click(); // → Workflow Mode: bar armed + composer = brief
  await expect(page.getByRole("button", { name: "Workflow Mode" })).toBeVisible();
  const bar = page.getByLabel("Workflow run bar");
  await expect(bar).toBeVisible();
  await expect(bar.getByText("Workflow armed", { exact: false })).toBeVisible();
  await expect(
    page.getByPlaceholder("Describe the goal, this message starts a workflow run"),
  ).toBeVisible();

  // (tombol header Workflow dihapus 2026-11, menumpuk status persona; tab
  // Team di tablist atas = pintu yang sama)
  await page.getByRole("tab", { name: "Team" }).click();
  await expect(page.getByLabel("Delegation hierarchy diagram, canvas")).toBeVisible({ timeout: 15_000 });
});
